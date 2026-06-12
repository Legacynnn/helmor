//! Bounding and coalescing for forge CLI subprocesses.
//!
//! Two independent primitives:
//! - [`acquire_forge_permit`] — a process-global counting semaphore so no
//!   more than `MAX_CONCURRENT_FORGE_COMMANDS` forge subprocesses run at once.
//! - [`run_cached`] — in-flight dedup + short-TTL cache for idempotent reads.

use std::sync::{Condvar, Mutex, OnceLock};

/// Maximum number of forge CLI subprocesses allowed to run concurrently.
const MAX_CONCURRENT_FORGE_COMMANDS: usize = 4;

struct Semaphore {
    available: Mutex<usize>,
    cv: Condvar,
}

impl Semaphore {
    fn new(permits: usize) -> Self {
        Self {
            available: Mutex::new(permits),
            cv: Condvar::new(),
        }
    }

    fn acquire(&self) -> SemaphoreGuard<'_> {
        let mut available = self.available.lock().unwrap();
        while *available == 0 {
            available = self.cv.wait(available).unwrap();
        }
        *available -= 1;
        SemaphoreGuard { semaphore: self }
    }

    fn release(&self) {
        let mut available = self.available.lock().unwrap();
        *available += 1;
        self.cv.notify_one();
    }
}

/// RAII guard; releases the permit on drop.
pub(crate) struct SemaphoreGuard<'a> {
    semaphore: &'a Semaphore,
}

impl Drop for SemaphoreGuard<'_> {
    fn drop(&mut self) {
        self.semaphore.release();
    }
}

fn forge_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(MAX_CONCURRENT_FORGE_COMMANDS))
}

/// Acquire one global forge-command permit. Blocks until one is free.
pub(crate) fn acquire_forge_permit() -> SemaphoreGuard<'static> {
    forge_semaphore().acquire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn semaphore_caps_concurrency() {
        let semaphore = Arc::new(Semaphore::new(2));
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        let handles: Vec<_> = (0..6)
            .map(|_| {
                let semaphore = Arc::clone(&semaphore);
                let active = Arc::clone(&active);
                let peak = Arc::clone(&peak);
                thread::spawn(move || {
                    let _permit = semaphore.acquire();
                    let now = active.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(now, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(50));
                    active.fetch_sub(1, Ordering::SeqCst);
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        assert!(
            peak.load(Ordering::SeqCst) <= 2,
            "peak concurrency exceeded the cap: {}",
            peak.load(Ordering::SeqCst)
        );
    }
}
