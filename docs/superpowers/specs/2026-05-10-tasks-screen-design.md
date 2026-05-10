# Tasks Screen Design

Date: 2026-05-10
Status: Approved, ready for implementation planning

## Summary

A new top-level screen in Helmor that surfaces work-in-flight from three sources — Linear tasks, GitHub PRs, GitHub issues — scoped to a selected repository. The screen mirrors the visual model of Linear's own list view (status-grouped, collapsible, filterable rows) and integrates with Helmor's existing workspace model: a row can open the workspace already linked to it, or kick off a new one with the item attached as context.

## Goals

- Single place to see open work across Linear, GitHub PRs, and GitHub issues.
- Per-repo scoping with an "All repos" aggregate view.
- Always-visible, tab-specific filters with state that persists across app restarts.
- Detail panel for any item, reusing the existing GH issue preview pattern but richer.
- Foundation for later additions (write actions, OAuth, kanban view) without rework.

## Non-Goals (v1)

- Linear OAuth — Personal API Key only.
- Linear write actions (status changes, reassign, comments).
- GitHub write actions.
- Pagination beyond the first 50 items per tab.
- Server-side search.
- Multiple Linear accounts.
- Virtualized list rendering.
- Group-by anything other than status.
- Wiring up the "+ New task" button (stub only).
- Kanban / board layout for tasks (list view only).

## Architecture

### Three-source, one-row contract

Linear tasks, GitHub PRs, and GitHub issues are normalized to a common `TaskListItem` shape so the list component is source-agnostic:

```ts
type TaskListItem = {
  id: string;            // "SUPER-187" or "#4168"
  source: "linear" | "github-pr" | "github-issue";
  title: string;
  status: { key: string; label: string; color: string };
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  labels: { name: string; color: string }[];
  assignee?: { login: string; avatarUrl: string };
  updatedAt: string;
  url: string;
  raw: unknown;          // adapter-specific payload for detail panel
};
```

Adapters live both backend-side (Rust → typed payload) and frontend-side (typed payload → `TaskListItem`, pure functions).

### Frontend layout (`src/features/tasks/`)

```
src/features/tasks/
  index.tsx                     screen shell
  container.tsx                 data fetching + filter state wiring
  hooks/
    use-tasks-filters.ts        per-repo persisted filter state
    use-tasks-query.ts          unified query layer (active tab only)
  adapters/
    linear.ts                   LinearIssue → TaskListItem
    github-pr.ts                GhPr → TaskListItem
    github-issue.ts             GhIssue → TaskListItem
  components/
    repo-switcher.tsx
    tab-bar.tsx                 tabs + divider + tab-specific filter dropdowns
    item-list.tsx               grouped, collapsible list (groups by status)
    item-row.tsx                priority · id · title · labels · assignee · date
    detail-panel.tsx            slide-in detail view
    empty-states.tsx            disconnected / unmapped / empty
```

A new sidebar entry "Tasks" sits alongside Kanban / History / Inbox. App.tsx switches to `TasksScreenContainer` the same way it switches to `KanbanScreenContainer`. Selected repo and active tab are component-local React state.

### Backend — Linear adapter (`src-tauri/src/forge/linear/`)

```
mod.rs        public API: list_tasks, get_task, list_teams, auth helpers
auth.rs       get/set/clear API key in settings table
client.rs     thin reqwest GraphQL client; Authorization: <api_key>
tasks.rs      ListTasks, GetTask, ListTeams, ListUsers GraphQL queries
types.rs      Rust structs mapped to Linear's GraphQL shape
```

Linear authenticates with the personal API key sent verbatim in the `Authorization` header (no `Bearer ` prefix). One endpoint: `POST https://api.linear.app/graphql`. Rate limit ~1500 req/hour per key.

### Backend — Tauri commands

New `src-tauri/src/commands/linear.rs`:

```
linear_set_api_key(key)
linear_clear_api_key()
linear_get_auth_status() -> { connected, viewer? }
linear_list_teams() -> Vec<LinearTeam>
linear_list_tasks(repo_id, filters) -> Vec<LinearIssue>
linear_get_task(id) -> LinearIssueDetail
linear_set_repo_team(repo_id, team_id)
```

New in `src-tauri/src/commands/github.rs` (or a new submodule):

```
github_list_repo_prs(repo_id, filters) -> Vec<GhPr>
github_list_repo_issues(repo_id, filters) -> Vec<GhIssue>
```

These reuse the existing `gh` CLI + multi-account token resolution from `forge/github/accounts.rs`.

### Schema changes

Idempotent migrations in `src-tauri/src/schema.rs`:

```sql
ALTER TABLE repos ADD COLUMN linear_team_id TEXT;
ALTER TABLE workspaces ADD COLUMN linear_task_id TEXT;
```

Linear API key stored in the existing settings table under key `linear.api_key` (single row, per-app — one Linear account).

### Data flow

```
User selects repo + tab + filters
  → container picks the right query hook (enabled only for active tab)
    → Rust command (linear_list_tasks | github_list_repo_prs | github_list_repo_issues)
      → Linear GraphQL / `gh` CLI
    ← typed payload
  ← frontend adapter → TaskListItem[]
  → item-list groups by status, renders rows
```

