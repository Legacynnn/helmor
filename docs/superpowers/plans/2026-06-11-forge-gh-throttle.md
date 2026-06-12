# Forge `gh`/`glab` Throttle — Implementation Plan (Phase 1 of Resources Refactor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `gh`/`glab` subprocess pile-up by adding a process-global concurrency cap on all forge CLI spawns plus an in-flight-dedup + short-TTL cache for idempotent read calls (PR/CI status GraphQL, auth-status).

**Architecture:** A new `forge/throttle.rs` provides two independent primitives: (1) a std-only counting `Semaphore` acquired inside `command.rs::run_command_full` so no more than N forge subprocesses run at once; (2) a `run_cached(key, ttl, compute)` helper backed by a TTL map with in-flight dedup, so concurrent identical reads share one spawn and rapid re-polls reuse results. Read-heavy callers (`github/api.rs::run_graphql`, `github/accounts.rs` auth-status, `gitlab/api.rs` reads) route through `run_cached`; mutation paths are deliberately left uncached.

**Tech Stack:** Rust, `std::sync` (`Mutex`, `Condvar`, `OnceLock`, `Arc`), existing `forge::command::CommandOutput`. No new crates.

---

## Background

Live `gh` processes are children of the Rust host (`target/debug/helmor`), spawned by `src-tauri/src/forge/` PR/CI-status polling. Each poll spawns ~3 `gh` calls (`auth status`, `api /user`, a large `statusCheckRollup` GraphQL query) per workspace, with no dedup/cache/cap, so they accumulate (observed 13–14s old, 7 concurrent). `command.rs::run_command_full` spawns each fresh with a 15s timeout.

## File Structure

- **Create** `src-tauri/src/forge/throttle.rs` — the `Semaphore` + `run_cached` primitives and their unit tests. Single responsibility: bounding and coalescing forge subprocess work.
- **Modify** `src-tauri/src/forge/mod.rs` — declare `mod throttle;`.
- **Modify** `src-tauri/src/forge/command.rs` — acquire a concurrency permit inside `run_command_full` before spawning.
- **Modify** `src-tauri/src/forge/github/api.rs` — route typed `run_graphql` reads through `run_cached`.
- **Modify** `src-tauri/src/forge/github/accounts.rs` — route the `auth status --json hosts` read through `run_cached`.
- **Modify** `src-tauri/src/forge/gitlab/accounts.rs` — route the `auth status` read through `run_cached`.

Cache keys are identity-qualified strings built by each caller (host + login + query/args) so different accounts never collide.

---

## Task 1: Concurrency Semaphore primitive

**Files:**
- Create: `src-tauri/src/forge/throttle.rs`
- Modify: `src-tauri/src/forge/mod.rs`

- [ ] **Step 1: Declare the module**

In `src-tauri/src/forge/mod.rs`, add to the module declarations block (after `pub(crate) mod remote;` or alphabetically near the other `mod` lines):

```rust
mod throttle;
```

- [ ] **Step 2: Write the failing test for the Semaphore**

Create `src-tauri/src/forge/throttle.rs` with only this content (test + minimal scaffolding will not compile yet — that is the point):

```rust
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
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd src-tauri && cargo test --lib forge::throttle::tests::semaphore_caps_concurrency -- --nocapture`
Expected: PASS (and the crate compiles with the new module).

> Note: this primitive is self-contained, so the test passes immediately once it compiles. The "failing" state here is a compile failure if the module is malformed — fix until it compiles and passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/throttle.rs src-tauri/src/forge/mod.rs
git commit -m "feat(forge): add global concurrency semaphore for CLI subprocesses"
```

---

## Task 2: Wire the semaphore into command execution

**Files:**
- Modify: `src-tauri/src/forge/command.rs:65-135` (`run_command_full`)

- [ ] **Step 1: Acquire a permit before spawning**

In `run_command_full`, locate the spawn site (currently around line 98-100):

```rust
    crate::platform::process::configure_tree_root(&mut command);

    let child = command.spawn()?;
