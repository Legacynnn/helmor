# Design: First-class GitHub Issues on the Tasks board + Linear in the context sidebar

**Date:** 2026-06-21
**Status:** Approved (ready for implementation planning)

## Summary

Make GitHub issues a first-class, natively-editable provider on Helmor's **Tasks board** (today hard-coded to Linear), and surface **Linear issues in the context sidebar** (the Cmd+Shift+C inbox) as read + attach cards. Build a **dedicated, robust `integrations/github/` client** and **rebuild the Cmd+Shift+C GitHub-issues path on top of it** so there is one canonical GitHub-issue source feeding both surfaces.

## Background — current state

There are two unrelated subsystems:

1. **Tasks board** — `src/features/tasks/` (frontend) + `src-tauri/src/integrations/` (backend).
   - Normalized `ProviderTask` model (`integrations/provider.rs`), local SQLite mirror (`models/tasks.rs` → `TaskView`), write-back, auto-sync, agent-review, start-workspace.
   - **Hard-coded to Linear:** `integrations_commands.rs::ensure_supported` rejects any non-Linear provider and calls `linear::` directly. `container.tsx` sets `const provider = "linear"`.
   - `provider-tab-bar.tsx` already renders **Linear / GitHub Issues / ClickUp** tabs; GitHub & ClickUp are disabled.

2. **Context sidebar / inbox** — `src/features/inbox/`, `src/features/workspace-start/context-sidebar.tsx` (frontend) + `src-tauri/src/forge/github/inbox.rs` (backend).
   - Toggled by **Cmd+Shift+C** (`composer.toggleContextPanel`). Read-mostly `SourceCard`s for GitHub/GitLab **issues, PRs, discussions** via `list_inbox_items` (the `forge` backend).
   - Linear & Slack are listed as **"coming soon."**
   - `ContextCard` + `LinearIssueMeta` types **already exist** in `src/lib/sources/types.ts` (`source: "linear"` is already a valid `ContextCardSource`).

## Decisions (from brainstorming)