"All repos" mode fans out: for each repo that has the relevant integration linked, run the per-repo query and merge client-side. Empty repos are silently skipped.

## UI

### Top bar layout

```
[ Superset ▾ ]  |  Tasks  PRs  Issues  |  [Status ▾] [Assignee ▾] ...  |  [+ New task] [Search]
   repo               tabs                  tab-specific filters             actions
```

Vertical dividers separate the three groups. Active filter value lives inside the dropdown trigger ("Status: In Progress 16"); no separate chip row.

### Filters per tab

| Tab | Filters |
|---|---|
| Tasks (Linear) | Status, Assignee, Search |
| PRs (GitHub) | State, Author/Assignee, Linked to issue, Search |
| Issues (GitHub) | State, Labels, Assignee, Search |

Filter dropdowns swap based on active tab. Search is client-side over the fetched rows.

### Grouping

Hardcoded group-by-status. Group header: `<status icon> <label> <count>` + chevron. Click toggles collapse. Collapsed state persists per repo + tab.

### Row anatomy (left to right)

`priority icon` · `id` (mono) · `title` · `labels` (right-aligned) · `assignee avatar` · `relative date`

In "All repos" mode, a small repo badge appears before the id.

### Detail panel

Slide-in from right, ~520px wide. List stays mounted underneath; scroll position preserved.

- Header: `< Back` · repo · id · external-link icon · title · status pill · priority · assignee · updated-at
- Body: markdown description, then source-specific extras
  - Linear: project / cycle / due date
  - GH PR: source/target branch, check status, linked issues
  - GH issue: linked PRs
- Sticky action bar:
  - Read: Open in browser, Copy link, Copy as markdown
  - Workspace: "Open workspace" (shown only if a workspace is already linked), "Start workspace from this"

Detail data fetched via existing `getInboxItemDetail` (GH) or new `linear_get_task` (Linear).

### Keyboard

- `Enter` on a row: open detail panel
- `↑ / ↓` while panel open: navigate rows, panel content swaps
- `Esc`: close panel
- `Cmd+O`: open in browser from panel

### Empty / disconnected states

- Tasks tab + no Linear key: "Connect Linear" CTA → Settings.
- Tasks tab + key OK + no team linked on this repo: inline "Link Linear team" picker calling `linear_list_teams`.
- PRs / Issues + repo has no `forge_login`: "Sign in to GitHub" CTA.

## Persistence

Persisted blobs in the settings table (read on screen mount, debounced 500ms on write):

- `tasks.filters.v1`: `Record<repoId | "all", Record<tab, Filters>>`
- `tasks.collapsedGroups.v1`: `Record<repoId | "all", Record<tab, string[]>>`
- `tasks.lastView.v1`: `{ repoId, tab }` — restored on screen reopen

React Query: per-tab query keys, `staleTime: 60s`, refetch on window focus. No `PERSIST_META` — Tasks data is not required to paint on cold start.

## Error handling

- Linear 401 → `LinearError::Unauthorized` → Tasks tab shows "Linear disconnected, reconnect in Settings".
- Linear other errors → toast + retry button in the tab body.
- GitHub errors surface via the existing forge error path.
- Settings JSON read/write failures: log + fall back to defaults (no crash).

## Performance

- No virtualization in v1. ~50 rows per tab × handful of groups is well within React's comfort zone.
- First page only (50 items). If a team has more, show "Showing first 50" hint; client-side search filters those.
- Tab queries are disabled when the tab is inactive (`enabled: activeTab === ...`).

## Testing

- `src-tauri/src/forge/linear/`: unit tests with mocked HTTP responses for each GraphQL query.
- `src/features/tasks/adapters/*.ts`: vitest tests for each `→ TaskListItem` mapper.
- Filter persistence: vitest round-trip test, including missing-key fallback.
- Detail panel: vitest smoke test rendering each of the three sources.
- No pipeline snapshot tests required — Tasks screen does not touch the message pipeline.

## Build order

Each step is independently mergeable.

1. Linear adapter backend (module, auth storage, schema migrations, `list_teams`, `get_auth_status`).
2. Settings UI for Linear API key (paste, viewer name on success, disconnect).
3. GitHub list commands (`github_list_repo_prs`, `github_list_repo_issues`).
4. Tasks screen shell (sidebar entry, App.tsx wiring, repo switcher, tab bar, empty states). No data yet.
5. List rendering (`TaskListItem`, adapters, item-list with grouping/collapse, item-row).
6. Filters + persistence (dropdowns per tab, persisted state, last-view memory).
7. Detail panel (extract `ItemDetailLayout`, detail fetches, action bar, keyboard nav).
8. Workspace integration ("Open workspace", "Start workspace from this"; set `linear_task_id` on creation).
9. "All repos" mode (fan-out queries, repo badge on rows).

## Open questions

None at the time of this spec. Anything that turns out to need a decision during implementation should be added back here.
