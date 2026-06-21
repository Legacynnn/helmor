# Live Plan Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-refresh the open Plan tab within ~300ms when the agent rewrites a `.helmor/plans/*.mdx` file with its own tools.

**Architecture:** A dedicated per-workspace filesystem watcher (modeled on `git/watcher.rs`) watches each operational worktree's `.helmor/plans/` directory and publishes a `PlanFileChanged` ui-sync event on `.mdx` writes. The event carries `workspace_id` + `slug` (the on-disk identity) instead of `session_id`, and the frontend bridge invalidates plan queries by slug-predicate across all sessions.

**Tech Stack:** Rust (Tauri, `notify` / `notify_debouncer_full`, rusqlite), TypeScript/React (TanStack Query), vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-06-20-live-plan-refresh-design.md`

---

## File Structure

- **Modify** `src-tauri/src/ui_sync/events.rs` — change `PlanFileChanged` fields `{ session_id, slug }` → `{ workspace_id, slug }`; update serialization test.
- **Modify** `src-tauri/src/commands/plans.rs` — `write_plan` / `set_plan_status` resolve & publish `workspace_id` instead of `session_id`.
- **Modify** `src-tauri/src/plans/store.rs` — expose `plans_dir` as `pub(crate)` for the watcher.
- **Create** `src-tauri/src/plans/watcher.rs` — `PlanWatcherManager` + per-workspace fs watchers + slug derivation; unit tests.
- **Modify** `src-tauri/src/plans/mod.rs` — `pub mod watcher;`.
- **Modify** `src-tauri/src/lib.rs` — register `PlanWatcherManager` state; init sync; (shutdown handled via system_commands).
- **Modify** `src-tauri/src/git/watcher.rs` — `notify_workspace_changed` also syncs the plan watcher.
- **Modify** `src-tauri/src/commands/system_commands.rs` — shutdown the plan watcher alongside the git watcher (2 sites).
- **Modify** `src/lib/api.ts` — mirror the new event shape.
- **Modify** `src/shell/hooks/use-ui-sync-bridge.ts` — predicate-based plan invalidation.
- **Modify** `src/features/plan-viewer/use-plan.ts` — drop stale "won't auto-refresh" caveat.
- **Create** `src/shell/hooks/use-ui-sync-bridge.test.tsx` (or extend existing) — predicate invalidation test.

---

## Task 1: Change the `PlanFileChanged` event contract (backend)

**Files:**
- Modify: `src-tauri/src/ui_sync/events.rs` (enum variant ~line 147; test ~line 260)

- [ ] **Step 1: Update the serialization test to the new shape (failing)**

In `src-tauri/src/ui_sync/events.rs`, change the test case in the camelCase wire test:

```rust
            UiMutationEvent::PlanFileChanged {
                workspace_id: "w".into(),
                slug: "my-plan".into(),
            },
```

- [ ] **Step 2: Run the test to verify it fails to compile**

Run: `cd src-tauri && cargo test -p helmor --lib ui_sync 2>&1 | tail -20`
Expected: compile error — `PlanFileChanged` has no field `workspace_id`.

- [ ] **Step 3: Change the enum variant**

In `src-tauri/src/ui_sync/events.rs`, update the variant and its doc comment:

```rust
    /// A plan file under `.helmor/plans/` was created or changed. Carries the
    /// owning workspace + slug (the on-disk identity); the frontend invalidates
    /// every plan query for that slug regardless of which session opened it.
    PlanFileChanged {
        workspace_id: String,
        slug: String,
    },
```

- [ ] **Step 4: Run the test to verify it passes (publishers still broken — expected)**

Run: `cd src-tauri && cargo test -p helmor --lib ui_sync 2>&1 | tail -20`
Expected: the `ui_sync` lib tests compile and pass. (The crate as a whole won't build yet because `commands/plans.rs` still uses `session_id` — fixed in Task 2. That's fine; this step only runs the `ui_sync` module's unit tests, which depend only on `events.rs`.)

If `cargo test` refuses to run because the whole crate fails to compile, skip running here and proceed to Task 2, then run both together at Task 2 Step 4.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ui_sync/events.rs
git commit -m "refactor(plans): PlanFileChanged carries workspace_id not session_id"
```

---

## Task 2: Update the host publishers