```

Replace with:

```rust
    crate::platform::process::configure_tree_root(&mut command);

    // Bound the number of concurrent forge subprocesses. The permit is held
    // for the lifetime of this call (spawn → wait/timeout), so a burst of
    // PR-status polls can no longer pile up dozens of `gh` processes.
    let _permit = crate::forge::throttle::acquire_forge_permit();
    let child = command.spawn()?;
```

(The `_permit` binding lives until the end of `run_command_full`, releasing automatically on every return path including the timeout-kill branch.)

- [ ] **Step 2: Verify existing command tests still pass**

Run: `cd src-tauri && cargo test --lib forge::command`
Expected: PASS — `run_command_with_timeout_kills_stalled_command` still passes (the permit does not change timeout behavior).

- [ ] **Step 3: Verify clippy is clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/command.rs
git commit -m "feat(forge): cap concurrent CLI spawns via the forge semaphore"
```

---

## Task 3: TTL cache + in-flight dedup primitive

**Files:**
- Modify: `src-tauri/src/forge/throttle.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module in `src-tauri/src/forge/throttle.rs` (keep the existing semaphore test):

```rust
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

        let handles: Vec<_> = (0..5)
            .map(|_| {
                let calls = Arc::clone(&calls);
                thread::spawn(move || {
                    run_cached("shared".to_string(), ttl, move || {
                        calls.fetch_add(1, Ordering::SeqCst);
                        thread::sleep(Duration::from_millis(80));
                        Ok(sample_output("shared-value"))
                    })
                    .unwrap()
                })
            })
            .collect();

        let outputs: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();

        assert_eq!(calls.load(Ordering::SeqCst), 1, "only one underlying spawn");
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
        assert_eq!(calls.load(Ordering::SeqCst), 2, "errors retry, never cached");
    }

    fn sample_output(stdout: &str) -> CommandOutput {
        CommandOutput {
            stdout: stdout.to_string(),
            stderr: String::new(),
            success: true,
            status: Some(0),
        }
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib forge::throttle::tests::run_cached -- --nocapture`
Expected: FAIL to compile — `run_cached` and `CommandOutput` are not in scope yet.

- [ ] **Step 3: Implement `run_cached`**

Add to the top-of-file `use` block in `src-tauri/src/forge/throttle.rs`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::command::CommandOutput;
```

Add the implementation (above the `#[cfg(test)]` module):

```rust
/// Result shape stored in the cache. `io::Error` is not `Clone`, so failures
/// are stringified for sharing — but see [`run_cached`]: errors are evicted
/// immediately and never actually served from cache.
type ShareableOutput = Result<CommandOutput, String>;

enum SlotState {
    Pending,
    Ready(ShareableOutput),
}

struct Slot {
    state: Mutex<SlotState>,
    cv: Condvar,
}

struct CacheEntry {
    inserted: Instant,
    slot: Arc<Slot>,
}

fn read_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Run `compute` at most once per `key` per `ttl` window, coalescing
/// concurrent identical calls onto a single in-flight computation.
///
/// Use ONLY for idempotent reads (status queries, auth checks). Errors are
/// never cached: the failing entry is evicted so the next caller retries.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib forge::throttle::tests -- --nocapture`
Expected: PASS — all five throttle tests (semaphore + four `run_cached`).

- [ ] **Step 5: Verify clippy is clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/forge/throttle.rs
git commit -m "feat(forge): add TTL read-cache with in-flight dedup"
```

---

## Task 4: Route GitHub GraphQL reads through the cache

**Files:**
- Modify: `src-tauri/src/forge/github/api.rs` (`run_graphql`, ~lines 27-42)

`run_graphql` is the typed read path (PR/CI status, `statusCheckRollup`). `run_graphql_raw` is left untouched because mutation paths use it.

- [ ] **Step 1: Add the TTL constant and cache the typed read**

At the top of `src-tauri/src/forge/github/api.rs`, add near the other constants (below `GITHUB_HOST`):

```rust
/// Idempotent GitHub reads (PR/CI status) reuse a result for this long, so a
/// burst of status polls coalesces instead of spawning a `gh` per poll.
const READ_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(6);
```

Replace the body of `run_graphql` (the typed variant) with a cached wrapper:

```rust
/// Run `gh api graphql -f query=… -f var=…` deserialised into `T`.
///
/// Cached + deduped: identical concurrent reads for the same login share one
/// `gh` spawn, and rapid re-polls within `READ_CACHE_TTL` reuse the response.
pub(super) fn run_graphql<T: for<'de> Deserialize<'de>>(
    login: &str,
    query: &str,
    variables: &[(&str, &str)],
) -> Result<GraphqlOutcome<T>> {
    let cache_key = graphql_cache_key(login, query, variables);
    let cached = crate::forge::throttle::run_cached(cache_key, READ_CACHE_TTL, || {
        // The `run_cached` closure must return io::Result<CommandOutput>, so we
        // run the raw command here and decode after the cache returns.
        match run_graphql_command(login, query, variables) {
            Ok(GraphqlOutcome::Ok(output)) => Ok(output),
            Ok(GraphqlOutcome::Auth) => Ok(auth_sentinel()),
            Err(error) => Err(std::io::Error::other(format!("{error:#}"))),
        }
    });

    let output = match cached {
        Ok(output) => output,
        Err(error) => return Err(anyhow!("`gh api graphql` failed: {error}")),
    };

    if is_auth_sentinel(&output) {
        return Ok(GraphqlOutcome::Auth);
    }

    let parsed = serde_json::from_str::<T>(&output.stdout)
        .with_context(|| "Failed to decode GitHub GraphQL response".to_string())?;
    Ok(GraphqlOutcome::Ok(parsed))
}

/// Build an identity-qualified cache key so different accounts never collide.
fn graphql_cache_key(login: &str, query: &str, variables: &[(&str, &str)]) -> String {
    let mut key = format!("gh-graphql:{login}:{query}");
    for (name, value) in variables {
        key.push('\u{1f}');
        key.push_str(name);
        key.push('=');
        key.push_str(value);
    }
    key
}

/// A `CommandOutput` whose stdout carries an internal marker meaning "the
/// token was rejected". Lets the auth outcome flow through `run_cached`
/// (which only speaks `CommandOutput`) without inventing a second channel.
fn auth_sentinel() -> CommandOutput {
    CommandOutput {
        stdout: AUTH_SENTINEL.to_string(),
        stderr: String::new(),
        success: false,
        status: None,
    }
}

fn is_auth_sentinel(output: &CommandOutput) -> bool {
    output.stdout == AUTH_SENTINEL
}

const AUTH_SENTINEL: &str = "\u{0}helmor:gh-auth-rejected\u{0}";
```

> Why the sentinel: `run_cached` returns `io::Result<CommandOutput>`, but `run_graphql_command` returns a three-state `GraphqlOutcome` (`Ok`/`Auth`). Encoding `Auth` as a recognizable `CommandOutput` keeps the cache layer generic while preserving the auth-degradation behavior. The marker uses NUL bytes that cannot appear in real GraphQL JSON.

- [ ] **Step 2: Verify it compiles and existing forge tests pass**

Run: `cd src-tauri && cargo test --lib forge:: -- --nocapture`
Expected: PASS — no regressions in forge unit tests.

- [ ] **Step 3: Verify clippy is clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/github/api.rs
git commit -m "feat(forge): cache+dedup GitHub GraphQL status reads"
```

---

## Task 5: Route auth-status reads through the cache

**Files:**
- Modify: `src-tauri/src/forge/github/accounts.rs:247` (the `auth status --json hosts` call)
- Modify: `src-tauri/src/forge/gitlab/accounts.rs:340` (the `auth status` call)

Auth-status probes are pure reads fired on the same polling cadence as PR status, so they benefit from the same cache. Each poll currently spawns its own `gh auth status`.

- [ ] **Step 1: Cache the GitHub auth-status read**

In `src-tauri/src/forge/github/accounts.rs`, find the call (around line 247):

```rust
    let output = run_command("gh", ["auth", "status", "--json", "hosts"])
```

Wrap it in `run_cached`. Replace that statement (and keep the rest of the function unchanged) with:

```rust
    let output = crate::forge::throttle::run_cached(
        "gh-auth-status:hosts".to_string(),
        std::time::Duration::from_secs(6),
        || run_command("gh", ["auth", "status", "--json", "hosts"]),
    )
```

(The `?`/`.with_context(...)`/`.map_err(...)` chain that previously followed `run_command(...)` stays attached to this expression — only the inner call changes.)

- [ ] **Step 2: Cache the GitLab auth-status read**

In `src-tauri/src/forge/gitlab/accounts.rs`, find (around line 340):

```rust
    let pairs = match run_command("glab", ["auth", "status"]) {
```

Replace the `run_command(...)` call with the cached form:

```rust
    let pairs = match crate::forge::throttle::run_cached(
        "glab-auth-status".to_string(),
        std::time::Duration::from_secs(6),
        || run_command("glab", ["auth", "status"]),
    ) {
```

- [ ] **Step 3: Verify it compiles and forge tests pass**

Run: `cd src-tauri && cargo test --lib forge:: -- --nocapture`
Expected: PASS.

- [ ] **Step 4: Verify clippy is clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/forge/github/accounts.rs src-tauri/src/forge/gitlab/accounts.rs
git commit -m "feat(forge): cache+dedup auth-status probes"
```

---

## Task 6: Manual verification of the fix

**Files:** none (observation only)

- [ ] **Step 1: Build and run the dev app**

Run: `bun run dev` (from repo root). Let it build the Rust host.

- [ ] **Step 2: Observe `gh` process count under polling**

With several workspaces open (PR-status polling active), in a separate terminal run:

```bash
ps -eo pid,ppid,etime,command | grep -E '/(gh|glab) ' | grep -v grep | wc -l
```

Expected: the count stays at or below ~4 (the semaphore cap) even during active polling, versus the previous pile-up of 7+. Repeated samples over ~30s should not show steadily-growing counts or many entries older than ~15s.

- [ ] **Step 3: Confirm PR/CI status still updates correctly**

In the Helmor UI, confirm PR status / CI checks still render and refresh for a workspace with an open PR (cache TTL is 6s, so updates appear within a few seconds). No stale or missing status.

- [ ] **Step 4: Run the full Rust test + lint suite**

Run: `cd src-tauri && cargo test --lib && cargo clippy --all-targets -- -D warnings`
Expected: PASS, zero warnings.

- [ ] **Step 5: Add a changeset**

Create `.changeset/forge-gh-throttle.md`:

```markdown
---
"helmor": patch
---

Forge CLI calls (`gh`/`glab`) are now concurrency-capped and idempotent reads (PR/CI status, auth status) are briefly cached and deduped, eliminating the pile-up of GitHub CLI processes during status polling.
```

```bash
git add .changeset/forge-gh-throttle.md
git commit -m "chore: changeset for forge CLI throttle"
```

---

## Self-Review Notes

- **Spec coverage:** Implements spec §5 "Forge `gh` fix" — in-flight dedup (Task 3 + 4/5), short-TTL cache (Task 3 + 4/5), concurrency cap (Task 1 + 2). Build-sequence Phase 1 only; Phases 2–5 (per-core CPU/grouping, Docker, GPU helper, UI) are separate plans.
- **Type consistency:** `CommandOutput { stdout, stderr, success, status }` matches `command.rs:12-18`. `run_cached(key: String, ttl: Duration, compute: FnOnce() -> io::Result<CommandOutput>)` signature is identical across Tasks 3/4/5. `GraphqlOutcome::{Ok,Auth}` preserved.
- **No placeholders:** every code step shows complete code; verification steps give exact commands + expected results.
- **Not cached (intentional):** `run_graphql_raw` and all mutation/merge/close paths — only typed reads and auth-status are cached.
