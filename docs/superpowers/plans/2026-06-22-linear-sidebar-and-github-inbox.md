# Phase 4 — Linear in the Context Sidebar + GitHub-issue Inbox on the new client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Linear "assigned/involved" issues as first-class cards in the Cmd+Shift+C context sidebar, and route the sidebar's GitHub **issue** fetch + detail through the new `integrations/github` client (one canonical GitHub-issue source), leaving GitHub PRs/discussions and GitLab on the existing forge path untouched.

**Architecture:** Two independent slices on top of the Phase 1–3 work. **4A (Linear → sidebar):** a new Linear "assigned to viewer" GraphQL query in `integrations/linear`, a small mapper from `ProviderTask` to the existing `InboxItem`/`InboxItemDetail` JSON shape, two dedicated Tauri commands (`list_linear_inbox_items`, `get_linear_inbox_item_detail`) since Linear is an API-key `integrations` provider (not a `ForgeProvider`), and frontend wiring that enables the "coming soon" Linear inbox source + a `source-detail/linear/issue-view.tsx`. **4B (GitHub issue reroute):** `integrations/github` gains the canonical issue-search + issue-detail (reusing its `GithubClient`); `forge/github/inbox.rs`'s issue listing + `get_inbox_item_detail` for `GithubIssue` **delegate** to it; the InboxItem/InboxItemDetail output shape is byte-identical so the frontend GitHub path is unchanged.

**Tech Stack:** Rust (Tauri v2, `anyhow`, `serde_json`), the bundled `gh` GraphQL via `forge::github::run_graphql` / the `integrations/github` `GithubClient`, Linear GraphQL via `LinearClient`. Frontend: React 19 + TanStack Query. Tests: `cargo test` (Rust unit + insta), `vitest`.

**Spec:** `docs/superpowers/specs/2026-06-21-github-issues-tasks-and-linear-sidebar-design.md` (Phase 4). Builds on the merged/PR'd Phase 1–3 work (`integrations/github/` provider, `TaskProvider` trait, `GithubClient`).

**Scope/risk note:** 4B is a *delegation*, not a rewrite. The forge issue path shares `IssueOrPrNode`, `issue_or_pr_to_item`, and the `MultiCursor` with PRs/discussions; we do NOT move that shared machinery. We extract only the GitHub **issue search execution + node→InboxItem mapping** and the **issue detail** into `integrations/github`, and have forge call them. PR/discussion/cursor logic stays in forge. This keeps regression surface minimal and the InboxItem contract identical.

---

## File Structure

**4A — Linear sidebar (backend):**
- `src-tauri/src/integrations/linear/queries.rs` — add `VIEWER_ASSIGNED_ISSUES` query
- `src-tauri/src/integrations/linear/mod.rs` — add `list_assigned_issues(api_key)`
- `src-tauri/src/integrations/linear/inbox.rs` (new) — `ProviderTask` → `InboxItem` + `LinearIssueDetail`
- `src-tauri/src/forge/inbox.rs` — add `InboxSource::Linear` + `InboxItemDetail::Linear` variants + `LinearIssueDetail` (or co-locate the detail type in the new linear inbox module and reference it)
- `src-tauri/src/commands/integrations_commands.rs` — `list_linear_inbox_items` + `get_linear_inbox_item_detail` commands
- `src-tauri/src/lib.rs` — register the two commands
- `src-tauri/src/companion/rpc.rs` — add the two commands to the desktop-only group

**4A — Linear sidebar (frontend):**
- `src/lib/api.ts` — `listLinearInboxItems`/`getLinearInboxItemDetail`; widen `InboxItemSource` + `InboxItemDetail`
- `src/lib/query-client.ts` — query keys for linear inbox + detail
- `src/features/inbox/index.tsx` — enable the Linear source (drop "coming soon"); only an "issues" sub-tab
- `src/features/inbox/use-inbox-items.ts` (or a sibling `use-linear-inbox-items.ts`) — Linear branch
- `src/features/source-detail/linear/issue-view.tsx` (new) + `src/features/source-detail/index.tsx` — route `case "linear"`

**4B — GitHub issue reroute (backend):**
- `src-tauri/src/integrations/github/inbox.rs` (new) — `search_issues(...)` + `issue_detail(...)` returning the forge `InboxItem`/`GithubIssueDetail` shapes
- `src-tauri/src/integrations/github/mod.rs` — `pub mod inbox;`
- `src-tauri/src/forge/github/inbox.rs` — issue fetch + `GithubIssue` detail delegate to `integrations::github::inbox`

---

## PHASE 4A — Linear in the context sidebar

### Task A1: Linear "assigned to viewer" query + fetch function