**Files:**
- Modify: `src-tauri/src/commands/plans.rs` (`write_plan` ~line 66, `set_plan_status` ~line 90)

The handlers receive `session_id`. They already resolve the workspace dir from it; resolve the `workspace_id` the same way (`sessions::workspace_id_for_session`) and publish that.

- [ ] **Step 1: Update `write_plan`**

In `src-tauri/src/commands/plans.rs`, replace the publish block at the end of `write_plan`:

```rust
    let workspace_id = run_blocking({
        let session_id = session_id.clone();
        move || {
            crate::models::sessions::workspace_id_for_session(&session_id)?
                .with_context(|| format!("No workspace bound to session {session_id}"))
        }
    })
    .await?;

    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::PlanFileChanged { workspace_id, slug },
    );
    Ok(summary)
```

(Remove the now-unused `session_id` from the final publish; it is still used above to resolve the dir. Keep the existing `Context` import — it is already imported at top of file.)

- [ ] **Step 2: Update `set_plan_status`**

In `src-tauri/src/commands/plans.rs`, replace the publish block at the end of `set_plan_status` identically:

```rust
    let workspace_id = run_blocking({
        let session_id = session_id.clone();
        move || {
            crate::models::sessions::workspace_id_for_session(&session_id)?
                .with_context(|| format!("No workspace bound to session {session_id}"))
        }
    })
    .await?;

    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::PlanFileChanged { workspace_id, slug },
    );
    Ok(summary)
```

- [ ] **Step 3: Build to verify the crate compiles**

Run: `cd src-tauri && cargo build -p helmor 2>&1 | tail -20`
Expected: builds (warnings ok). If `session_id` becomes fully unused in a handler, prefix with `_` or drop the clone — follow the compiler.

- [ ] **Step 4: Run the ui_sync + plans tests**

Run: `cd src-tauri && cargo test -p helmor --lib 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/plans.rs
git commit -m "refactor(plans): publishers emit workspace_id for PlanFileChanged"
```

---

## Task 3: Expose `plans_dir` for the watcher

**Files:**
- Modify: `src-tauri/src/plans/store.rs` (~line 120)

- [ ] **Step 1: Make `plans_dir` crate-visible**

In `src-tauri/src/plans/store.rs`, change:

```rust
fn plans_dir(workspace_dir: &Path) -> PathBuf {
```

to:

```rust
pub(crate) fn plans_dir(workspace_dir: &Path) -> PathBuf {
```

- [ ] **Step 2: Build**

Run: `cd src-tauri && cargo build -p helmor 2>&1 | tail -5`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/plans/store.rs
git commit -m "chore(plans): expose plans_dir to crate"
```

---

## Task 4: Slug derivation helper + tests

**Files:**
- Create: `src-tauri/src/plans/watcher.rs`
- Modify: `src-tauri/src/plans/mod.rs`

- [ ] **Step 1: Create the module with the helper + failing tests**

Create `src-tauri/src/plans/watcher.rs`:

```rust
//! Per-workspace filesystem watcher for `.helmor/plans/*.mdx`.
//!
//! The MDX plan surface refreshes on the [`PlanFileChanged`] ui-sync event,
//! but that only fires for host-initiated writes. When the agent revises a
//! plan with its own Edit/Write tools, no host command runs — so this watcher
//! observes the plans directory directly and publishes the event itself.
//!
//! Modeled on [`crate::git::watcher`]: one debounced watcher per operational
//! worktree workspace, synced with DB state via [`PlanWatcherManager::sync_from_db`].

use std::path::Path;

