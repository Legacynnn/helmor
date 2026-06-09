# Dashboard + Kanban & Top-Level Screen Navigation Foundation

**Date:** 2026-06-07
**Issue:** Legacynnn/helmor#36 (Fork feature roadmap — re-implement on fresh upstream)
**Status:** Approved design, ready for implementation plan

## Context

`Legacynnn/helmor` is being rebuilt on top of current upstream `dohooo/helmor` `main`. The old fork's
features are re-implemented cleanly rather than copy-pasted. This spec covers the **first slice**:

1. A shared **top-level screen navigation foundation** that all three new screens (Dashboard, Tasks,
   History) sit on.
2. The **Dashboard + Kanban** screen in full.

Tasks and History are decomposed into their own specs (stubs at the end of this doc). They reuse the
foundation defined here.

The old fork is reference material for UX/behavior only — all code here is written fresh against the
current upstream architecture.

## Goals

- Add three real, selectable nav entries to the sidebar — **Dashboard, Tasks, History** — above the
  existing workspace list, which stays exactly as it is today.
- Ship the Dashboard: a full-pane Kanban board over existing workspace data, with drag-to-set-status
  and a lightweight summary header.
- Introduce zero new backend commands for the Dashboard slice (reuse existing queries + mutation).
- Stay cohesive with upstream: same grouped data and same mutation command the sidebar already uses,
  so the board and sidebar can never drift.

## Non-Goals (deferred)

- Tasks / Linear / GitHub integration (own spec).
- History screen (own spec).
- Resource-usage pills, per-repo filtering, charts beyond simple counts.
- Any router introduction — the app stays state-driven.

---

## Section 1 — Navigation Foundation (shared by all three screens)

### Problem

Today the center pane only knows `ShellViewMode = "conversation" | "editor" | "start"` (selection
store), and the sidebar only renders the workspace list. Dashboard, Tasks, and History are full-pane
top-level screens with no home.

### Design

- **`activeScreen` state**: `"none" | "dashboard" | "tasks" | "history"`. `"none"` (default) preserves
  100% of today's behavior. Lives in a small dedicated `useScreenController` in
  `src/shell/controllers/`, kept **orthogonal** to `ShellViewMode` (workspace-pane modes stay
  unchanged). Persist last value to `localStorage` (`helmor.activeScreen`).
- **Sidebar nav buttons**: three distinct nav items (icon + label, active state) rendered **above** the
  workspace list — Dashboard, Tasks, History. They look like real navigation options, NOT a workspace
  group/aggregation. The workspace list below them is untouched and always visible.
- **Selection interplay**: clicking a workspace in the list clears `activeScreen` back to `"none"` and
  shows that workspace's conversation, exactly as now. Clicking a nav button sets `activeScreen` and
  swaps the center pane.
- **Render switch**: extend the center-pane branch (`src/shell/components/workspace-pane-surface.tsx`
  or a thin wrapper) so that when `activeScreen !== "none"` it renders `<DashboardScreen/>` /
  `<TasksScreen/>` / `<HistoryScreen/>`; otherwise the current workspace pane renders unchanged. The
  right inspector/context panel is hidden on these full-pane screens.
- **Feature folders**: `src/features/dashboard/`, `src/features/tasks/`, `src/features/history/`, each
  `index.tsx` + `container.tsx` + `hooks/`, per the codebase feature-folder convention.

### Seam summary

One new state value + one render branch + three sidebar nav entries. No new backend, no router.

---

## Section 2 — Dashboard + Kanban

### Entry

"Dashboard" nav button → `activeScreen = "dashboard"` → full-pane `<DashboardScreen/>`.

### Data

Reuses existing hooks, **no new backend**:

- `workspaceGroupsQueryOptions()` — workspaces already grouped by status.
- `activeStreamsQueryOptions()` — running/busy derivation via `deriveBusyWorkspaceIds`.

### Layout

- **Summary header strip**: per-status counts (In progress / Review / Done / Backlog / Canceled) and a
  live "running" count from active streams. Read-only.
- **Board**: 5 fixed columns in status order — **In progress · Review · Done · Backlog · Canceled** —
  each listing workspace cards from all repos.

### Card contents (from existing `WorkspaceRow` DTO)

