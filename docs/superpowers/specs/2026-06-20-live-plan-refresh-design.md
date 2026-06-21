# Live Plan Refresh — Design

**Date:** 2026-06-20
**Branch:** `Legacynnn/mdx-planning-feature-discussion`
**Status:** Approved (pre-implementation)

## Problem

The MDX planning feature surfaces a `.helmor/plans/<slug>.mdx` document in a Plan
tab and lets the user request changes, which sends a prompt back to the agent.
The agent revises the plan **in place using its own Edit/Write tools**. Because
the `.mdx` is an ordinary file, no host command runs, so no `PlanFileChanged`
ui-sync event fires. The rendered plan therefore does **not** auto-refresh — it
only updates on tab re-select or window refocus (the queries use `staleTime: 0`).

This breaks the core loop of the feature: request changes → agent revises → see
the revision. The user has to manually re-select the tab to discover the agent's
edits.

### Why the existing watcher doesn't help

`src-tauri/src/git/watcher.rs` runs a per-workspace `notify` watcher, but it
watches only `.git` internals (`HEAD`, `refs/heads`, `refs/remotes`,
`packed-refs`, the common dir). It never watches the working tree, so
`.helmor/plans/*.mdx` writes are invisible to it.

### Why host events alone don't help

`PlanFileChanged` is published only by the host commands `write_plan` and
`set_plan_status` (`src-tauri/src/commands/plans.rs`). Those fire for
host-initiated writes (e.g. status changes from the UI), never for agent edits.

## Goal

When the agent rewrites a `.helmor/plans/*.mdx`, the open Plan tab updates within
~300ms with no manual tab re-select.

## Approach

Event-driven via a dedicated filesystem watcher (chosen over routing agent edits
through a host MCP tool, which can't be enforced, and over frontend polling,
which violates the codebase's "UiMutationEvent, never ad-hoc polling"
convention).

### 1. Backend: plans filesystem watcher

New module `src-tauri/src/plans/watcher.rs`, modeled on `git/watcher.rs`:

- One debounced (`notify_debouncer_full`, ~300ms) **recursive** watcher per
  operational **worktree** workspace, pointed at `<workspace>/.helmor/plans/`.
- Lifecycle synced with DB state using the same pattern as the git watcher:
  start when a workspace becomes ready, stop on unwatch and on app shutdown.
  Reuse the watchable-workspace enumeration approach already in the git watcher
  (operational state + worktree mode).
- The plans dir may not exist yet. The watcher watches the parent `.helmor/`
  (or creates `.helmor/plans/` lazily) so the first plan write is caught. Mirror
  whatever is simplest and robust; prefer watching `.helmor/plans/` and (re)arm
  it when the dir appears.
- On any create/modify event whose path ends in `.mdx` (ignore editor temp
  files: `.swp`, `~`, dotfile-prefixed temp, non-`.mdx`), derive the `slug` from
  the file stem and publish a refresh event.

### 2. Event contract: decouple from session id

The on-disk truth is *workspace + slug*. Query keys are *session + slug*
(`["plan", sessionId, slug]`, `["planList", sessionId]`). The plan surface is
always rendered under the active thread session (`planSessionId = threadSessionId`
in `panel/container.tsx`), but plan files are workspace-global. Tying the refresh
event to a single session is therefore brittle.

Change the event to carry the on-disk identity:

- `UiMutationEvent::PlanFileChanged { workspace_id: String, slug: String }`
  (replaces the current `{ session_id, slug }`).
- Update the existing host publishers (`write_plan`, `set_plan_status` in
  `commands/plans.rs`): they already resolve a workspace directory from the
  session; resolve `workspace_id` instead (the session→workspace mapping is
  already available via `sessions::workspace_id_for_session`).
- Update the camelCase wire-format test in `ui_sync/events.rs`.

### 3. Frontend

- Mirror the new variant shape in `src/lib/api.ts`
  (`PlanFileChanged: { workspaceId, slug }`).
- `src/shell/hooks/use-ui-sync-bridge.ts`: invalidate via **predicate** rather
  than exact key —
  - invalidate any `["plan", *, slug]` query (refresh the open plan regardless of
    which session opened it), and
  - invalidate any `["planList", *]` query (so a newly created plan's tab
    appears).
- `usePlan` / `usePlanList` hooks are unchanged. Remove the now-stale
  "won't auto-refresh / only updates on tab re-select" caveat from the
  `use-plan.ts` doc comment.
- The `OPEN_PLAN_EVENT` window-event path in `panel/container.tsx` stays: it
  still drives auto-select of a freshly created plan tab. Its manual planList
  invalidation is now redundant with the watcher but harmless; keep it.

### 4. Tests

Required because the change touches `ui_sync` and adds a watcher:

- Rust unit test: `.mdx` filename → slug derivation, and the filter that ignores
  non-`.mdx` / editor temp files.
- Rust: update the `PlanFileChanged` camelCase serialization test in
  `events.rs` for the new `{ workspaceId, slug }` shape.
- Frontend (vitest): a `planFileChanged` event invalidates the correct plan +
  planList queries across multiple sessions via the predicate.
- No pipeline snapshot impact — the on-disk storage shape is unchanged.

## Trade-offs

- **Watcher cost:** one lightweight FSEvents/inotify watcher per operational
  worktree workspace, same order as the git watcher already pays — negligible.
- **Replacing vs adding `session_id`:** replacing is cleaner; the only consumers
  are the two host publishers and the single bridge handler, all updated here.
  No external API depends on the old shape.
- **Dedicated watcher vs folding into git watcher:** kept separate. The git
  watcher's concern is `.git` refs/HEAD; mixing working-tree plan watching into
  it would blur that responsibility and complicate its event-filtering logic.

## Out of scope

- Live sync *during* a single streaming turn beyond file-write granularity (we
  refresh on file write, which is the natural unit).
- A "plan completed" lifecycle signal, interactive OpenQuestions answers, and new
  plan component types — separate increments.