/// Derive a plan `slug` from a changed path, or `None` if the path is not a
/// plan document we should react to. Accepts only `*.mdx` files whose name does
/// not start with `.` (editor temp/swap files like `.foo.mdx.swp` are ignored).
pub(crate) fn slug_from_plan_path(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    if name.starts_with('.') {
        return None;
    }
    if path.extension()?.to_str()? != "mdx" {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    if stem.is_empty() {
        return None;
    }
    Some(stem.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn accepts_plain_mdx() {
        let p = PathBuf::from("/ws/.helmor/plans/my-plan.mdx");
        assert_eq!(slug_from_plan_path(&p).as_deref(), Some("my-plan"));
    }

    #[test]
    fn rejects_non_mdx() {
        for name in ["notes.txt", "plan.md", "plan.mdx.bak", "README"] {
            let p = PathBuf::from(format!("/ws/.helmor/plans/{name}"));
            assert_eq!(slug_from_plan_path(&p), None, "should reject {name}");
        }
    }

    #[test]
    fn rejects_editor_temp_and_dotfiles() {
        for name in [".my-plan.mdx.swp", ".my-plan.mdx", ".#my-plan.mdx"] {
            let p = PathBuf::from(format!("/ws/.helmor/plans/{name}"));
            assert_eq!(slug_from_plan_path(&p), None, "should reject {name}");
        }
    }
}
```

In `src-tauri/src/plans/mod.rs`, add after `pub mod store;`:

```rust
pub mod watcher;
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test -p helmor --lib plans::watcher 2>&1 | tail -20`
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/plans/watcher.rs src-tauri/src/plans/mod.rs
git commit -m "feat(plans): slug-from-path helper for plan watcher"
```

---

## Task 5: The plan watcher manager

**Files:**
- Modify: `src-tauri/src/plans/watcher.rs`

- [ ] **Step 1: Add the manager, watcher, and DB loader**

Append to `src-tauri/src/plans/watcher.rs` (after the `slug_from_plan_path` fn, before `#[cfg(test)]`):

```rust
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{Context, Result};
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, RecommendedCache};
use tauri::{AppHandle, Runtime};

use crate::models::db;
use crate::plans::store;

/// A live watcher bound to one workspace's `.helmor/plans/` directory.
struct PlanWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
}

/// Minimal record needed to start a watcher: workspace id + on-disk dir.
struct WatchableWorkspace {
    id: String,
    repo_name: String,
    directory_name: String,
}

impl WatchableWorkspace {
    fn workspace_dir(&self) -> Result<PathBuf> {
        crate::data_dir::workspace_dir(&self.repo_name, &self.directory_name)
    }
}

/// One plan watcher per operational worktree workspace.
pub struct PlanWatcherManager {
    watchers: Mutex<HashMap<String, PlanWatcher>>,
}

impl Default for PlanWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PlanWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// Sync watchers with current DB state: start one per operational worktree
    /// workspace that isn't already watched, and drop watchers for workspaces
    /// that are gone. Mirrors `git::watcher::GitWatcherManager::sync_from_db`.
    pub fn sync_from_db<R: Runtime>(&self, app: AppHandle<R>) -> Result<()> {
        let workspaces = load_watchable_workspaces()?;
        let want: HashMap<&str, &WatchableWorkspace> =
            workspaces.iter().map(|w| (w.id.as_str(), w)).collect();

        let mut watchers = self
            .watchers
            .lock()
            .map_err(|_| anyhow::anyhow!("plan watcher lock poisoned"))?;

        watchers.retain(|id, _| want.contains_key(id.as_str()));

        for (id, ws) in &want {
            if watchers.contains_key(*id) {
                continue;
            }
            match start_watcher(&app, ws) {
                Ok(watcher) => {
                    tracing::info!(workspace_id = %id, "Started plan watcher");
                    watchers.insert(id.to_string(), watcher);
                }
                Err(e) => {
                    tracing::warn!(workspace_id = %id, "Failed to start plan watcher: {e:#}");
                }
            }
        }
        Ok(())
    }

    /// Stop watching a single workspace.
    pub fn unwatch(&self, workspace_id: &str) {
        if let Ok(mut watchers) = self.watchers.lock() {
            if watchers.remove(workspace_id).is_some() {
                tracing::debug!(workspace_id, "Stopped plan watcher");
            }
        }
    }

    /// Stop all watchers (app shutdown).
    pub fn shutdown(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            let count = watchers.len();
            watchers.clear();
            if count > 0 {
                tracing::info!(count, "Shut down all plan watchers");
            }
        }
    }
}

/// Start a debounced watcher on `<workspace>/.helmor/plans/`. Ensures the dir
/// exists (and is git-excluded) first, so the first plan write is observed.
fn start_watcher<R: Runtime>(
    app: &AppHandle<R>,
    ws: &WatchableWorkspace,
) -> Result<PlanWatcher> {
    let workspace_dir = ws.workspace_dir()?;
    if !workspace_dir.is_dir() {
        anyhow::bail!("Workspace directory missing: {}", workspace_dir.display());
    }

    // Make sure the plans dir exists and `.helmor/` stays git-excluded, so the
    // watcher has a real path to watch even before the first plan is created.
    store::ensure_excluded(&workspace_dir).ok();
    let dir = store::plans_dir(&workspace_dir);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

    let workspace_id = ws.id.clone();
    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: notify_debouncer_full::DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(errors) => {
                    for e in errors {
                        tracing::warn!(workspace_id = %workspace_id, "plan watch error: {e}");
                    }
                    return;
                }
            };

            let mut slugs: HashSet<String> = HashSet::new();
            for event in &events {
                for path in &event.event.paths {
                    if let Some(slug) = slug_from_plan_path(path) {
                        slugs.insert(slug);
                    }
                }
            }

            for slug in slugs {
                crate::ui_sync::publish(
                    &app_handle,
                    crate::ui_sync::UiMutationEvent::PlanFileChanged {
                        workspace_id: workspace_id.clone(),
                        slug,
                    },
                );
            }
        },
    )
    .context("Failed to create plan debouncer")?;

    debouncer
        .watch(&dir, RecursiveMode::NonRecursive)
        .with_context(|| format!("Failed to watch {}", dir.display()))?;

    Ok(PlanWatcher {
        _debouncer: debouncer,
    })
}

/// Operational worktree workspaces (the only ones with a `.helmor/plans/` dir).
/// Mirrors the query in `store::ensure_existing_worktree_plans_excluded`.
fn load_watchable_workspaces() -> Result<Vec<WatchableWorkspace>> {
    let connection = db::read_conn()?;
    let mut stmt = connection.prepare(&format!(
        "SELECT w.id, r.name, w.directory_name
         FROM workspaces w
         JOIN repos r ON r.id = w.repository_id
         WHERE w.state {} AND COALESCE(w.mode, 'worktree') = 'worktree'",
        crate::workspace_state::OPERATIONAL_FILTER
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchableWorkspace {
            id: row.get(0)?,
            repo_name: row.get(1)?,
            directory_name: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}
```

Note: confirm `store::ensure_excluded` is `pub` (it is — used by `lib.rs` startup repair). Confirm `crate::workspace_state::OPERATIONAL_FILTER` is the same constant used in `store.rs` (it is).

- [ ] **Step 2: Build to verify it compiles**

Run: `cd src-tauri && cargo build -p helmor 2>&1 | tail -20`
Expected: builds. Fix any import path drift the compiler reports (e.g. `data_dir::workspace_dir` signature) by matching `store.rs`'s usage, which calls `crate::data_dir::workspace_dir(&repo_name, &directory_name)`.

- [ ] **Step 3: Run plans tests**

Run: `cd src-tauri && cargo test -p helmor --lib plans 2>&1 | tail -20`
Expected: PASS (the 3 slug tests; manager has no new unit test — covered by build + integration behavior).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/plans/watcher.rs
git commit -m "feat(plans): per-workspace fs watcher publishing PlanFileChanged"
```

---

## Task 6: Wire the watcher into the app lifecycle

**Files:**
- Modify: `src-tauri/src/lib.rs` (`.manage(...)` ~line 201; init thread ~line 487)
- Modify: `src-tauri/src/git/watcher.rs` (`notify_workspace_changed` ~line 813)
- Modify: `src-tauri/src/commands/system_commands.rs` (shutdown ~lines 2677, 2792)

- [ ] **Step 1: Register the manager as Tauri state**

In `src-tauri/src/lib.rs`, right after the existing `.manage(git_watcher::GitWatcherManager::new())` (~line 201), add:

```rust
        .manage(plans::watcher::PlanWatcherManager::new())
```

- [ ] **Step 2: Sync plan watchers on startup**

In `src-tauri/src/lib.rs`, inside the existing git-watcher init thread closure (~lines 490-495), after the git `sync_from_db` call, add a plan-watcher sync:

```rust
                    let plan_manager =
                        watcher_handle.state::<plans::watcher::PlanWatcherManager>();
                    if let Err(e) = plan_manager.sync_from_db(watcher_handle.clone()) {
                        tracing::error!("Failed to initialize plan watchers: {e:#}");
                    }
```

- [ ] **Step 3: Keep plan watchers in lockstep with workspace changes**

In `src-tauri/src/git/watcher.rs`, extend `notify_workspace_changed` so the single central re-sync trigger also syncs plan watchers:

```rust
pub fn notify_workspace_changed<R: Runtime>(app: &AppHandle<R>) {
    let manager = app.state::<GitWatcherManager>();
    if let Err(e) = manager.sync_from_db(app.clone()) {
        tracing::warn!("Failed to sync git watchers after workspace change: {e:#}");
    }
    let plan_manager = app.state::<crate::plans::watcher::PlanWatcherManager>();
    if let Err(e) = plan_manager.sync_from_db(app.clone()) {
        tracing::warn!("Failed to sync plan watchers after workspace change: {e:#}");
    }
}
```

- [ ] **Step 4: Shut down plan watchers on quit**

In `src-tauri/src/commands/system_commands.rs`, at BOTH shutdown sites (~line 2677 and ~line 2792-2793) where `GitWatcherManager` is shut down, add immediately after the git shutdown call:

```rust
    app.state::<crate::plans::watcher::PlanWatcherManager>().shutdown();
```

(At the second site the handle is named `app` as well — match the surrounding variable; if it is a different binding like `app_handle`, use that.)

- [ ] **Step 5: Build the whole crate**

Run: `cd src-tauri && cargo build -p helmor 2>&1 | tail -20`
Expected: builds. Resolve any `plans::watcher` path visibility issues (ensure `pub mod watcher;` from Task 4).

- [ ] **Step 6: Clippy clean**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -20`
Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/git/watcher.rs src-tauri/src/commands/system_commands.rs
git commit -m "feat(plans): wire plan watcher into app lifecycle"
```

---

## Task 7: Frontend — mirror event shape + predicate invalidation

**Files:**
- Modify: `src/lib/api.ts` (~line 2542)
- Modify: `src/shell/hooks/use-ui-sync-bridge.ts` (~line 105)
- Modify: `src/features/plan-viewer/use-plan.ts`

- [ ] **Step 1: Update the event type mirror**

In `src/lib/api.ts`, change line 2542:

```ts
	| { type: "planFileChanged"; workspaceId: string; slug: string }
```

- [ ] **Step 2: Update the bridge handler to predicate invalidation**

In `src/shell/hooks/use-ui-sync-bridge.ts`, replace the `planFileChanged` case:

```ts
		case "planFileChanged":
			// Plan files are workspace-global on disk but queried per active
			// session (`["plan", sessionId, slug]`). Invalidate by slug across
			// every session so the open plan refreshes regardless of which
			// session opened it, and refresh all plan lists so a new plan's tab
			// appears. The event carries `slug`; `event.slug` is referenced in
			// the predicate below.
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "plan" && query.queryKey[2] === event.slug,
			});
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryKey[0] === "planList",
			});
			return;
