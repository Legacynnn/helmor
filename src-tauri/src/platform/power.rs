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
/// environments where power management is irrelevant. On macOS the
/// real backend is always `IoKitBackend`, so this is never constructed
/// there — silence the resulting dead-code lint without dropping the
/// type from the platform-agnostic API.
#[cfg_attr(target_os = "macos", allow(dead_code))]
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

#[cfg(target_os = "macos")]
mod macos {
    use super::SleepAssertionBackend;
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    use std::ffi::c_void;

    /// Opaque `CFStringRef` for the FFI boundary. We pass CFStrings we
    /// build ourselves and never inspect IOKit's, so a raw pointer keeps
    /// us off the `core-foundation-sys` direct dependency.
    type CFStringRef = *const c_void;

    /// `kIOPMAssertionLevelOn` — assertion is active.
    const ASSERTION_LEVEL_ON: u32 = 255;
    /// `kIOReturnSuccess`.
    const IO_RETURN_SUCCESS: i32 = 0;
    /// Raw value of `kIOPMAssertPreventUserIdleSystemSleep`: blocks idle
    /// *system* sleep while still letting the display sleep.
    const ASSERTION_TYPE: &str = "PreventUserIdleSystemSleep";
    /// Human-readable label shown in `pmset -g assertions`.
    const ASSERTION_NAME: &str = "Helmor is running an agent";

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: CFStringRef,
            assertion_level: u32,
            assertion_name: CFStringRef,
            assertion_id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(assertion_id: u32) -> i32;
    }

    pub struct IoKitBackend;

    impl SleepAssertionBackend for IoKitBackend {
        fn acquire(&self) -> Option<u32> {
            // Keep both CFStrings alive across the call.
            let assertion_type = CFString::new(ASSERTION_TYPE);
            let assertion_name = CFString::new(ASSERTION_NAME);
            let mut id: u32 = 0;
            // SAFETY: both CFString locals outlive the call; `id` is a
            // valid out-param. The CFStringRefs are non-null for the
            // lifetime of the call.
            let result = unsafe {
                IOPMAssertionCreateWithName(
                    assertion_type.as_concrete_TypeRef() as CFStringRef,
                    ASSERTION_LEVEL_ON,
                    assertion_name.as_concrete_TypeRef() as CFStringRef,
                    &mut id,
                )
            };
            if result == IO_RETURN_SUCCESS {
                tracing::debug!(assertion_id = id, "Acquired prevent-idle-sleep assertion");
                Some(id)
            } else {
                tracing::warn!(
                    io_return = result,
                    "IOPMAssertionCreateWithName failed; agents may not survive idle sleep"
                );
                None
            }
        }

        fn release(&self, id: u32) {
            // SAFETY: `id` was returned by a successful
            // IOPMAssertionCreateWithName; releasing once is correct.
            let result = unsafe { IOPMAssertionRelease(id) };
            if result == IO_RETURN_SUCCESS {
                tracing::debug!(assertion_id = id, "Released prevent-idle-sleep assertion");
            } else {
                tracing::warn!(
                    io_return = result,
                    assertion_id = id,
                    "IOPMAssertionRelease failed"
                );
            }
        }
    }
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