- **GitHub parity:** native integration — go as far as feasible (editable board, write-back, create, agent-review, start-workspace).
- **GitHub scope source:** **per-repository selector** (mirrors Linear's team selector).
- **Linear in sidebar:** show **assigned/involved** issues as read + attach cards; full editing stays on the board.
- **GitHub client:** build a **dedicated `integrations/github/` client** and **rebuild the Cmd+Shift+C GitHub-issue path** to use it.
- **GitHub board columns:** **Open / Closed / Not planned** mapped to the existing `TaskStatusKind` lifecycle.
- **GitHub auth:** **reuse the existing bundled `gh` auth** (no API-key entry); "connect" = pick the repo.
- **Delivery:** **board first** (Phases 1–3), **sidebar second** (Phase 4). Smaller, reviewable PRs.

## Architecture

The spine is making the `integrations` layer **multi-provider**, then adding GitHub as a sibling of Linear, then lighting up both surfaces.

### Normalized model reuse

GitHub issues map onto the existing normalized types in `integrations/provider.rs` (`ProviderTask`, `TaskStatus`, `TaskStatusKind`, `TaskPriority`, `TaskAssignee`, `TaskLabel`, `TaskProject`, `IntegrationTeam`, `IntegrationStatus`). No model changes expected; the local mirror (`models/tasks.rs`) is already provider-agnostic (DB key = `provider:external_id`).

### GitHub → normalized mapping

| Normalized concept | GitHub mapping |
| --- | --- |
| `IntegrationTeam` | **Repository** — `{ id: repo node id, key: repo name, name: "owner/repo" }` |
| `TaskStatus` (fixed set) | `Open`→`Unstarted`; `Done`→`Completed` (close as `completed`); `Not planned`→`Canceled` (close as `not_planned`) |
| status write-back | open/close/reopen issue mutations (set close reason for Done vs Not planned) |
| `TaskLabel` | native GitHub labels (name + color), editable |
| `TaskAssignee` | GitHub assignees → single assignee in the model (set/clear); `list_assignees` = assignable users |
| `TaskPriority` | none → `Priority::None` (priority editor hidden for GitHub) |
| `TaskProject` | none → `None` (GitHub Projects v2 out of scope) |
| `identifier` | `owner/repo#123` |
| `url` | issue HTML URL |

## Components

### Backend

- **`integrations/provider.rs`** — add a `TaskProvider` trait:
  - `list_teams()` (Linear teams / GitHub repos)
  - `list_issues(team)`
  - `list_states(team)`, `list_labels(team)`, `list_assignees(team)`, `list_projects(team)`
  - `update_issue(external_id, patch)`, `create_issue(team, input)`
  - `search_involved()` — viewer's assigned/involved issues, for the sidebar
- **`integrations/mod.rs`** — add `GITHUB_PROVIDER = "github"`; a `resolve_provider(&str) -> Box<dyn TaskProvider>` (or equivalent dispatch).
- **`integrations/linear/`** — wrap the existing functions in a `TaskProvider` impl. No behavior change.
- **`integrations/github/`** (new: `client.rs`, `queries.rs`, `types.rs`, `map.rs`, `mod.rs`) — GraphQL client over the bundled `gh` auth (reuse the forge GitHub auth/token path). Two query modes: **per-repo issue list** (board) and **`involves:@me` search** (sidebar). Implements `TaskProvider`.
- **`commands/integrations_commands.rs`** — drop the Linear hard-coding in `ensure_supported`; route every command through `resolve_provider`. Make `connect_integration` provider-aware: the GitHub branch validates `gh` auth instead of requiring an API key.

### Frontend — tasks board (Phase 3)

- **`features/tasks/container.tsx`** — replace `const provider = "linear"` with provider state driven by `ProviderTabBar`; persist the selection (localStorage). All downstream queries already thread `provider`/`teamId`.
- **Repo selector** in the screen header (replacing the Linear team-name slot for GitHub) + a GitHub onboarding empty-state ("Uses your GitHub login — pick a repository"), no API-key field.
- **`features/tasks/components/provider-tab-bar.tsx`** — enable the GitHub Issues tab.
- **Per-provider field gating:**
  - `filters/facets.ts` — `facetsForProvider("github")` drops priority/project facets.
  - `components/task-detail-view.tsx` and `components/create-task-dialog.tsx` — hide priority + project editors for GitHub; keep title, body, status, labels, assignee.
- **Settings → Integrations** — add a GitHub section reflecting gh-auth status + selected repo.

### Frontend — context sidebar (Phase 4)

- **Linear source** — enable the "coming soon" Linear inbox source. Map `search_involved()` Linear results → existing `ContextCard` + `LinearIssueMeta`. New `features/source-detail/linear/issue-view.tsx` detail panel + "add to context".
- **GitHub issues rebuilt** — the sidebar's GitHub **issues** sub-tab fetches via the new `integrations/github` client's `involves:@me` search (and its detail view), replacing the `forge/github/inbox.rs` issue path. **PRs and discussions stay on forge.**

## Data flow

- **Board:** `ProviderTabBar` selects provider → `get_integration_status(provider)` (connected + selected team/repo) → `list_tasks` / `sync_tasks` route through `resolve_provider` → normalized `ProviderTask` upserted into the SQLite mirror → `TaskView` to the board. Edits → `update_task` → provider write-back → mirror refresh → `UiMutationEvent::TaskChanged`.
- **Sidebar (Linear):** inbox query → `search_involved()` (Linear) → `ContextCard` list → `SourceCard` → Linear detail view.
- **Sidebar (GitHub issues):** inbox query → `integrations/github` `involves:@me` search → `ContextCard` → `SourceCard` → GitHub detail view.

## Error handling

- GitHub not authed → board empty-state prompts gh auth (reuse existing GitHub identity gate messaging); inbox GitHub-issues tab shows the same auth prompt.
- Write-back failure → optimistic cache rollback via `invalidateQueries` (already the pattern in `moveTask`/`update_task`).
- Repo with no issues → existing `EmptyTeamState`.
- `search_involved` failure in the sidebar → existing inbox error surface.

## Testing

- **Rust unit tests** for `integrations/github/map.rs`: issue→`ProviderTask` mapping, status round-trip (Open/Done/Not planned ↔ open/closed+reason), label/assignee mapping, `involves:@me` parsing.
- **Rust** `connect_integration("github")` auth-validation path and `resolve_provider` dispatch (Linear unchanged, GitHub routed).
- **Frontend tests** for provider gating: `facetsForProvider("github")`, detail/create field hiding, provider-tab selection persistence. Extend existing `tasks-board.test.tsx` / `task-detail-view.test.tsx`.
- **Inbox tests** (`use-inbox-items.test.tsx`, `source-card.test.tsx`) extended for the Linear source and the rebuilt GitHub-issue source.
- This change does **not** touch the message pipeline (`pipeline/`, `agents/` persistence, `schema.rs`, storage shape), so no pipeline snapshot coverage is required. If any new `integration_connections`/`tasks` column is needed (not anticipated), add `schema.rs` migration + coverage.

## Phasing (delivery: board first)

- **Phase 1 — Multi-provider core (backend).** `TaskProvider` trait + `resolve_provider` dispatch; Linear wrapped as an impl; `GITHUB_PROVIDER` const; commands de-hard-coded. No behavior change for Linear. *Ships with Phase 2/3.*
- **Phase 2 — GitHub provider (backend).** `integrations/github/` client over gh auth: repos-as-teams, per-repo issue list, synthetic statuses, labels, assignees, create/update (open/close/reopen, labels, assignee, title/body), plus `involves:@me` search. Provider-aware `connect_integration`.
- **Phase 3 — GitHub on the board (frontend).** Provider state + enabled tab; repo selector + gh-auth onboarding; per-provider field gating; Settings → Integrations GitHub section. **First deliverable: GitHub first-class on the Tasks board.**
- **Phase 4 — Context sidebar (follow-up).** Enable Linear inbox source (assigned/involved) + Linear detail view + add-to-context; rebuild GitHub-issue inbox path on the new `integrations/github` client; PRs/discussions remain on forge.

## Out of scope

- GitHub Projects v2 status columns (conflicts with per-repo scoping; possible future extension).
- GitHub issue priority (no native concept; could later read a `priority:` label convention).
- ClickUp provider (tab stays disabled).
- Migrating GitHub **PRs/discussions** or **GitLab/Slack** off the forge backend.
