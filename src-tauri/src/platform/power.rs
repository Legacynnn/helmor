//! Prevent macOS idle system sleep while agents are running.
//!
//! `ActiveStreams` owns one [`SleepGuard`] and drives it from the
//! `0 → 1` / `1 → 0` transitions of its in-flight stream map: the first
//! active stream acquires a power assertion that blocks idle *system*
//! sleep (the display is still allowed to sleep), and the last one to
//! finish releases it. Keep-awake is best-effort — a failed assertion
//! is logged and ignored, never blocking a send. macOS auto-releases a
//! process's assertions on exit, so a crash cannot strand the Mac awake.
//!
//! Scope is deliberately idle-sleep only. Lid-closed-on-battery
//! (clamshell) sleep is enforced by the SMC and a normal assertion does
//! not override it; that would need a privileged helper and is out of
//! scope here.

use std::sync::Mutex;

/// Pluggable power-assertion backend. The real implementation talks to
/// IOKit on macOS; tests and non-macOS builds use a no-op / recording
/// double so the ref-count logic in [`SleepGuard`] is verifiable without
/// touching the OS.
pub trait SleepAssertionBackend: Send + Sync {
    /// Acquire an assertion. Returns its id on success, `None` on
    /// failure (already logged by the backend).
    fn acquire(&self) -> Option<u32>;
    /// Release a previously-acquired assertion.
    fn release(&self, id: u32);
}

/// Does nothing. Used on non-macOS platforms and as a default in
/// environments where power management is irrelevant.
pub struct NoopBackend;

impl SleepAssertionBackend for NoopBackend {
    fn acquire(&self) -> Option<u32> {
        None
    }
    fn release(&self, _id: u32) {}
}

/// Ref-counted holder of a single power assertion. `on_count_change` is
/// the only entry point: callers pass the active-stream count before and
/// after each mutation (computed while they hold their own lock) and the
/// guard acquires on the first stream / releases on the last.
pub struct SleepGuard {
    backend: Box<dyn SleepAssertionBackend>,
    assertion_id: Mutex<Option<u32>>,
}

impl SleepGuard {
    /// Construct with an explicit backend (used by tests).
    pub fn new(backend: Box<dyn SleepAssertionBackend>) -> Self {
        Self {
            backend,
            assertion_id: Mutex::new(None),
        }
    }

    /// React to a change in the active-stream count.
    ///
    /// `prev == 0 && next > 0` acquires; `prev > 0 && next == 0`
    /// releases; anything else is a no-op. Idempotent against
    /// acquire-failures: if `acquire` returned `None`, the release branch
    /// simply finds no id to release.
    pub fn on_count_change(&self, prev: usize, next: usize) {
        if prev == 0 && next > 0 {
            let id = self.backend.acquire();
            *self.assertion_id.lock().unwrap() = id;
        } else if prev > 0 && next == 0 {
            if let Some(id) = self.assertion_id.lock().unwrap().take() {
                self.backend.release(id);
            }
        }
    }
}

impl Default for SleepGuard {
    fn default() -> Self {
        Self::new(default_backend())
    }
}

#[cfg(target_os = "macos")]
fn default_backend() -> Box<dyn SleepAssertionBackend> {
    Box::new(macos::IoKitBackend)
}

#[cfg(not(target_os = "macos"))]
fn default_backend() -> Box<dyn SleepAssertionBackend> {
    Box::new(NoopBackend)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Records acquire/release calls and hands out incrementing ids.
    #[derive(Default)]
    struct RecordingBackend {
        acquires: AtomicUsize,
        releases: AtomicUsize,
        next_id: AtomicUsize,
    }

    impl SleepAssertionBackend for Arc<RecordingBackend> {
        fn acquire(&self) -> Option<u32> {
            self.acquires.fetch_add(1, Ordering::SeqCst);
            let id = self.next_id.fetch_add(1, Ordering::SeqCst) as u32 + 1;
            Some(id)
        }
        fn release(&self, _id: u32) {
            self.releases.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn guard_with() -> (SleepGuard, Arc<RecordingBackend>) {
        let backend = Arc::new(RecordingBackend::default());
        (SleepGuard::new(Box::new(backend.clone())), backend)
    }

    #[test]
    fn acquires_on_zero_to_one() {
        let (guard, backend) = guard_with();
        guard.on_count_change(0, 1);
        assert_eq!(backend.acquires.load(Ordering::SeqCst), 1);
        assert_eq!(backend.releases.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn does_not_reacquire_within_active_window() {
        let (guard, backend) = guard_with();
        guard.on_count_change(0, 1);
        guard.on_count_change(1, 2);
        guard.on_count_change(2, 1);
        assert_eq!(backend.acquires.load(Ordering::SeqCst), 1);
        assert_eq!(backend.releases.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn releases_on_one_to_zero() {
        let (guard, backend) = guard_with();
        guard.on_count_change(0, 1);
        guard.on_count_change(1, 0);
        assert_eq!(backend.acquires.load(Ordering::SeqCst), 1);
        assert_eq!(backend.releases.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn full_cycle_acquires_and_releases_exactly_once() {
        let (guard, backend) = guard_with();
        guard.on_count_change(0, 1);
        guard.on_count_change(1, 2);
        guard.on_count_change(2, 3);
        guard.on_count_change(3, 2);
        guard.on_count_change(2, 1);
        guard.on_count_change(1, 0);
        assert_eq!(backend.acquires.load(Ordering::SeqCst), 1);
        assert_eq!(backend.releases.load(Ordering::SeqCst), 1);
    }
}