```

- [ ] **Step 3: Remove the stale caveat from the hook docs**

In `src/features/plan-viewer/use-plan.ts`, replace the `usePlan` doc comment's NOTE paragraph (the block starting "NOTE: `planFileChanged` only fires for host-side plan writes...") with:

```ts
 * A workspace-scoped filesystem watcher publishes `planFileChanged` whenever a
 * `.helmor/plans/*.mdx` file changes — including the agent's own in-place edits
 * during a request-changes turn — so the rendered plan auto-refreshes live.
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/shell/hooks/use-ui-sync-bridge.ts src/features/plan-viewer/use-plan.ts
git commit -m "feat(plans): live plan refresh via slug-predicate invalidation"
```

---

## Task 8: Frontend test — predicate invalidation across sessions

**Files:**
- Create: `src/shell/hooks/use-ui-sync-bridge.test.tsx` (if a sibling test already exists, extend it instead)

First check for an existing test: `ls src/shell/hooks/use-ui-sync-bridge.test.tsx`. If present, add the test case there and skip the scaffold below.

- [ ] **Step 1: Write the failing test**

Create `src/shell/hooks/use-ui-sync-bridge.test.tsx`:

```tsx
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { helmorQueryKeys } from "@/lib/query-client";
import type { UiMutationEvent } from "@/lib/api";

