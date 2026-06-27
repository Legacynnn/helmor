# Keep the Mac Awake While Agents Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent macOS idle system sleep while ≥1 agent/terminal stream is active, so agents keep running when the user steps away (lid open), instead of dying on a heartbeat timeout.

**Architecture:** A new `platform/power.rs` module exposes a `SleepGuard` ref-counter backed by a swappable `SleepAssertionBackend` trait (real IOKit impl on macOS, no-op elsewhere / in tests). `ActiveStreams` — the single source of truth for "is anything running" — owns one `SleepGuard` and drives it from the `0→1` / `1→0` transitions of its stream map, all under the existing map mutex. Acquire happens on the first stream, release on the last.

**Tech Stack:** Rust, IOKit framework FFI (`IOPMAssertionCreateWithName` / `IOPMAssertionRelease`), `core-foundation` crate (already a direct dependency) for CFStrings.

---

## File Structure

- **Create** `src-tauri/src/platform/power.rs` — the `SleepAssertionBackend` trait, the macOS `IoKitBackend` (FFI), the `NoopBackend`, the `SleepGuard` ref-counter, and a recording fake backend for tests. Single responsibility: own all power-assertion logic.
- **Modify** `src-tauri/src/platform/mod.rs` — register `pub mod power;`.
- **Modify** `src-tauri/src/agents/streaming/active_streams.rs` — add a `SleepGuard` field to `ActiveStreams`, drive `on_count_change` from every map mutation, add ref-count tests with a fake backend.

No new dependency. No schema/pipeline change (no snapshot-test impact). No frontend change.

---

## Task 1: `power.rs` — backend trait, no-op backend, `SleepGuard` ref-counter (platform-independent logic)