- Title, **repo badge** (icon/initials), branch name.
- PR badge when `prSyncState !== "none"` (open/merged/closed) + PR number.
- Unread dot (`hasUnread`).
- **Running indicator**: when the workspace id is in active streams, render the existing
  `HelmorLogoAnimated` component (`src/components/helmor-logo-animated.tsx`) as a small live loader —
  not a generic spinner.
- Click → clears `activeScreen` and opens that workspace's conversation (same path as a sidebar click).

### Drag & drop

Reuse the sidebar's hand-rolled pointer DnD pattern (`src/features/navigation/dnd/`) and the existing
**`moveWorkspaceInSidebar`** command, which updates `status` + `display_order` atomically and broadcasts
a `UiMutationEvent`. Drag to another column = status change; within-column drop = reorder. Both flow
through the same command and the UI-sync bridge, so the board and the sidebar stay in lockstep. **No new
Rust command.** Status↔column mapping reuses `workspaceStatusFromGroupId` / `workspaceGroupIdFromStatus`
from `src/lib/workspace-helpers.ts`.

### Edge cases

- Empty columns show a muted placeholder.
- Archived workspaces excluded (board mirrors live sidebar groups, which already exclude archived).
- A drag that fails to persist rolls back via query invalidation.

### Cohesion wins

Board and sidebar are two views of the same grouped data and the same mutation command — they cannot
drift. Drag logic and status mapping are shared, not duplicated.

---

## Section 3 — Testing

Foundation + Dashboard are **frontend-only**; no `pipeline/` / `schema.rs` / persistence changes, so no
Rust snapshot tests in this slice (those land with the Tasks spec).

Vitest + @testing-library/react:

- `activeScreen` switching: nav buttons set the right screen; selecting a workspace resets to `"none"`.
- Screen render branch shows the correct component per `activeScreen`.
- Column placement of cards by status.
- Card → workspace navigation path.
- Drag to a different column invokes `moveWorkspaceInSidebar` with the correct target status.
- Running card renders `HelmorLogoAnimated`.
- Summary header counts match the grouped data.

Reuse existing frontend query-mock patterns.

---

## Build sequence (for the implementation plan)

1. `useScreenController` + `activeScreen` state + `localStorage` persistence.
2. Sidebar nav buttons (Dashboard/Tasks/History) above the workspace list.
3. Center-pane render branch on `activeScreen`; stub screens for Tasks/History.
4. `<DashboardScreen/>`: summary header + 5-column board fed by existing queries.
5. Card component (badges, unread, `HelmorLogoAnimated`, click-to-open).
6. Drag & drop wired to `moveWorkspaceInSidebar` + status mapping.
7. Tests per Section 3.

---

## Roadmap stubs (separate specs)

### Tasks + Linear/GitHub (largest — own spec)

- Rust `forge/linear/` client mirroring `forge/github/`: thin GraphQL HTTP client + types, auth helpers,
  `get_auth_status` probe (check 401/403 before parsing body).
- Linear API key stored in macOS Keychain (`io.helmor.linear`), mirroring `slack/credentials.rs`.
- Linear settings panel mounted in the settings dialog (`src/features/settings/panels/`).
- Schema (idempotent via `has_table`/`has_column`): `repos.linear_team_id`, `workspaces.linear_task_id`.
- GitHub commands `list_repo_prs`, `list_repo_issues` on the `forge/github/` layer.
- Tasks screen: list/row/empty-state, query keys + `use-tasks-query`, adapters + `TaskListItem`, filters,
  all-repos mode with per-row repo badges, detail panel, "open as workspace" wiring.
- **Open question to resolve in that spec:** build on the existing `triage` / `triage_candidate` system
  vs a parallel Tasks store — likely **extend triage** for cohesion.
- **Snapshot tests required** for schema/persistence changes (per AGENTS.md).

### History screen (smallest — own spec)

- Promote the per-workspace hidden-sessions dropdown (`src/features/panel/header/use-hidden-history.ts`)
  into a full-pane `<HistoryScreen/>` reachable from the sidebar nav.
- Lists sessions per workspace (including hidden/closed); restore + delete.
- Reuses `loadHiddenSessions` / `unhideSession`; likely adds a "list all sessions for workspace" query.
- Decide whether to remove the old header dropdown or keep it as a shortcut.

Both reuse the navigation foundation defined in Section 1.