**Files:**
- Modify: `src-tauri/src/integrations/linear/queries.rs`
- Modify: `src-tauri/src/integrations/linear/mod.rs`

- [ ] **Step 1: Add the query**

Append to `queries.rs` (mirror `TEAM_ISSUES`'s node selection so the existing `IssueNode` deserializes unchanged):

```rust
/// Issues currently assigned to the authenticated viewer, newest-updated first.
/// Uses Linear's `viewer.assignedIssues` connection so it spans every team.
pub const VIEWER_ASSIGNED_ISSUES: &str = r#"
query ViewerAssignedIssues($after: String) {
  viewer {
    assignedIssues(first: 100, after: $after, orderBy: updatedAt) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        description
        priority
        url
        updatedAt
        team { id }
        project { id name icon color }
        state { id name type color }
        assignee { id name avatarUrl }
        labels { nodes { id name color } }
      }
    }
  }
}
"#;
```

- [ ] **Step 2: Add a response struct + fetch function**

In `src-tauri/src/integrations/linear/types.rs`, add (near `TeamIssuesData`):

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAssignedIssuesData {
    pub viewer: ViewerAssignedIssues,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAssignedIssues {
    pub assigned_issues: IssueConnection,
}
```

(Confirm `IssueConnection` is the existing paginated wrapper used by `TeamIssuesData` — it has `nodes: Vec<IssueNode>` and `page_info: PageInfo`. If `TeamIssuesData` uses a differently-named connection type, reuse that exact type here.)

In `src-tauri/src/integrations/linear/mod.rs`, add (mirror `list_team_issues`'s pagination):

```rust
/// Issues assigned to the authenticated viewer across all teams, newest first.
pub fn list_assigned_issues(api_key: &str) -> Result<Vec<ProviderTask>> {
    let client = LinearClient::new(api_key)?;
    let mut all = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let data: types::ViewerAssignedIssuesData = client.query(
            queries::VIEWER_ASSIGNED_ISSUES,
            serde_json::json!({ "after": after }),
        )?;
        let conn = data.viewer.assigned_issues;
        for node in &conn.nodes {
            all.push(map::map_issue(node));
        }
        if conn.page_info.has_next_page {
            after = conn.page_info.end_cursor.clone();
            if after.is_none() {
                break;
            }
        } else {
            break;
        }
    }
    Ok(all)
}
```

- [ ] **Step 3: Compile**

Run: `cd src-tauri && cargo build`
Expected: clean. (`list_assigned_issues` is unused until Task A3 — it's `pub`, so no dead-code lint.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/integrations/linear/queries.rs src-tauri/src/integrations/linear/types.rs src-tauri/src/integrations/linear/mod.rs
git commit -m "feat(integrations/linear): fetch viewer-assigned issues across teams"
```

### Task A2: Linear → InboxItem mapping + detail type (TDD)

**Files:**
- Create: `src-tauri/src/integrations/linear/inbox.rs`
- Modify: `src-tauri/src/integrations/linear/mod.rs` (`pub mod inbox;`)
- Modify: `src-tauri/src/forge/inbox.rs` (add `InboxSource::Linear`, `InboxItemDetail::Linear`, `LinearIssueDetail`)

- [ ] **Step 1: Add the inbox enum variants**

In `src-tauri/src/forge/inbox.rs`:
- Add `Linear` to `InboxSource` (the `#[serde(rename_all = "snake_case")]` makes it serialize as `"linear"`):

```rust
pub enum InboxSource {
    GithubIssue,
    GithubPr,
    GithubDiscussion,
    GitlabIssue,
    GitlabMr,
    Linear,
}
```

- Add a `Linear` arm to `InboxItemDetail`:

```rust
pub enum InboxItemDetail {
    GithubIssue(Box<GithubIssueDetail>),
    GithubPr(Box<GithubPullRequestDetail>),
    GithubDiscussion(Box<GithubDiscussionDetail>),
    GitlabIssue(Box<GitlabIssueDetail>),
    GitlabMr(Box<GitlabMergeRequestDetail>),
    Linear(Box<LinearIssueDetail>),
}
```

(Match the existing enum's serde tagging exactly — read the current `#[serde(...)]` attributes on `InboxItemDetail` and follow them so the frontend tagged-union decode stays consistent. The frontend reads `detailQuery.data?.type === "..."`, so the tag for the Linear arm should serialize its `type` as `"linear"`.)

Add the detail struct (co-locate next to `GithubIssueDetail`'s definition, or in `forge/inbox.rs`):

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueDetail {
    pub external_id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub state: String,
    pub priority_label: String,
    pub assignee_name: Option<String>,
    pub updated_at: Option<String>,
}
```

- In `forge/github/inbox.rs`'s `get_inbox_item_detail` match (and any other exhaustive `match` on `InboxSource` in the forge dispatch), add `InboxSource::Linear => unreachable!("Linear detail is served by get_linear_inbox_item_detail")` so the forge path stays total. (Search the codebase for `match` on `InboxSource` and patch each.)

- [ ] **Step 2: Write the failing test**

Create `src-tauri/src/integrations/linear/inbox.rs`:

```rust
//! Map normalized Linear `ProviderTask`s into the sidebar `InboxItem`/detail shape.

use crate::forge::inbox::{
    InboxItem, InboxSource, InboxState, InboxStateTone, LinearIssueDetail,
};
use crate::integrations::provider::{ProviderTask, TaskPriority, TaskStatusKind};

fn priority_label(priority: TaskPriority) -> &'static str {
    match priority {
        TaskPriority::Urgent => "Urgent",
        TaskPriority::High => "High",
        TaskPriority::Medium => "Medium",
        TaskPriority::Low => "Low",
        TaskPriority::None => "No priority",
    }
}

fn state_tone(kind: TaskStatusKind) -> InboxStateTone {
    match kind {
        TaskStatusKind::Completed => InboxStateTone::Closed,
        TaskStatusKind::Canceled => InboxStateTone::Closed,
        TaskStatusKind::Started => InboxStateTone::Open,
        _ => InboxStateTone::Neutral,
    }
}

/// Convert a Linear `ProviderTask` into a sidebar `InboxItem`.
pub fn task_to_item(task: &ProviderTask) -> InboxItem {
    InboxItem {
        id: format!("linear:{}", task.external_id),
        source: InboxSource::Linear,
        external_id: task.external_id.clone(),
        external_url: task.url.clone(),
        title: task.title.clone(),
        subtitle: Some(task.identifier.clone()),
        state: Some(InboxState {
            label: task.status.name.clone(),
            tone: state_tone(task.status.kind),
        }),
        last_activity_at: parse_timestamp_ms(task.remote_updated_at.as_deref()),
    }
}

/// Convert a Linear `ProviderTask` into the detail payload.
pub fn task_to_detail(task: &ProviderTask) -> LinearIssueDetail {
    LinearIssueDetail {
        external_id: task.external_id.clone(),
        identifier: task.identifier.clone(),
        title: task.title.clone(),
        description: task.description.clone(),
        url: task.url.clone(),
        state: task.status.name.clone(),
        priority_label: priority_label(task.priority).to_string(),
        assignee_name: task.assignee.as_ref().map(|a| a.name.clone()),
        updated_at: task.remote_updated_at.clone(),
    }
}

/// RFC3339 → unix millis; 0 if missing/unparseable (sorted last).
fn parse_timestamp_ms(value: Option<&str>) -> i64 {
    value
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::provider::{TaskAssignee, TaskStatus};

    fn sample() -> ProviderTask {
        ProviderTask {
            provider: "linear".into(),
            external_id: "abc-123".into(),
            identifier: "ENG-7".into(),
            title: "Fix login".into(),
            description: Some("body".into()),
            status: TaskStatus { id: "s1".into(), name: "In Progress".into(), kind: TaskStatusKind::Started, color: None },
            priority: TaskPriority::High,
            assignee: Some(TaskAssignee { id: "u1".into(), name: "Ada".into(), avatar_url: None }),
            labels: vec![],
            project: None,
            url: "https://linear.app/x/issue/ENG-7".into(),
            team_id: Some("t1".into()),
            remote_updated_at: Some("2026-06-21T00:00:00Z".into()),
        }
    }

    #[test]
    fn maps_item_fields() {
        let item = task_to_item(&sample());
        assert_eq!(item.id, "linear:abc-123");
        assert!(matches!(item.source, InboxSource::Linear));
        assert_eq!(item.external_id, "abc-123");
        assert_eq!(item.subtitle.as_deref(), Some("ENG-7"));
        assert_eq!(item.state.as_ref().unwrap().label, "In Progress");
        assert_eq!(item.last_activity_at, 1750464000000);
    }

    #[test]
    fn maps_detail_fields() {
        let d = task_to_detail(&sample());
        assert_eq!(d.identifier, "ENG-7");
        assert_eq!(d.priority_label, "High");
        assert_eq!(d.assignee_name.as_deref(), Some("Ada"));
        assert_eq!(d.state, "In Progress");
    }
}
```

Add `pub mod inbox;` to `src-tauri/src/integrations/linear/mod.rs`.

> **Verify before running:** confirm `chrono` is a dependency (`grep chrono src-tauri/Cargo.toml`). If the codebase parses RFC3339 timestamps elsewhere with a different helper (search for `timestamp_millis` / `DateTime::parse_from_rfc3339` in `forge/github/inbox.rs` — `pick_sort_timestamp` does this), REUSE that helper instead of adding a chrono call, to match existing behavior. Adapt `parse_timestamp_ms` accordingly. Also confirm `InboxItem`/`InboxState`/`InboxStateTone` field names + variants by reading `forge/inbox.rs`.

- [ ] **Step 3: Run the tests**

Run: `cd src-tauri && cargo test integrations::linear::inbox`
Expected: 2 tests PASS.

- [ ] **Step 4: Compile whole crate + clippy**

Run: `cd src-tauri && cargo build && cargo clippy --all-targets -- -D warnings`
Expected: clean (the new `InboxSource::Linear`/`InboxItemDetail::Linear` arms are handled in every match).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integrations/linear/inbox.rs src-tauri/src/integrations/linear/mod.rs src-tauri/src/forge/
git commit -m "feat(integrations/linear): map assigned issues to sidebar InboxItem + detail (tested)"
```

### Task A3: Linear inbox Tauri commands

**Files:**
- Modify: `src-tauri/src/commands/integrations_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/companion/rpc.rs`

- [ ] **Step 1: Add the commands**

In `integrations_commands.rs`, add (reuse `credentials::load_api_key`, `run_blocking`, `CmdResult`; `LINEAR_PROVIDER` is imported):

```rust
use crate::forge::inbox::{InboxItemDetail, InboxPage};
use crate::integrations::linear;

/// Linear "assigned to me" issues as sidebar inbox items. Single page for now
/// (Linear fetch already paginates internally); `cursor` is accepted for shape
/// parity with the forge inbox and ignored.
#[tauri::command]
pub async fn list_linear_inbox_items(_cursor: Option<String>) -> CmdResult<InboxPage> {
    run_blocking(move || {
        let key = match credentials::load_api_key(LINEAR_PROVIDER)? {
            Some(k) => k,
            None => return Ok(InboxPage { items: Vec::new(), next_cursor: None }),
        };
        let tasks = linear::list_assigned_issues(&key)?;
        let mut items: Vec<_> = tasks.iter().map(linear::inbox::task_to_item).collect();
        items.sort_by_key(|i| std::cmp::Reverse(i.last_activity_at));
        Ok(InboxPage { items, next_cursor: None })
    })
    .await
}

/// Detail for a single Linear inbox item (by Linear issue id).
#[tauri::command]
pub async fn get_linear_inbox_item_detail(external_id: String) -> CmdResult<Option<InboxItemDetail>> {
    run_blocking(move || {
        let key = match credentials::load_api_key(LINEAR_PROVIDER)? {
            Some(k) => k,
            None => return Ok(None),
        };
        match linear::get_issue(&key, &external_id)? {
            Some(task) => Ok(Some(InboxItemDetail::Linear(Box::new(linear::inbox::task_to_detail(&task))))),
            None => Ok(None),
        }
    })
    .await
}
```

(`linear::get_issue(api_key, external_id) -> Result<Option<ProviderTask>>` already exists.)

- [ ] **Step 2: Register the commands**

In `src-tauri/src/lib.rs`, add `list_linear_inbox_items` and `get_linear_inbox_item_detail` to the `tauri::generate_handler![...]` list (next to the other integration commands).

- [ ] **Step 3: Companion dispatch**

In `src-tauri/src/companion/rpc.rs`, add to the desktop-only task-integrations group:

```rust
        |         "list_linear_inbox_items"
        |         "get_linear_inbox_item_detail"
```

- [ ] **Step 4: Build + the companion coverage test**

Run: `cd src-tauri && cargo build && cargo test --test companion_dispatch_coverage && cargo clippy --all-targets -- -D warnings`
Expected: build clean; companion coverage passes (both new invokes registered); clippy clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/integrations_commands.rs src-tauri/src/lib.rs src-tauri/src/companion/rpc.rs
git commit -m "feat(commands): list_linear_inbox_items + get_linear_inbox_item_detail"
```

### Task A4: Frontend API + types for the Linear inbox

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/query-client.ts`

- [ ] **Step 1: Widen the inbox types + add the calls**

In `src/lib/api.ts`:
- Add `"linear"` to `InboxItemSource`:

```typescript
export type InboxItemSource =
	| "github_issue"
	| "github_pr"
	| "github_discussion"
	| "gitlab_issue"
	| "gitlab_mr"
	| "linear";
```

- Add a Linear arm to the `InboxItemDetail` union (match the existing tagged-union shape — each arm is `{ type: "...", data: ... }`):

```typescript
export type LinearIssueDetailData = {
	externalId: string;
	identifier: string;
	title: string;
	description: string | null;
	url: string;
	state: string;
	priorityLabel: string;
	assigneeName: string | null;
	updatedAt: string | null;
};
// ...add to InboxItemDetail union:
// | { type: "linear"; data: LinearIssueDetailData }
```

(Read the existing `InboxItemDetail` type to match its exact arm shape — if arms are `{ type: "github_issue"; data: GithubIssueDetail }`, mirror that with `{ type: "linear"; data: LinearIssueDetailData }`.)

- Add the two calls:

```typescript
export async function listLinearInboxItems(cursor?: string | null): Promise<InboxPage> {
	try {
		return await invoke<InboxPage>("list_linear_inbox_items", { cursor: cursor ?? null });
	} catch (error) {
		throw new Error(describeInvokeError(error, "Unable to load Linear issues."));
	}
}

export async function getLinearInboxItemDetail(externalId: string): Promise<InboxItemDetail | null> {
	return await invoke<InboxItemDetail | null>("get_linear_inbox_item_detail", { externalId });
}
```

- [ ] **Step 2: Query keys**

In `src/lib/query-client.ts`, add to `helmorQueryKeys`:

```typescript
	linearInboxItems: () => ["linear-inbox-items"] as const,
	linearInboxItemDetail: (externalId: string) =>
		["linear-inbox-item-detail", externalId] as const,
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/lib/query-client.ts
git commit -m "feat(api): linear inbox items + detail calls and types"
```

### Task A5: Enable the Linear inbox source + render cards

**Files:**
- Modify: `src/features/inbox/index.tsx`
- Create: `src/features/inbox/use-linear-inbox-items.ts`

- [ ] **Step 1: Linear inbox hook**

Create `src/features/inbox/use-linear-inbox-items.ts`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getIntegrationStatus, listLinearInboxItems } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

/** Linear "assigned to me" issues, gated on the Linear integration being connected. */
export function useLinearInboxItems() {
	const status = useQuery({
		queryKey: helmorQueryKeys.integrationStatus("linear"),
		queryFn: () => getIntegrationStatus("linear"),
	});
	const connected = status.data?.connected ?? false;
	const items = useQuery({
		queryKey: helmorQueryKeys.linearInboxItems(),
		queryFn: () => listLinearInboxItems(),
		enabled: connected,
		staleTime: 60_000,
	});
	return { connected, ...items };
}
```

- [ ] **Step 2: Enable the Linear source in the sidebar**

In `src/features/inbox/index.tsx`:
- Remove `linear` from the `COMING_SOON_COPY`-gated providers and render it as an active source whose only sub-tab is "issues".
- When the Linear tab is active, drive the list from `useLinearInboxItems()` instead of `useInboxItems(...)`; map each `InboxItem` to the same `SourceCard` the forge path uses (the `InboxItem`→card adapter already exists for forge sources — reuse it, passing `source: "linear"`). The `SourceIcon` already handles `"linear"`.
- Gate the Linear tab's visibility (or its empty state) on `connected` from the hook: if Linear isn't connected, keep the existing "coming soon"/connect-prompt copy; if connected, show the issues.

> Read `index.tsx` carefully to follow its existing source-config + card-rendering structure. The exact integration point is where forge sources build their `ContextCard[]` from `InboxItem[]`; add a Linear branch that does the same with `source: "linear"` and `meta` of type `LinearIssueMeta` (build `meta` from the item — `identifier` = `item.subtitle`, plus minimal fields; if `LinearIssueMeta` requires `team`/`priorityLabel`/`labels` you don't have on the list item, supply best-effort values from the item or fetch lazily in the detail view). Keep the card minimal; rich fields come from the detail view.

- [ ] **Step 3: Typecheck + tests**

Run: `bun run typecheck && bun x vitest run src/features/inbox`
Expected: existing inbox tests stay green; clean typecheck.

- [ ] **Step 4: Commit**

```bash
git add src/features/inbox/
git commit -m "feat(inbox): enable Linear assigned-issues source in the context sidebar"
```

### Task A6: Linear detail view

**Files:**
- Create: `src/features/source-detail/linear/issue-view.tsx`
- Modify: `src/features/source-detail/index.tsx`

- [ ] **Step 1: Build the detail view**

Create `src/features/source-detail/linear/issue-view.tsx`, mirroring `source-detail/github/issue-view.tsx` but fetching via `getLinearInboxItemDetail(card.externalId)`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getLinearInboxItemDetail } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import type { SourceDetailProps } from "../common";
// reuse the shared detail-page chrome the github view uses; import the same
// presentational component (e.g. DetailPage) the github/gitlab views share.

export function LinearIssueView({ card, appendContextTarget }: SourceDetailProps) {
	const detailQuery = useQuery({
		queryKey: helmorQueryKeys.linearInboxItemDetail(card.externalId),
		queryFn: () => getLinearInboxItemDetail(card.externalId),
		staleTime: 60_000,
		refetchOnMount: "always",
	});
	const detail = detailQuery.data?.type === "linear" ? detailQuery.data.data : null;
	return (
		<DetailPage
			card={card}
			appendContextTarget={appendContextTarget}
			description={detail?.description ?? undefined}
			error={detailQuery.error}
			isLoading={detailQuery.isLoading}
			kindLabel="issue"
		/>
	);
}
```

> Read `source-detail/github/issue-view.tsx` and `source-detail/common.tsx` to find the SHARED presentational component (the github view uses `GitHubDetailPage` — there may be a more generic shared `DetailPage`, or you mirror `GitHubDetailPage`'s structure with a small Linear-specific page). Reuse whatever the github/gitlab views share; if each provider has its own page wrapper, create a minimal `LinearDetailPage` following the same layout (header with identifier/state/updated, markdown body, external-link button, "add to context" button via `appendContextTarget`). Match `SourceDetailProps`'s exact shape.

- [ ] **Step 2: Route it**

In `src/features/source-detail/index.tsx`, change `case "linear": return <UnsupportedSourceView card={card} />;` to:

```tsx
		case "linear":
			return (
				<LinearIssueView card={card} appendContextTarget={appendContextTarget} />
			);
```

(Add the import.)

- [ ] **Step 3: Typecheck + tests**

Run: `bun run typecheck && bun x vitest run src/features/source-detail src/features/inbox`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/source-detail/
git commit -m "feat(source-detail): Linear issue detail view"
```

---

## PHASE 4B — GitHub issue inbox via the new client (delegation)

### Task B1: `integrations/github` canonical issue search + detail

**Files:**
- Create: `src-tauri/src/integrations/github/inbox.rs`
- Modify: `src-tauri/src/integrations/github/mod.rs` (`pub mod inbox;`)

Goal: a single home for GitHub **issue** search execution (node→`InboxItem` mapping) and issue detail (→`GithubIssueDetail`), built on the existing `GithubClient`. Forge will keep building the search query string + cursor and call this.

- [ ] **Step 1: Implement the issue search + detail**

Create `src-tauri/src/integrations/github/inbox.rs`:

```rust
//! Canonical GitHub *issue* inbox fetch: search execution + node→InboxItem and
//! issue detail. The forge inbox builds the search qualifiers + cursor and calls
//! these so GitHub issues have one source of truth (the integrations client).

use anyhow::{Context, Result};
use serde::Deserialize;

use super::client::GithubClient;
use crate::forge::inbox::{GithubIssueDetail, InboxItem, InboxItemDetail, InboxSource, InboxState, InboxStateTone};

/// One page of issue search results, mapped to InboxItems.
pub struct IssueSearchPage {
    pub items: Vec<InboxItem>,
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

const ISSUE_SEARCH_QUERY: &str = r#"
query IntegrationsIssueSearch($q: String!, $cursor: String) {
  search(type: ISSUE, query: $q, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue { id number title url state stateReason createdAt updatedAt repository { nameWithOwner } }
    }
  }
}
"#;

#[derive(Deserialize)]
struct SearchEnvelope {
    data: Option<SearchData>,
}
#[derive(Deserialize)]
struct SearchData {
    search: SearchPayload,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchPayload {
    page_info: PageInfo,
    nodes: Vec<SearchNode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum SearchNode {
    Issue {
        id: String,
        number: i64,
        title: String,
        url: String,
        state: String,
        #[serde(rename = "stateReason")]
        state_reason: Option<String>,
        #[serde(rename = "updatedAt")]
        updated_at: String,
        repository: RepoRef,
    },
    #[serde(other)]
    Other,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoRef {
    name_with_owner: String,
}

/// Run a prebuilt issue search query (qualifiers already assembled by the
/// caller) and return mapped InboxItems for one page.
pub fn search_issues(login: &str, query: &str, cursor: Option<&str>) -> Result<IssueSearchPage> {
    let client = GithubClient::new(login);
    let cursor_owned = cursor.unwrap_or_default().to_string();
    let mut vars: Vec<(&str, &str)> = vec![("q", query)];
    if !cursor_owned.is_empty() {
        vars.push(("cursor", cursor_owned.as_str()));
    }
    let env: SearchEnvelope = client.query(ISSUE_SEARCH_QUERY, &vars)?;
    let payload = env.data.context("GitHub issue search returned no data")?.search;
    let items = payload
        .nodes
        .into_iter()
        .filter_map(node_to_item)
        .collect();
    Ok(IssueSearchPage {
        items,
        has_next_page: payload.page_info.has_next_page,
        end_cursor: payload.page_info.end_cursor,
    })
}

fn node_to_item(node: SearchNode) -> Option<InboxItem> {
    let SearchNode::Issue { id, number, title, url, state, state_reason, updated_at, repository } = node else {
        return None;
    };
    Some(InboxItem {
        id: format!("github_issue:{id}"),
        source: InboxSource::GithubIssue,
        external_id: format!("{}#{}", repository.name_with_owner, number),
        external_url: url,
        title,
        subtitle: Some(repository.name_with_owner),
        state: Some(issue_state(&state, state_reason.as_deref())),
        last_activity_at: parse_ms(&updated_at),
    })
}

fn issue_state(state: &str, reason: Option<&str>) -> InboxState {
    let upper = state.to_ascii_uppercase();
    let (label, tone) = match (upper.as_str(), reason.map(|r| r.to_ascii_uppercase())) {
        ("CLOSED", Some(r)) if r == "NOT_PLANNED" => ("Not planned", InboxStateTone::Closed),
        ("CLOSED", _) => ("Closed", InboxStateTone::Closed),
        _ => ("Open", InboxStateTone::Open),
    };
    InboxState { label: label.to_string(), tone }
}

fn parse_ms(value: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

/// Issue detail via REST (matches the shape forge already returns).
pub fn issue_detail(login: &str, external_id: &str) -> Result<Option<InboxItemDetail>> {
    // Reuse forge's existing REST detail fetch to avoid duplicating the parse.
    crate::forge::github::inbox::fetch_issue_detail_public(login, external_id)
}
```

> **Critical verifications before writing:**
> 1. `issue_state` here must produce the SAME `InboxState { label, tone }` the existing forge `issue_state` produces, so cards look identical. READ forge's `issue_state` (in `forge/github/inbox.rs`) and copy its exact label/tone mapping rather than the approximation above.
> 2. `parse_ms` must match forge's `pick_sort_timestamp` for the `updated_at` case. Reuse the same parsing approach. (The existing forge path uses created_at vs updated_at based on sort; for the integrations search we only select `updatedAt` — confirm the inbox always sorts by updated for issues, or also select `createdAt` and pick per the caller's sort.)
> 3. For `issue_detail`, the existing `fetch_issue_detail` in `forge/github/inbox.rs` is private. Rather than duplicate the REST parse + `GithubIssueDetail` construction, expose it: add `pub(crate) fn fetch_issue_detail_public(login: &str, external_id: &str) -> Result<Option<InboxItemDetail>>` in forge that calls the private `fetch_issue_detail`, OR move `fetch_issue_detail` + its `IssueRestResponse` struct into this new module and have forge call THIS. Choose the lower-churn option after reading the code; the plan's Task B2 assumes forge delegates issue detail to `integrations::github::inbox::issue_detail`. If you instead keep detail in forge, drop `issue_detail` from this module and have B2 leave forge's detail path alone (only the LISTING delegates). **Decide and note which.**

Add `pub mod inbox;` to `src-tauri/src/integrations/github/mod.rs`.

- [ ] **Step 2: Build**

Run: `cd src-tauri && cargo build`
Expected: clean (functions unused until B2; `pub` so no dead-code lint). Resolve the detail-delegation decision so it compiles.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/integrations/github/inbox.rs src-tauri/src/integrations/github/mod.rs src-tauri/src/forge/github/inbox.rs
git commit -m "feat(integrations/github): canonical issue search + detail for the inbox"
```

### Task B2: Forge GitHub issue path delegates to the new client

**Files:**
- Modify: `src-tauri/src/forge/github/inbox.rs`

- [ ] **Step 1: Delegate the issue fetch**

In `forge/github/inbox.rs`'s `list_inbox_items`, the issues loop currently calls `fetch_search(login, &q, &cursor_entry.cursor, sort_qual, limit)` and maps via `issue_or_pr_to_item(..., false, ...)`. Replace ONLY the issue branch's fetch+map with a call to `integrations::github::inbox::search_issues(login, &q, cursor_entry.cursor.as_deref())`, pushing the returned `IssueSearchPage.items` into `items` and updating `cursor_entry` from `has_next_page`/`end_cursor`. The PR and discussion branches keep using the existing forge `fetch_search`/mapping unchanged. The query-string construction (`q`), the `MultiCursor`/`issue_scopes`, the merge/sort/truncate, and `encode_cursor` all stay in forge.

> Keep the `sort` handling consistent: forge passes `sort_qual` appended to the query. `search_issues` takes the full query `q` — so append `sort_qual` to `q` before calling `search_issues` (forge already builds `q`; ensure the sort qualifier is included exactly as `fetch_search` did via `with_search_first`/the `{base_query} {sort_qualifier}` concatenation). Match the prior behavior precisely so result ordering and pagination are identical.

- [ ] **Step 2: Delegate issue detail (per the B1 decision)**

If B1 chose to centralize detail: in `get_inbox_item_detail`, change the `InboxSource::GithubIssue => fetch_issue_detail(login, external_id)` arm to `InboxSource::GithubIssue => crate::integrations::github::inbox::issue_detail(login, external_id)`. (If B1 kept detail in forge, leave this arm unchanged.)

- [ ] **Step 3: Build + the pipeline/forge tests**

Run: `cd src-tauri && cargo build && cargo test && cargo clippy --all-targets -- -D warnings`
Expected: clean. Pay attention to any forge inbox tests (`grep -rn "fn .*inbox" src-tauri/src/forge/github/ src-tauri/tests/`) — they must still pass, proving the delegation preserved behavior.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/github/inbox.rs
git commit -m "refactor(forge/github): route inbox issue fetch + detail through integrations/github"
```

### Task B3: Verify the GitHub inbox is unchanged end-to-end

**Files:** none (verification task)

- [ ] **Step 1: Confirm InboxItem shape parity**

The frontend GitHub inbox path (`useInboxItems("issues", ..., "github")` → `list_inbox_items`) is UNCHANGED — it still calls the forge command, which now delegates issue fetching internally. Confirm the `InboxItem` JSON for a GitHub issue is byte-identical (same `id` `"github_issue:{id}"`, `source` `"github_issue"`, `external_id` `"owner/repo#n"`, `state` label/tone). Diff the new `node_to_item`/`issue_state` against the old forge `issue_or_pr_to_item`/`issue_state` to confirm field-for-field equivalence.

- [ ] **Step 2: Run the full suite**

Run: `bun run test` (note: 7 pre-existing `editor`/`terminal` frontend failures are unrelated — see Phase 1–3 plan). `cd src-tauri && cargo test`. `bun run lint`.
Expected: no NEW failures vs the Phase 1–3 baseline; lint clean.

- [ ] **Step 3: Manual smoke (needs a `gh`-authed + Linear-connected live app)**

With `bun run dev`: open the context sidebar (Cmd+Shift+C). Confirm GitHub issues still list + open detail (now via the integrations client). Connect Linear (Settings → Integrations) and confirm the Linear source lists your assigned issues, cards render with identifier/state, the detail view loads, and "add to context" works. Confirm PRs/discussions/GitLab are unaffected.

---

## Self-Review

**Spec coverage (Phase 4):**
- Linear → context sidebar (assigned/involved, read + attach) → Tasks A1–A6. ✓ (uses `viewer.assignedIssues`; "involved" beyond assigned is a possible follow-up — assigned is the spec's primary case.)
- Reuse existing `ContextCard` + `LinearIssueMeta` + `"linear"` source + `LinearBrandIcon` → A5/A6. ✓
- New `source-detail/linear/issue-view.tsx` + add-to-context → A6. ✓
- GitHub issues rebuilt on the new `integrations/github` client; PRs/discussions stay on forge → B1–B3 (delegation approach). ✓

**Placeholder scan:** No TBD/TODO. Every code step has concrete code. Three steps carry explicit "verify against real code and adapt" notes (timestamp helper reuse, forge `issue_state` exact mapping, detail-centralization decision) — these are real verification gates, not placeholders; each names exactly what to read and the decision to make.

**Type consistency:** `InboxItem`/`InboxState`/`InboxStateTone`/`InboxSource`/`InboxItemDetail` are the forge types extended in A2 and reused in A3/B1. `LinearIssueDetail` (Rust, A2) ↔ `LinearIssueDetailData` (TS, A4) field names match (camelCase via serde). `task_to_item`/`task_to_detail` (A2) are consumed in A3. `search_issues`/`issue_detail` (B1) are consumed in B2. `list_assigned_issues` (A1) consumed in A3. Commands `list_linear_inbox_items`/`get_linear_inbox_item_detail` (A3) ↔ `listLinearInboxItems`/`getLinearInboxItemDetail` (A4) ↔ hook (A5)/detail (A6).

**Known verification points flagged inline:** (a) `chrono` availability / reuse forge's timestamp helper (A2, B1); (b) exact `InboxItem`/`InboxState` field names + `InboxItemDetail` serde tagging (A2); (c) forge `issue_state` exact label/tone copy (B1); (d) detail-centralization vs leave-in-forge decision (B1/B2); (e) the shared detail-page presentational component name in `source-detail/` (A6); (f) `LinearIssueMeta` required fields when building the Linear card (A5).
