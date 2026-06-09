# Kanban Board Overhaul — Design

Date: 2026-06-08
Branch: `Legacynnn/legacy-features-reimplement`
Area: `src/features/dashboard/` (+ one new Rust command)

## Problem

The dashboard kanban board (workspaces grouped into status columns) was added
recently but is rough: flat column headers with no visual differentiation,
drag-and-drop that doesn't actually work in the real webview, sparse cards, and
no way to filter by repository.

## Goals

1. **Column headers**: per-column tinted background + status icon.
2. **Drag-and-drop**: fix it, add a drop indicator, support reorder within a column.
3. **Richer cards**: branch icon, PR-state icon, diff stats (+/−, files changed).
4. **Repo filter**: multi-select / "All repos", persisted across sessions.
5. Keep the shared sidebar query (`list_workspace_groups`) fast (pure DB read).

## Non-goals

- No third-party DnD library (keep native HTML5 drag).
- No changes to `pipeline/`, `schema.rs`, or storage shape.
- No new sidebar columns or status types.

## Design

### Columns (visual)

`DASHBOARD_COLUMNS` gains `icon` (lucide component) and a `tone` key. Each column
header renders a tinted strip (`bg-{tone}/10`), the icon, label, and count.

| Column | id | Icon | Tone |
|---|---|---|---|
| In progress | `progress` | `LoaderCircle` | blue |
| Review | `review` | `GitPullRequestArrow` | amber |
| Done | `done` | `CheckCircle2` | emerald |
| Backlog | `backlog` | `CircleDashed` | slate |
| Canceled | `canceled` | `Ban` | rose |

Tones map to existing Tailwind/oklch tokens (chart-* / semantic) — no app-* tokens
(those are undefined here, per commit 660430da).

### Drag-and-drop

Root cause of the breakage: the card is a `<button>` nested inside the `draggable`
div; buttons swallow native drag-start outside jsdom.

Fix:
- The **card element itself** is `draggable` and is a `<div role="button">` with
  `onClick` + `onKeyDown` (Enter/Space) for open, replacing the `<button>`.
- On `dragOver` over a column, compute the insertion index from pointer Y vs card
  midpoints; render a 2px **drop-indicator line** at that slot and highlight the column.
- On `drop`, pass the computed `beforeWorkspaceId` (today hardcoded `null`) to
  `onMoveWorkspace`, enabling **reorder within a column** as well as cross-column moves.
- Keep the `draggingIdRef` fallback for jsdom; keep the `text/workspace-id` MIME.

### Cards

A `WorkspaceKanbanCard` footer/meta gains:
- `GitBranch` icon before the branch name.
- PR icon by state: open → `GitPullRequest` (emerald), merged → `GitMerge` (purple),
  closed → `GitPullRequest` (rose); keep the `#NN` text.
- Diff stats: `+{insertions}` (chart-2/green) `−{deletions}` (destructive/red) and a
  `{filesChanged} files` hint, rendered only when stats exist and are non-zero.

### Repo filter

- New header control: a Popover with a checkbox list — "All repos" plus each repo
  (avatar + name). Repos are derived from the loaded workspace rows (repoId/repoName/
  repoIconSrc), so the list is always in sync; no extra query.
- Selected repo ids persisted to `localStorage` (key `helmor.dashboard.repoFilter`).
  Empty/absent selection = all repos.
- Filtering happens after column bucketing: rows whose `repoId` isn't selected are
  dropped from every column; counts reflect the filtered view.

### Diff data plumbing (backend + query)

`list_workspace_groups` stays a pure DB read (it backs the sidebar; adding git calls
would tank it). Instead:

- New Tauri command **`list_workspace_diff_stats`** → `Vec<WorkspaceDiffStat>` where
  `WorkspaceDiffStat { workspace_id, insertions, deletions, files_changed }`.
  Computed with a **lightweight 1–2 git calls per workspace** (`git diff --shortstat`
  / `--numstat` against the workspace's target branch + working tree), run with
  bounded concurrency. Reuses the git helpers under `workspace/files/`.
- New dashboard-only React Query `workspaceDiffStatsQueryOptions()` with a sane
  `staleTime` + `refetchInterval`, fetched **only while the board is mounted**.
  `useDashboardBoard` merges the stat map onto rows by id.

## Components / files

- `src/features/dashboard/hooks/use-dashboard-board.ts` — add icon/tone to columns,
  repo-filter state (persisted), merge diff stats, expose repo list + filter setter.
- `src/features/dashboard/index.tsx` — tinted+iconed headers, repo-filter control,
  DnD drop-indicator + reorder, pass diff stats to cards.
- `src/features/dashboard/kanban-card.tsx` — branch icon, PR-state icon, diff footer;
  `<button>` → draggable `<div role="button">`.
- `src/features/dashboard/components/repo-filter.tsx` — new Popover multi-select.
- `src/features/dashboard/container.tsx` — wire `beforeWorkspaceId` through (already
  typed), pass diff stats.
- `src/lib/api.ts` — `listWorkspaceDiffStats()` + `WorkspaceDiffStat` type.
- `src/lib/query-client.ts` — `workspaceDiffStatsQueryOptions()` + query key.
- `src-tauri/src/commands/...` — `list_workspace_diff_stats` command.
- `src-tauri/src/workspace/...` — diff-stat aggregation helper + Rust unit test.

## Testing

- Frontend (vitest): repo filter narrows columns + persists; DnD reorder computes a
  non-null `beforeWorkspaceId`; card renders branch/PR icons + diff footer; column
  header renders icon.
- Rust: unit test for the shortstat/numstat aggregation parsing.
- No `pipeline/` or schema changes, so no insta snapshot updates needed.

## Risks

- Diff stats cost: bounded concurrency + board-only fetch + staleTime keep it off the
  hot path. Worst case (many large repos) the footer just populates a beat late.
- Deriving repos from rows misses repos with zero workspaces — acceptable (nothing to
  show for them anyway).
