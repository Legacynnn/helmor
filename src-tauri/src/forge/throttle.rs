//! Bounding and coalescing for forge CLI subprocesses.
//!
//! Two independent primitives:
//! - [`acquire_forge_permit`] — a process-global counting semaphore so no
//!   more than `MAX_CONCURRENT_FORGE_COMMANDS` forge subprocesses run at once.
//! - [`run_cached`] — in-flight dedup + short-TTL cache for idempotent reads.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use super::command::CommandOutput;

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

/// Result shape stored in the cache. `io::Error` is not `Clone`, so failures
/// are stringified for sharing — but see [`run_cached`]: errors are evicted
/// immediately and never actually served from cache.
#[allow(dead_code)]
type ShareableOutput = Result<CommandOutput, String>;

#[allow(dead_code)]
enum SlotState {
    Pending,
    Ready(ShareableOutput),
}

#[allow(dead_code)]
struct Slot {
    state: Mutex<SlotState>,
    cv: Condvar,
}

#[allow(dead_code)]
struct CacheEntry {
    inserted: Instant,
    slot: Arc<Slot>,
}

#[allow(dead_code)]
fn read_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Run `compute` at most once per `key` per `ttl` window, coalescing
/// concurrent identical calls onto a single in-flight computation.
///
/// Use ONLY for idempotent reads (status queries, auth checks). Errors are
/// never cached: the failing entry is evicted so the next caller retries.
#[allow(dead_code)]
pub(crate) fn run_cached<F>(
    key: String,
    ttl: Duration,
    compute: F,
) -> std::io::Result<CommandOutput>
where
    F: FnOnce() -> std::io::Result<CommandOutput>,
{
    let (slot, is_owner) = {
        let mut cache = read_cache().lock().unwrap();
        match cache.get(&key) {
            Some(entry) if entry.inserted.elapsed() < ttl => (Arc::clone(&entry.slot), false),
            _ => {
                let slot = Arc::new(Slot {
                    state: Mutex::new(SlotState::Pending),
                    cv: Condvar::new(),
                });
                cache.insert(
                    key.clone(),
                    CacheEntry {
                        inserted: Instant::now(),
                        slot: Arc::clone(&slot),
                    },
                );
                (slot, true)
            }
        }
    };

    if is_owner {
        let computed = compute();
        let shareable: ShareableOutput = match &computed {
            Ok(output) => Ok(output.clone()),
            Err(error) => Err(error.to_string()),
        };

        {
            let mut state = slot.state.lock().unwrap();
            *state = SlotState::Ready(shareable.clone());
            slot.cv.notify_all();
        }

        if shareable.is_err() {
            // Never serve a stale failure; let the next caller retry fresh.
            read_cache().lock().unwrap().remove(&key);
        }

        return shareable.map_err(std::io::Error::other);
    }

    // Waiter: block until the owner publishes a result.
    let mut state = slot.state.lock().unwrap();
    loop {
        match &*state {
            SlotState::Ready(value) => return value.clone().map_err(std::io::Error::other),
            SlotState::Pending => state = slot.cv.wait(state).unwrap(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn run_cached_returns_cached_value_within_ttl() {
        let calls = Arc::new(AtomicUsize::new(0));
        let ttl = Duration::from_secs(60);

        let compute = || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(sample_output("hello"))
        };

        let first = run_cached("k".to_string(), ttl, compute).unwrap();
        let second = run_cached("k".to_string(), ttl, || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(sample_output("hello"))
        })
        .unwrap();

        assert_eq!(first.stdout, "hello");
        assert_eq!(second.stdout, "hello");
        assert_eq!(calls.load(Ordering::SeqCst), 1, "compute should run once");
    }

    #[test]
    fn run_cached_recomputes_after_ttl_expires() {
        let calls = Arc::new(AtomicUsize::new(0));
        let ttl = Duration::from_millis(40);

        let run = || {
            let calls = Arc::clone(&calls);
            run_cached("expiry".to_string(), ttl, move || {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(sample_output("v"))
            })
            .unwrap()
        };

        run();
        thread::sleep(Duration::from_millis(60));
        run();

        assert_eq!(calls.load(Ordering::SeqCst), 2, "expired entry recomputes");
    }

    #[test]
    fn run_cached_dedupes_concurrent_identical_calls() {
        let calls = Arc::new(AtomicUsize::new(0));
        let ttl = Duration::from_secs(60);

        let owner = {
            let calls = Arc::clone(&calls);
            thread::spawn(move || {
                run_cached("shared".to_string(), ttl, move || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(80));
                    Ok(sample_output("shared-value"))
                })
                .unwrap()
            })
        };

        // Give the owner time to insert its Pending slot before waiters race in.
        thread::sleep(Duration::from_millis(10));

        let waiters: Vec<_> = (0..4)
            .map(|_| {
                let calls = Arc::clone(&calls);
                thread::spawn(move || {
                    run_cached("shared".to_string(), ttl, move || {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Ok(sample_output("shared-value"))
                    })
                    .unwrap()
                })
            })
            .collect();

        let mut outputs = vec![owner.join().unwrap()];
        for waiter in waiters {
            outputs.push(waiter.join().unwrap());
        }

        assert_eq!(calls.load(Ordering::SeqCst), 1, "only one underlying spawn");
        assert_eq!(outputs.len(), 5);
        for output in outputs {
            assert_eq!(output.stdout, "shared-value");
        }
    }

    #[test]
    fn run_cached_errors_are_not_cached() {
        let calls = Arc::new(AtomicUsize::new(0));
        let ttl = Duration::from_secs(60);

        let run = || {
            let calls = Arc::clone(&calls);
            run_cached("err".to_string(), ttl, move || {
                calls.fetch_add(1, Ordering::SeqCst);
                Err(std::io::Error::other("boom"))
            })
        };

        assert!(run().is_err());
        assert!(run().is_err());
        assert_eq!(
            calls.load(Ordering::SeqCst),
            2,
            "errors retry, never cached"
        );
    }

    #[test]
    fn run_cached_error_propagates_to_concurrent_waiters() {
        let ttl = Duration::from_secs(60);

        let owner = thread::spawn(move || {
            run_cached("err-concurrent".to_string(), ttl, move || {
                thread::sleep(Duration::from_millis(60));
                Err::<CommandOutput, _>(std::io::Error::other("boom"))
            })
        });

        thread::sleep(Duration::from_millis(10));

        let waiters: Vec<_> = (0..4)
            .map(|_| {
                thread::spawn(move || {
                    run_cached("err-concurrent".to_string(), ttl, move || {
                        Err::<CommandOutput, _>(std::io::Error::other("boom"))
                    })
                })
            })
            .collect();

        let mut results = vec![owner.join().unwrap()];
        for waiter in waiters {
            results.push(waiter.join().unwrap());
        }

        assert!(
            results.iter().all(|r| r.is_err()),
            "all callers receive the error"
        );
    }

    fn sample_output(stdout: &str) -> CommandOutput {
        CommandOutput {
            stdout: stdout.to_string(),
            stderr: String::new(),
            success: true,
            status: Some(0),
        }
    }

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