// The bridge's invalidation logic for planFileChanged, exercised directly
// against a QueryClient. We assert the slug-predicate invalidates the matching
// plan query under ANY session, plus all plan lists, and leaves unrelated
// plans untouched.
function applyPlanFileChanged(qc: QueryClient, event: Extract<UiMutationEvent, { type: "planFileChanged" }>) {
	void qc.invalidateQueries({
		predicate: (query) =>
			query.queryKey[0] === "plan" && query.queryKey[2] === event.slug,
	});
	void qc.invalidateQueries({
		predicate: (query) => query.queryKey[0] === "planList",
	});
}

describe("planFileChanged invalidation", () => {
	it("invalidates the slug's plan across sessions and all plan lists", () => {
		const qc = new QueryClient();
		// Two sessions render the same plan slug.
		qc.setQueryData(helmorQueryKeys.plan("session-a", "my-plan"), { summary: {}, content: "" });
		qc.setQueryData(helmorQueryKeys.plan("session-b", "my-plan"), { summary: {}, content: "" });
		// An unrelated plan must NOT be invalidated.
		qc.setQueryData(helmorQueryKeys.plan("session-a", "other-plan"), { summary: {}, content: "" });
		qc.setQueryData(helmorQueryKeys.planList("session-a"), []);

		applyPlanFileChanged(qc, { type: "planFileChanged", workspaceId: "w1", slug: "my-plan" });

		expect(qc.getQueryState(helmorQueryKeys.plan("session-a", "my-plan"))?.isInvalidated).toBe(true);
		expect(qc.getQueryState(helmorQueryKeys.plan("session-b", "my-plan"))?.isInvalidated).toBe(true);
		expect(qc.getQueryState(helmorQueryKeys.plan("session-a", "other-plan"))?.isInvalidated).toBe(false);
		expect(qc.getQueryState(helmorQueryKeys.planList("session-a"))?.isInvalidated).toBe(true);
	});
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun x vitest run src/shell/hooks/use-ui-sync-bridge.test.tsx 2>&1 | tail -20`
Expected: PASS.

If the test instead duplicates the real handler logic in a way you'd rather assert against the actual hook, that is acceptable refactoring — but the predicate behavior (slug match across sessions, all planLists, no collateral) is the contract to verify.

- [ ] **Step 3: Commit**

```bash
git add src/shell/hooks/use-ui-sync-bridge.test.tsx
git commit -m "test(plans): planFileChanged invalidates plan by slug across sessions"
```

---

## Task 9: Full verification

- [ ] **Step 1: Rust tests (lib + integration)**

Run: `cd src-tauri && cargo test --tests 2>&1 | tail -30`
Expected: PASS (no pipeline snapshot drift — storage shape unchanged).

- [ ] **Step 2: Rust lib tests**

Run: `cd src-tauri && cargo test -p helmor --lib 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 3: Frontend tests**

Run: `bun run test:frontend 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 4: Lint + typecheck**

Run: `bun run typecheck 2>&1 | tail -10 && bun run lint 2>&1 | tail -15`
Expected: clean.

- [ ] **Step 5: Changeset**

Create `.changeset/live-plan-refresh.md`:

```markdown
---
"helmor": patch
---

Plan tab now refreshes live when the agent revises an MDX plan in place, so request-changes edits appear without re-selecting the tab.
```

- [ ] **Step 6: Commit**

```bash
git add .changeset/live-plan-refresh.md
git commit -m "chore: changeset for live plan refresh"
```

---

## Self-Review Notes

- **Spec coverage:** §1 watcher → Tasks 4-6; §2 event contract → Tasks 1-2; §3 frontend → Task 7; §4 tests → Tasks 4, 1, 8, and Task 9 (snapshot non-impact verified). All covered.
- **Type consistency:** `PlanFileChanged { workspace_id, slug }` (Rust) ↔ `{ type: "planFileChanged"; workspaceId; slug }` (TS) consistent across Tasks 1, 2, 5, 7, 8. `slug_from_plan_path`, `PlanWatcherManager::{new,sync_from_db,unwatch,shutdown}`, `store::plans_dir` names match across Tasks 3-6.
- **Manual smoke (optional, post-merge):** In a dev build, open a plan, have the agent edit the `.mdx`, confirm the tab updates within ~1s without re-select (see CLAUDE.md Tauri MCP playbook).
