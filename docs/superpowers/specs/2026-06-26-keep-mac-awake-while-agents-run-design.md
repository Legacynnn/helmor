# Keep the Mac awake while agents run

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-26
**Branch:** `Legacynnn/agents-continue-on-sleep`

## Problem

When a user closes the laptop lid or the Mac goes to idle sleep while an agent
(Claude SDK / Codex / terminal session) is mid-run, the OS suspends the whole
process tree — the Tauri host, the Bun sidecar, and the in-flight HTTPS request
to the model API. After 45s with no heartbeat the Rust event loop declares the
sidecar dead and the stream fails with "Sidecar stopped responding". The user
returns to a dead session and a sidebar that stopped updating.

Today there is **zero** power-management code in the repo: no `caffeinate`, no
IOKit assertions, nothing fighting sleep.

## Goal

Prevent **idle system sleep** for as long as ≥1 agent stream is active, so
agents keep running when the user steps away (lid open). Automatic, no setting,
no UI.

## Non-goals

- **Lid-closed-on-battery (clamshell) sleep.** A normal power assertion does not
  survive lid close on battery; the SMC forces sleep regardless. Overriding it
  requires `pmset disablesleep` via a privileged helper (the Amphetamine
  approach) with real footguns (stranding the Mac in never-sleep). Out of scope
  here; revisit as a separate opt-in feature only if users ask.
- **Display sleep.** We deliberately let the screen dim/turn off to save
  battery. Agents keep running regardless of display state.
- Any frontend change or visible indicator. Silent for now (YAGNI); can be added
  later.

## Decisions (confirmed with user)

| Decision | Choice |
| --- | --- |
| Sleep scope | System sleep only (`kIOPMAssertPreventUserIdleSystemSleep`), let display sleep |
| Mechanism | Native IOKit assertion via thin Rust FFI (no extra process, no new dep) |
| Visibility | Silent — no UI indicator |
| Control | Always on while ≥1 stream is active; no settings toggle |
| OS string | `"Helmor is running an agent"` (shown in `pmset -g assertions`) |
| Test seam | Inject the assertion backend behind a trait so ref-count logic is testable without real IOKit |

## Architecture

### New module: `src-tauri/src/platform/power.rs`

Registered in `platform/mod.rs` (`pub mod power;`). Mirrors the
`#[cfg(target_os = "macos")]` real-impl / no-op-stub pattern already used in
`platform/process.rs`.

Responsibilities:

- A thin FFI binding to two IOKit functions, behind
  `#[link(name = "IOKit", kind = "framework")]`:
  - `IOPMAssertionCreateWithName(assertion_type: CFStringRef, level: u32, name: CFStringRef, id: *mut u32) -> i32`
  - `IOPMAssertionRelease(id: u32) -> i32`
- CFStrings built via the already-present `core_foundation::string::CFString`
  (the crate is a direct dependency — `core-foundation = "0.10"`).
- A `SleepAssertion` backend trait:
  - `fn acquire(&self) -> Option<u32>` — returns the assertion id, or `None` on
    failure (logged at `warn`).
  - `fn release(&self, id: u32)`.
- Two implementations:
  - `IoKitAssertion` (real, `#[cfg(target_os = "macos")]`) — calls the FFI with
    type `kIOPMAssertPreventUserIdleSystemSleep` ("PreventUserIdleSystemSleep"),
    level `kIOPMAssertionLevelOn` (255), name `"Helmor is running an agent"`.
  - `NoopAssertion` (non-macOS, and usable as a test double) — does nothing /
    returns a fake id.

The module exposes a `SleepGuard` ref-counter:

- Holds an active count and the current assertion id (if held), behind the
  caller's existing lock (no internal mutex — see integration below).
- `on_count_change(prev: usize, next: usize)`:
  - `prev == 0 && next > 0` → `backend.acquire()`, store id.
  - `prev > 0 && next == 0` → `backend.release(id)`, clear id.
  - otherwise no-op.

### Integration: `agents/streaming/active_streams.rs`

`ActiveStreams` already owns the single source of truth for "is anything
running" and guards it with one `Mutex<HashMap<..>>`. The assertion lives here.

- Add a `SleepGuard` field to `ActiveStreams`, constructed in `new()` /
  `default()` with the platform backend (real on macOS, no-op elsewhere).
- Every mutation already happens under the map lock. Inside that same locked
  region, capture `len` before and after the insert/remove and call
  `guard.on_count_change(before, after)`. Affected methods:
  - `try_register_for_session` (SDK streams) — only the successful insert path.
  - `set_session_active` (terminal sessions, active=true → insert,
    active=false → remove).
  - `unregister` (remove).
- No change to `streaming/mod.rs`: it already calls register/unregister around
  every stream's lifetime.

Because the transition logic keys off the map size (not the stream type), N
concurrent agents acquire the assertion exactly once (on the first) and release
exactly once (on the last). Terminal sessions count too.

## Data flow

```
stream starts → try_register_for_session → map 0→1 → backend.acquire()  → Mac stays awake
stream ends   → unregister              → map 1→0 → backend.release(id) → idle sleep allowed
N concurrent: acquired once at first registration, released once at last unregister
```

## Error handling

- `IOPMAssertionCreateWithName` non-zero return → log `warn`, return `None`,
  proceed. Keep-awake is best-effort; it must never block or fail a send.
- macOS auto-releases all of a process's assertions when the process exits, so a
  crash cannot strand the Mac in never-sleep.
- On graceful shutdown the active map drains to empty → `1→0` transition fires →
  release happens naturally.

## Testing

- Unit tests in `active_streams.rs` using the `NoopAssertion`-style test double
  (a backend that records acquire/release calls):
  - Acquires exactly once across N concurrent registrations.
  - Releases exactly once on the final unregister, not before.
  - Terminal `set_session_active(true/false)` participates in the same
    ref-count.
  - Existing tests (`duplicate_helmor_session_id_is_rejected`,
    `snapshot_for_ui_omits_anonymous_streams`, etc.) still pass.
- FFI calls are not unit-tested (they hit the OS); guarded behind cfg, verified
  manually via `pmset -g assertions` showing/hiding the Helmor entry.
- `cargo clippy --all-targets -- -D warnings` clean; `cargo test` green.

## Footprint

- New file: `platform/power.rs` (~80–100 lines).
- `platform/mod.rs`: +1 line.
- `active_streams.rs`: +~30 lines (field, construction, three call sites,
  tests).
- No new dependency, no schema/pipeline change (no snapshot-test impact), no
  frontend change.

## Out-of-scope follow-ups (not in this change)

- Opt-in "keep running with lid closed" toggle backed by a privileged helper.
- A UI indicator when an assertion is held.