**Files:**
- Create: `src-tauri/src/platform/power.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: Register the module**

In `src-tauri/src/platform/mod.rs`, add the module line in alphabetical position (after `pub mod pty;` is fine; keep the existing order otherwise). The file currently ends:

```rust
pub mod paths;
pub mod power;
pub mod process;
pub mod pty;
pub mod shell;
```

(Insert `pub mod power;` between `paths` and `process`.)

- [ ] **Step 2: Write `power.rs` with the trait, no-op backend, fake backend, and `SleepGuard` — plus failing unit tests**

Create `src-tauri/src/platform/power.rs` with this exact content:

```rust
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
        // Three concurrent streams come and go.
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
```

> NOTE: this file references `macos::IoKitBackend`, which Task 2 adds. It will NOT compile until Task 2 is done on a macOS target. Tests in this task exercise only the platform-independent `SleepGuard` logic via the recording backend.

- [ ] **Step 3: Run the tests to verify they fail (compile error expected)**

Run: `cd src-tauri && cargo test --lib platform::power`
Expected: FAIL — compile error `failed to resolve: use of undeclared crate or module \`macos\`` (the `IoKitBackend` referenced in `default_backend` doesn't exist yet). This confirms the test target picks up the module; Task 2 supplies the missing impl.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform/power.rs src-tauri/src/platform/mod.rs
git commit -m "feat(power): add SleepGuard ref-counter and backend trait"
```

---

## Task 2: macOS IOKit backend (FFI)

**Files:**
- Modify: `src-tauri/src/platform/power.rs`

- [ ] **Step 1: Add the macOS backend module**

Append this `macos` module to `src-tauri/src/platform/power.rs`, after the `default_backend` functions and before the `#[cfg(test)]` module:

```rust
#[cfg(target_os = "macos")]
mod macos {
    use super::{SleepAssertionBackend};
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
                tracing::warn!(io_return = result, "IOPMAssertionCreateWithName failed; agents may not survive idle sleep");
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
                tracing::warn!(io_return = result, assertion_id = id, "IOPMAssertionRelease failed");
            }
        }
    }
}
```

- [ ] **Step 2: Build and run the power tests**

Run: `cd src-tauri && cargo test --lib platform::power`
Expected: PASS — all four `SleepGuard` tests pass and the crate compiles (the `macos::IoKitBackend` reference now resolves).

- [ ] **Step 3: Clippy clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform/power.rs
git commit -m "feat(power): add macOS IOKit prevent-idle-sleep backend"
```

---

## Task 3: Wire `SleepGuard` into `ActiveStreams`

**Files:**
- Modify: `src-tauri/src/agents/streaming/active_streams.rs`

- [ ] **Step 1: Write failing integration tests for the ref-count wiring**

In `src-tauri/src/agents/streaming/active_streams.rs`, add these tests inside the existing `#[cfg(test)] mod tests { ... }` block (after `has_active_for_workspace_tracks_handles`). They rely on a test constructor `with_sleep_backend` added in Step 3.

```rust
    #[derive(Default)]
    struct CountingBackend {
        acquires: std::sync::atomic::AtomicUsize,
        releases: std::sync::atomic::AtomicUsize,
    }

    impl crate::platform::power::SleepAssertionBackend for std::sync::Arc<CountingBackend> {
        fn acquire(&self) -> Option<u32> {
            self.acquires
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Some(1)
        }
        fn release(&self, _id: u32) {
            self.releases
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }
    }

    fn streams_with_counting_backend() -> (ActiveStreams, std::sync::Arc<CountingBackend>) {
        let backend = std::sync::Arc::new(CountingBackend::default());
        let guard = crate::platform::power::SleepGuard::new(Box::new(backend.clone()));
        (ActiveStreams::with_sleep_backend(guard), backend)
    }

    #[test]
    fn acquires_once_for_concurrent_streams_releases_on_last() {
        use std::sync::atomic::Ordering::SeqCst;
        let (streams, backend) = streams_with_counting_backend();

        assert!(streams.try_register_for_session(handle("r1", Some("s1"))));
        assert!(streams.try_register_for_session(handle("r2", Some("s2"))));
        assert_eq!(backend.acquires.load(SeqCst), 1);
        assert_eq!(backend.releases.load(SeqCst), 0);

        streams.unregister("r1");
        assert_eq!(backend.releases.load(SeqCst), 0); // still one active

        streams.unregister("r2");
        assert_eq!(backend.releases.load(SeqCst), 1); // last one out
        assert_eq!(backend.acquires.load(SeqCst), 1); // never re-acquired
    }

    #[test]
    fn rejected_duplicate_registration_does_not_acquire_again() {
        use std::sync::atomic::Ordering::SeqCst;
        let (streams, backend) = streams_with_counting_backend();

        assert!(streams.try_register_for_session(handle("r1", Some("s1"))));
        // Duplicate session id is rejected — must not change the count.
        assert!(!streams.try_register_for_session(handle("r2", Some("s1"))));
        assert_eq!(backend.acquires.load(SeqCst), 1);
        assert_eq!(backend.releases.load(SeqCst), 0);
    }

    #[test]
    fn terminal_session_participates_in_refcount() {
        use std::sync::atomic::Ordering::SeqCst;
        let (streams, backend) = streams_with_counting_backend();

        assert!(streams.set_session_active("s1", Some("ws-s1".into()), "terminal", true));
        assert_eq!(backend.acquires.load(SeqCst), 1);

        assert!(streams.set_session_active("s1", Some("ws-s1".into()), "terminal", false));
        assert_eq!(backend.releases.load(SeqCst), 1);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib active_streams`
Expected: FAIL — compile error: `no function or associated item named \`with_sleep_backend\` found for struct \`ActiveStreams\``.

- [ ] **Step 3: Add the `SleepGuard` field, constructors, and drive it from mutations**

Edit `src-tauri/src/agents/streaming/active_streams.rs`:

(a) Add the import near the top (after the existing `use uuid::Uuid;`):

```rust
use crate::platform::power::{SleepGuard};
```

(b) Replace the struct definition and its derive:

```rust
#[derive(Default)]
pub struct ActiveStreams {
    inner: Arc<Mutex<HashMap<String, ActiveStreamHandle>>>,
}
```

with:

```rust
pub struct ActiveStreams {
    inner: Arc<Mutex<HashMap<String, ActiveStreamHandle>>>,
    sleep_guard: SleepGuard,
}

impl Default for ActiveStreams {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            sleep_guard: SleepGuard::default(),
        }
    }
}
```

(c) Add a test-only constructor. Place it immediately after the existing `pub fn new() -> Self { Self::default() }`:

```rust
    /// Test constructor that injects a specific sleep backend so the
    /// ref-count wiring can be verified without touching real IOKit.
    #[cfg(test)]
    pub(crate) fn with_sleep_backend(sleep_guard: SleepGuard) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            sleep_guard,
        }
    }
```

(d) In `try_register_for_session`, drive the guard on the successful insert. Replace:

```rust
        map.insert(handle.request_id.clone(), handle);
        true
```

with:

```rust
        let before = map.len();
        map.insert(handle.request_id.clone(), handle);
        let after = map.len();
        self.sleep_guard.on_count_change(before, after);
        true
```

(e) In `unregister`, drive the guard on removal. Replace:

```rust
    pub(super) fn unregister(&self, request_id: &str) {
        if let Ok(mut map) = self.inner.lock() {
            map.remove(request_id);
        }
    }
```

with:

```rust
    pub(super) fn unregister(&self, request_id: &str) {
        if let Ok(mut map) = self.inner.lock() {
            let before = map.len();
            map.remove(request_id);
            let after = map.len();
            self.sleep_guard.on_count_change(before, after);
        }
    }
```

> `set_session_active` needs no change: its active branch calls `try_register_for_session` and its inactive branch calls `unregister`, both already wired.

- [ ] **Step 4: Run the active_streams tests**

Run: `cd src-tauri && cargo test --lib active_streams`
Expected: PASS — the three new tests plus all existing ones (`duplicate_helmor_session_id_is_rejected`, `snapshot_for_ui_omits_anonymous_streams`, `unregister_removes_from_snapshot`, `is_session_active_tracks_registration`, `has_active_for_workspace_tracks_handles`).

- [ ] **Step 5: Full backend test suite + clippy**

Run: `cd src-tauri && cargo test`
Expected: PASS (no regressions).

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/agents/streaming/active_streams.rs
git commit -m "feat(power): hold prevent-idle-sleep assertion while streams are active"
```

---

## Task 4: Manual verification (macOS)

**Files:** none (manual smoke test).

- [ ] **Step 1: Build and run the dev app**

Run: `bun run dev`

- [ ] **Step 2: With no agent running, confirm no Helmor assertion**

Run: `pmset -g assertions | grep -i helmor`
Expected: no output (no assertion held when idle).

- [ ] **Step 3: Start a long-running agent turn, then check assertions**

Send a prompt that runs for a while (e.g. ask an agent to run a long task). While it streams, run:

Run: `pmset -g assertions | grep -i "Helmor is running an agent"`
Expected: a `PreventUserIdleSystemSleep` line naming "Helmor is running an agent".

- [ ] **Step 4: Let the turn finish, confirm the assertion is released**

After the stream ends (or you abort it), run:

Run: `pmset -g assertions | grep -i helmor`
Expected: no output again.

- [ ] **Step 5: Changeset**

Create `.changeset/keep-mac-awake-while-agents-run.md`:

```markdown
---
"helmor": patch
---

Keep the Mac awake while an agent is running so long tasks aren't interrupted by idle system sleep. The display can still sleep to save battery; closing the lid on battery still sleeps as usual.
```

Commit:

```bash
git add .changeset/keep-mac-awake-while-agents-run.md
git commit -m "chore: changeset for keep-mac-awake-while-agents-run"
```

---

## Self-Review Notes

- **Spec coverage:** `platform/power.rs` module (Tasks 1–2), ref-count in `ActiveStreams` keyed off map size (Task 3), system-sleep-only assertion type + "Helmor is running an agent" name (Task 2), best-effort `warn`-and-continue error handling (Task 2 `acquire`), test seam via injectable backend (Tasks 1 & 3), terminal sessions participate (Task 3 test), no schema/pipeline/frontend change. Clamshell + UI indicator explicitly deferred — not implemented, matching non-goals.
- **Types are consistent across tasks:** `SleepAssertionBackend::{acquire(&self) -> Option<u32>, release(&self, u32)}`, `SleepGuard::{new(Box<dyn SleepAssertionBackend>), on_count_change(usize, usize)}`, `ActiveStreams::with_sleep_backend(SleepGuard)` — all used with the same signatures in their tests.
- **No placeholders:** every code step shows complete code.
