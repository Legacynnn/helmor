# Tasks Screen — Plan 2: Tasks Screen Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Tasks screen end-to-end for a single selected repo, with three tabs (Tasks / PRs / Issues) backed by real data from Linear, GitHub PRs, and GitHub issues. Rows grouped by status with collapsible group headers. No filters yet (hardcoded defaults: open PRs, open issues, non-done Linear tasks). No detail panel — rows open in the browser. No "All repos" mode.

**Architecture:** Backend adds three list commands (`linear_list_tasks`, `github_list_repo_prs`, `github_list_repo_issues`). Linear continues using the GraphQL client from Plan 1; GitHub list commands shell out to `gh pr list` / `gh issue list` via the existing `run_cli_with_login` multi-account helper. Frontend adds `src/features/tasks/` with a container that picks one query per active tab and normalizes the result to a common `TaskListItem` shape so the list component is source-agnostic. The Tasks sidebar item is already in the navigation tree (no `onClick` yet) — Plan 2 wires it up and adds a new `"tasks"` value to `workspaceViewMode` in App.tsx.

**Tech Stack:** Rust (`reqwest`, `serde`, `anyhow`), Tauri commands, React 19 + TanStack Query + vitest.

**Spec:** `docs/superpowers/specs/2026-05-10-tasks-screen-design.md`
**Previous plan:** `docs/superpowers/plans/2026-05-10-tasks-screen-plan-1-linear-foundation.md` (shipped)

---

## File Structure

**Create:**
- `src-tauri/src/commands/tasks_commands.rs` — three new Tauri commands
- `src/features/tasks/index.tsx` — screen shell
- `src/features/tasks/container.tsx` — data fetching + state wiring
- `src/features/tasks/hooks/use-tasks-query.ts` — per-tab query selector
- `src/features/tasks/adapters/linear.ts` + `.test.ts`
- `src/features/tasks/adapters/github-pr.ts` + `.test.ts`
- `src/features/tasks/adapters/github-issue.ts` + `.test.ts`
- `src/features/tasks/types.ts` — `TaskListItem` + `TasksTab` + filter shape
- `src/features/tasks/components/repo-switcher.tsx`
- `src/features/tasks/components/tab-bar.tsx`
- `src/features/tasks/components/item-list.tsx`
- `src/features/tasks/components/item-row.tsx`
- `src/features/tasks/components/empty-states.tsx`

**Modify:**
- `src-tauri/src/forge/linear/queries.rs` — add `LinearIssue` types, `TASKS_QUERY`, `fetch_tasks`, parser tests
- `src-tauri/src/forge/linear/types.rs` — add `LinearIssue`, `LinearIssueState`, `LinearAssignee` structs
- `src-tauri/src/forge/github/mod.rs` (or new submodule `forge/github/lists.rs`) — `list_repo_prs`, `list_repo_issues` callable from commands
- `src-tauri/src/commands/mod.rs` — `pub mod tasks_commands;`
- `src-tauri/src/lib.rs` — register three new commands
- `src/lib/api.ts` — TS types + `linearListTasks`, `githubListRepoPrs`, `githubListRepoIssues` wrappers
- `src/lib/query-client.ts` — add `helmorQueryKeys.tasks.{linear,githubPrs,githubIssues}(...)` key builders
- `src/App.tsx` — add `"tasks"` to `WorkspaceViewMode` union, add `handleOpenTasks` handler, render `TasksScreenContainer`, pass `onOpenTasks` + `tasksActive` to sidebar
- `src/features/navigation/index.tsx` — wire the existing "Tasks" `SidebarNavItem` to `onOpenTasks` + `active` prop

---

## Task 1: Linear `LinearIssue` type + `fetch_tasks` query (TDD parsers)

**Files:**
- Modify: `src-tauri/src/forge/linear/types.rs`
- Modify: `src-tauri/src/forge/linear/queries.rs`

- [ ] **Step 1: Extend `types.rs` with task-related structs**

Append to `src-tauri/src/forge/linear/types.rs` (keep the `#![allow(dead_code)]` at top):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueState {
    pub id: String,
    pub name: String,
    /// One of: backlog, unstarted, started, completed, canceled, triage.
    #[serde(rename = "type")]
    pub kind: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearAssignee {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearLabel {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    /// Human-readable identifier like "SUPER-187".
    pub identifier: String,
    pub title: String,
    pub url: String,
    /// 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low (Linear's scale).
    pub priority: i32,
    pub updated_at: String,
    pub state: LinearIssueState,
    pub assignee: Option<LinearAssignee>,
    pub labels: LinearLabelConnection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearLabelConnection {
    pub nodes: Vec<LinearLabel>,
}
```

- [ ] **Step 2: Add the GraphQL query + fetch helper + tests to `queries.rs`**

Append to `src-tauri/src/forge/linear/queries.rs` (do NOT modify existing items):

```rust
pub const TASKS_QUERY: &str = r#"
query Tasks($teamId: String!) {
  issues(
    filter: { team: { id: { eq: $teamId } }, state: { type: { nin: ["completed", "canceled"] } } }
    orderBy: updatedAt
    first: 50
  ) {
    nodes {
      id
      identifier
      title
      url
      priority
      updatedAt
      state { id name type color }
      assignee { id name avatarUrl }
      labels { nodes { id name color } }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct TasksEnvelope {
    issues: TasksConnection,
}

#[derive(Debug, Deserialize)]
struct TasksConnection {
    nodes: Vec<super::types::LinearIssue>,
}

pub fn parse_tasks(data: Value) -> Result<Vec<super::types::LinearIssue>, LinearError> {
    serde_json::from_value::<TasksEnvelope>(data)
        .map(|e| e.issues.nodes)
        .map_err(|e| LinearError::Parse(format!("tasks: {e}")))
}

pub async fn fetch_tasks(api_key: &str, team_id: &str) -> Result<Vec<super::types::LinearIssue>, LinearError> {
    let data: Value = graphql(
        LINEAR_API_URL,
        api_key,
        TASKS_QUERY,
        json!({ "teamId": team_id }),
    )
    .await?;
    parse_tasks(data)
}
```

Then extend the `#[cfg(test)] mod tests` block (at the bottom of `queries.rs`) with these test cases:

```rust
    #[test]
    fn parses_tasks_response() {
        let data = json!({
            "issues": {
                "nodes": [
                    {
                        "id": "i1",
                        "identifier": "SUPER-187",
                        "title": "Fix something",
                        "url": "https://linear.app/x/issue/SUPER-187",
                        "priority": 1,
                        "updatedAt": "2026-03-23T10:00:00Z",
                        "state": {
                            "id": "s1",
                            "name": "In Progress",
                            "type": "started",
                            "color": "#5e6ad2"
                        },
                        "assignee": {
                            "id": "u1",
                            "name": "Dan",
                            "avatarUrl": "https://example.com/dan.png"
                        },
                        "labels": {
                            "nodes": [
                                { "id": "l1", "name": "bug", "color": "#eb5757" }
                            ]
                        }
                    }
                ]
            }
        });
        let tasks = parse_tasks(data).expect("parse");
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        assert_eq!(task.identifier, "SUPER-187");
        assert_eq!(task.state.kind, "started");
        assert_eq!(task.assignee.as_ref().unwrap().name, "Dan");
        assert_eq!(task.labels.nodes.len(), 1);
        assert_eq!(task.labels.nodes[0].name, "bug");
    }

    #[test]
    fn parses_task_with_null_assignee_and_empty_labels() {
        let data = json!({
            "issues": {
                "nodes": [
                    {
                        "id": "i1",
                        "identifier": "SUPER-188",
                        "title": "Untriaged",
                        "url": "https://linear.app/x/issue/SUPER-188",
                        "priority": 0,
                        "updatedAt": "2026-03-23T10:00:00Z",
                        "state": {
                            "id": "s1",
                            "name": "Backlog",
                            "type": "backlog",
                            "color": "#bec2c8"
                        },
                        "assignee": null,
                        "labels": { "nodes": [] }
                    }
                ]
            }
        });
        let tasks = parse_tasks(data).expect("parse");
        assert_eq!(tasks.len(), 1);
        assert!(tasks[0].assignee.is_none());
        assert_eq!(tasks[0].labels.nodes.len(), 0);
    }
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test --lib forge::linear::queries 2>&1 | tail -15
```

Expected: 5 tests pass (3 prior + 2 new).

- [ ] **Step 4: Clippy clean**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/forge/linear/types.rs src-tauri/src/forge/linear/queries.rs
git commit -m "feat(linear): add LinearIssue type and fetch_tasks query"
```

---

## Task 2: `linear_list_tasks` command + frontend wrapper

**Files:**
- Modify: `src-tauri/src/commands/linear_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Append `linear_list_tasks` to `src-tauri/src/commands/linear_commands.rs`**

Add the import for `LinearIssue` at the top (extend the existing types import):

```rust
use crate::forge::linear::types::{LinearAuthStatus, LinearIssue, LinearTeam};
```

Then append the new command at the bottom of the file:

```rust
#[tauri::command]
pub async fn linear_list_tasks(team_id: String) -> CmdResult<Vec<LinearIssue>> {
    let key = run_blocking(auth::get_api_key)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    queries::fetch_tasks(&key, &team_id)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, find the existing block of `crate::commands::linear_commands::*` entries inside `tauri::generate_handler!` and add:

```
        crate::commands::linear_commands::linear_list_tasks,
```

Insert alphabetically among the existing five Linear entries.

- [ ] **Step 3: Compile + clippy**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

- [ ] **Step 4: Add frontend wrapper + types to `src/lib/api.ts`**

Find the existing Linear block in `src/lib/api.ts` (near `linearListTeams`). Add the new types ABOVE the existing helpers:

```ts
export type LinearIssueState = {
	id: string;
	name: string;
	/** One of: backlog, unstarted, started, completed, canceled, triage. */
	type: string;
	color: string;
};

export type LinearAssignee = {
	id: string;
	name: string;
	avatarUrl: string | null;
};

export type LinearLabel = {
	id: string;
	name: string;
	color: string;
};

export type LinearIssue = {
	id: string;
	identifier: string;
	title: string;
	url: string;
	priority: number;
	updatedAt: string;
	state: LinearIssueState;
	assignee: LinearAssignee | null;
	labels: { nodes: LinearLabel[] };
};
```

Then add the wrapper (alphabetically among the existing Linear helpers):

```ts
export async function linearListTasks(teamId: string): Promise<LinearIssue[]> {
	return await invoke<LinearIssue[]>("linear_list_tasks", { teamId });
}
```

- [ ] **Step 5: Typecheck + biome**

```bash
bun run typecheck 2>&1 | tail -10
bun x biome check src/lib/api.ts 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/linear_commands.rs src-tauri/src/lib.rs src/lib/api.ts
git commit -m "feat(linear): linear_list_tasks command + wrapper"
```

---

## Task 3: GitHub `list_repo_prs` and `list_repo_issues`

**Files:**
- Create: `src-tauri/src/forge/github/lists.rs`
- Modify: `src-tauri/src/forge/github/mod.rs`
- Modify: `src-tauri/src/commands/tasks_commands.rs` (new file in next task; for now we put the GH list commands directly in a fresh `src-tauri/src/commands/github_list_commands.rs`)
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

> **Approach:** Shell out via `run_cli_with_login("github.com", login, &args)` to `gh pr list --repo OWNER/REPO --state open --limit 50 --json id,number,title,url,state,updatedAt,author,assignees,labels,isDraft` and the analogous `gh issue list`. Parse the JSON response with serde. This reuses the existing multi-account token machinery and avoids writing new GraphQL.

- [ ] **Step 1: Create `src-tauri/src/forge/github/lists.rs`**

```rust
//! Per-repo PR/Issue list helpers for the Tasks screen.
//!
//! Lighter weight than `inbox.rs`: takes a single repo, returns up to 50
//! open items via the `gh` CLI with the bound forge login. No multi-cursor
//! merging — this is for one repo at a time, called from
//! `commands::github_list_commands`.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::accounts::run_cli_with_login;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhUser {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPr {
    pub number: i64,
    pub title: String,
    pub url: String,
    /// "OPEN", "CLOSED", "MERGED" (gh prints uppercase).
    pub state: String,
    pub is_draft: bool,
    pub updated_at: String,
    #[serde(default)]
    pub author: Option<GhUser>,
    #[serde(default)]
    pub assignees: Vec<GhUser>,
    #[serde(default)]
    pub labels: Vec<GhLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhIssue {
    pub number: i64,
    pub title: String,
    pub url: String,
    /// "OPEN", "CLOSED".
    pub state: String,
    pub updated_at: String,
    #[serde(default)]
    pub author: Option<GhUser>,
    #[serde(default)]
    pub assignees: Vec<GhUser>,
    #[serde(default)]
    pub labels: Vec<GhLabel>,
}

const PR_JSON_FIELDS: &str = "number,title,url,state,isDraft,updatedAt,author,assignees,labels";
const ISSUE_JSON_FIELDS: &str = "number,title,url,state,updatedAt,author,assignees,labels";

pub fn list_repo_prs(login: &str, owner_slash_repo: &str) -> Result<Vec<GhPr>> {
    let output = run_cli_with_login(
        "github.com",
        login,
        &[
            "pr",
            "list",
            "--repo",
            owner_slash_repo,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            PR_JSON_FIELDS,
        ],
    )?;
    serde_json::from_slice(&output.stdout)
        .with_context(|| format!("Failed to parse `gh pr list` for {owner_slash_repo}"))
}

pub fn list_repo_issues(login: &str, owner_slash_repo: &str) -> Result<Vec<GhIssue>> {
    let output = run_cli_with_login(
        "github.com",
        login,
        &[
            "issue",
            "list",
            "--repo",
            owner_slash_repo,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            ISSUE_JSON_FIELDS,
        ],
    )?;
    serde_json::from_slice(&output.stdout)
        .with_context(|| format!("Failed to parse `gh issue list` for {owner_slash_repo}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pr_list() {
        let raw = r#"[
            {
                "number": 42,
                "title": "Add feature",
                "url": "https://github.com/x/r/pull/42",
                "state": "OPEN",
                "isDraft": false,
                "updatedAt": "2026-03-23T10:00:00Z",
                "author": { "login": "dan" },
                "assignees": [{ "login": "dan" }],
                "labels": [{ "name": "feat", "color": "0e8a16" }]
            }
        ]"#;
        let prs: Vec<GhPr> = serde_json::from_str(raw).expect("parse");
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 42);
        assert!(!prs[0].is_draft);
        assert_eq!(prs[0].labels[0].name, "feat");
    }

    #[test]
    fn parses_issue_list_with_no_assignees() {
        let raw = r#"[
            {
                "number": 7,
                "title": "Bug",
                "url": "https://github.com/x/r/issues/7",
                "state": "OPEN",
                "updatedAt": "2026-03-23T10:00:00Z",
                "author": { "login": "dan" },
                "assignees": [],
                "labels": []
            }
        ]"#;
        let issues: Vec<GhIssue> = serde_json::from_str(raw).expect("parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 7);
        assert!(issues[0].assignees.is_empty());
    }
}
```

- [ ] **Step 2: Register `lists` in the github module**

In `src-tauri/src/forge/github/mod.rs`, add `pub mod lists;` next to the other `pub mod` / `mod` declarations.

- [ ] **Step 3: Create `src-tauri/src/commands/github_list_commands.rs`**

This file resolves the `owner/repo` slug from the `repo_id`, then calls the `lists::list_repo_*` helper on a blocking thread. It needs a way to derive `owner/repo` from a repo id; the `repos` table stores `remote_url`. We extract `owner/repo` from the URL.

```rust
use super::common::{run_blocking, CmdResult};
use crate::forge::github::lists::{list_repo_issues, list_repo_prs, GhIssue, GhPr};
use crate::models::repos;

fn extract_owner_repo(remote_url: &str) -> Option<String> {
    // Accepts:
    //   git@github.com:owner/repo.git
    //   https://github.com/owner/repo(.git)
    //   ssh://git@github.com/owner/repo.git
    let trimmed = remote_url.trim_end_matches(".git");
    let after_host = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("ssh://git@github.com/") {
        rest
    } else {
        return None;
    };
    let mut parts = after_host.splitn(3, '/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("{owner}/{repo}"))
}

fn resolve_repo_for_lists(repo_id: &str) -> anyhow::Result<(String, String)> {
    let repo = repos::load_repo(repo_id)?
        .ok_or_else(|| anyhow::anyhow!("Repository not found: {repo_id}"))?;
    let login = repo
        .forge_login
        .ok_or_else(|| anyhow::anyhow!("Repository has no GitHub account bound"))?;
    let remote = repo
        .remote_url
        .ok_or_else(|| anyhow::anyhow!("Repository has no remote URL"))?;
    let slug = extract_owner_repo(&remote)
        .ok_or_else(|| anyhow::anyhow!("Could not parse owner/repo from `{remote}`"))?;
    Ok((login, slug))
}

#[tauri::command]
pub async fn github_list_repo_prs(repo_id: String) -> CmdResult<Vec<GhPr>> {
    run_blocking(move || {
        let (login, slug) = resolve_repo_for_lists(&repo_id)?;
        list_repo_prs(&login, &slug)
    })
    .await
}

#[tauri::command]
pub async fn github_list_repo_issues(repo_id: String) -> CmdResult<Vec<GhIssue>> {
    run_blocking(move || {
        let (login, slug) = resolve_repo_for_lists(&repo_id)?;
        list_repo_issues(&login, &slug)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::extract_owner_repo;

    #[test]
    fn parses_git_at_remote() {
        assert_eq!(
            extract_owner_repo("git@github.com:owner/repo.git").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn parses_https_remote() {
        assert_eq!(
            extract_owner_repo("https://github.com/owner/repo.git").as_deref(),
            Some("owner/repo")
        );
        assert_eq!(
            extract_owner_repo("https://github.com/owner/repo").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn parses_ssh_remote() {
        assert_eq!(
            extract_owner_repo("ssh://git@github.com/owner/repo.git").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn rejects_non_github_remote() {
        assert!(extract_owner_repo("https://gitlab.com/owner/repo.git").is_none());
    }
}
```

NOTE: `models::repos::load_repo` may not exist with that exact name. Inspect `src-tauri/src/models/repos.rs` for the actual loader — likely `load_repository` or `find_repo_by_id`. Match the actual function signature. Required fields are `forge_login: Option<String>` and `remote_url: Option<String>` (both already exist in the schema). If a single-repo loader isn't present, use the existing list loader and filter by id; the simpler path is fine here.

- [ ] **Step 4: Register the module and commands**

In `src-tauri/src/commands/mod.rs`:

```
pub mod github_list_commands;
```

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![...]`:

```
        crate::commands::github_list_commands::github_list_repo_issues,
        crate::commands::github_list_commands::github_list_repo_prs,
```

- [ ] **Step 5: Compile + tests + clippy**

```bash
cd src-tauri && cargo test --lib forge::github::lists 2>&1 | tail -15
cd src-tauri && cargo test --lib commands::github_list_commands 2>&1 | tail -15
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

All clean.

- [ ] **Step 6: Frontend wrappers in `src/lib/api.ts`**

Add types + wrappers near the existing Linear / forge block:

```ts
export type GhUser = {
	login: string;
	name?: string | null;
};

export type GhLabel = {
	name: string;
	color: string;
};

export type GhPr = {
	number: number;
	title: string;
	url: string;
	state: string;
	isDraft: boolean;
	updatedAt: string;
	author?: GhUser | null;
	assignees: GhUser[];
	labels: GhLabel[];
};

export type GhIssue = {
	number: number;
	title: string;
	url: string;
	state: string;
	updatedAt: string;
	author?: GhUser | null;
	assignees: GhUser[];
	labels: GhLabel[];
};

export async function githubListRepoPrs(repoId: string): Promise<GhPr[]> {
	return await invoke<GhPr[]>("github_list_repo_prs", { repoId });
}

export async function githubListRepoIssues(repoId: string): Promise<GhIssue[]> {
	return await invoke<GhIssue[]>("github_list_repo_issues", { repoId });
}
```

- [ ] **Step 7: Typecheck + biome**

```bash
bun run typecheck 2>&1 | tail -10
bun x biome check src/lib/api.ts 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/forge/github/lists.rs src-tauri/src/forge/github/mod.rs src-tauri/src/commands/github_list_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/api.ts
git commit -m "feat(github): list_repo_prs and list_repo_issues commands"
```

---

## Task 4: Frontend types + adapters (TDD)

**Files:**
- Create: `src/features/tasks/types.ts`
- Create: `src/features/tasks/adapters/linear.ts`
- Create: `src/features/tasks/adapters/linear.test.ts`
- Create: `src/features/tasks/adapters/github-pr.ts`
- Create: `src/features/tasks/adapters/github-pr.test.ts`
- Create: `src/features/tasks/adapters/github-issue.ts`
- Create: `src/features/tasks/adapters/github-issue.test.ts`

- [ ] **Step 1: `src/features/tasks/types.ts`**

```ts
export type TasksTab = "tasks" | "prs" | "issues";

export type TaskListItem = {
	/** Stable id within its source: Linear issue id, "pr:42", or "issue:7". */
	key: string;
	/** Display id: "SUPER-187" or "#42". */
	displayId: string;
	source: "linear" | "github-pr" | "github-issue";
	title: string;
	status: {
		/** Stable key for grouping ("started", "open", "draft", "in-review", ...). */
		key: string;
		label: string;
		color: string;
	};
	priority?: "urgent" | "high" | "medium" | "low" | "none";
	labels: { name: string; color: string }[];
	assignee?: { login: string; avatarUrl: string | null };
	updatedAt: string;
	url: string;
};
```

- [ ] **Step 2: Write failing test for Linear adapter**

`src/features/tasks/adapters/linear.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LinearIssue } from "@/lib/api";
import { linearIssueToItem } from "./linear";

const sample: LinearIssue = {
	id: "i1",
	identifier: "SUPER-187",
	title: "Fix something",
	url: "https://linear.app/x/issue/SUPER-187",
	priority: 1,
	updatedAt: "2026-03-23T10:00:00Z",
	state: {
		id: "s1",
		name: "In Progress",
		type: "started",
		color: "#5e6ad2",
	},
	assignee: {
		id: "u1",
		name: "Dan",
		avatarUrl: "https://example.com/dan.png",
	},
	labels: { nodes: [{ id: "l1", name: "bug", color: "#eb5757" }] },
};

describe("linearIssueToItem", () => {
	it("maps a fully populated Linear issue", () => {
		const item = linearIssueToItem(sample);
		expect(item.key).toBe("i1");
		expect(item.displayId).toBe("SUPER-187");
		expect(item.source).toBe("linear");
		expect(item.title).toBe("Fix something");
		expect(item.status.key).toBe("started");
		expect(item.status.label).toBe("In Progress");
		expect(item.priority).toBe("urgent");
		expect(item.labels).toEqual([{ name: "bug", color: "#eb5757" }]);
		expect(item.assignee?.login).toBe("Dan");
		expect(item.url).toBe(sample.url);
	});

	it("handles null assignee, empty labels, and zero priority", () => {
		const item = linearIssueToItem({
			...sample,
			assignee: null,
			labels: { nodes: [] },
			priority: 0,
		});
		expect(item.assignee).toBeUndefined();
		expect(item.labels).toEqual([]);
		expect(item.priority).toBe("none");
	});
});
```

- [ ] **Step 3: Verify the test fails (file missing)**

```bash
bun x vitest run src/features/tasks/adapters/linear.test.ts 2>&1 | tail -15
```

Expected: import error or red.

- [ ] **Step 4: Implement `src/features/tasks/adapters/linear.ts`**

```ts
import type { LinearIssue } from "@/lib/api";
import type { TaskListItem } from "../types";

const PRIORITY_LABELS: Record<number, TaskListItem["priority"]> = {
	1: "urgent",
	2: "high",
	3: "medium",
	4: "low",
};

export function linearIssueToItem(issue: LinearIssue): TaskListItem {
	return {
		key: issue.id,
		displayId: issue.identifier,
		source: "linear",
		title: issue.title,
		status: {
			key: issue.state.type,
			label: issue.state.name,
			color: issue.state.color,
		},
		priority: PRIORITY_LABELS[issue.priority] ?? "none",
		labels: issue.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
		assignee: issue.assignee
			? { login: issue.assignee.name, avatarUrl: issue.assignee.avatarUrl }
			: undefined,
		updatedAt: issue.updatedAt,
		url: issue.url,
	};
}
```

- [ ] **Step 5: Tests pass**

```bash
bun x vitest run src/features/tasks/adapters/linear.test.ts 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 6: Test + implement GitHub PR adapter**

`src/features/tasks/adapters/github-pr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GhPr } from "@/lib/api";
import { ghPrToItem } from "./github-pr";

const samplePr: GhPr = {
	number: 42,
	title: "Add feature",
	url: "https://github.com/x/r/pull/42",
	state: "OPEN",
	isDraft: false,
	updatedAt: "2026-03-23T10:00:00Z",
	author: { login: "dan" },
	assignees: [{ login: "dan" }],
	labels: [{ name: "feat", color: "0e8a16" }],
};

describe("ghPrToItem", () => {
	it("maps an open PR", () => {
		const item = ghPrToItem(samplePr);
		expect(item.key).toBe("pr:42");
		expect(item.displayId).toBe("#42");
		expect(item.source).toBe("github-pr");
		expect(item.status.key).toBe("open");
		expect(item.status.label).toBe("Open");
		expect(item.labels).toEqual([{ name: "feat", color: "#0e8a16" }]);
		expect(item.assignee?.login).toBe("dan");
	});

	it("classifies drafts separately", () => {
		expect(ghPrToItem({ ...samplePr, isDraft: true }).status.key).toBe("draft");
	});

	it("falls back to author when no assignees", () => {
		const item = ghPrToItem({ ...samplePr, assignees: [] });
		expect(item.assignee?.login).toBe("dan");
	});

	it("handles no author and no assignees", () => {
		const item = ghPrToItem({ ...samplePr, assignees: [], author: null });
		expect(item.assignee).toBeUndefined();
	});
});
```

`src/features/tasks/adapters/github-pr.ts`:

```ts
import type { GhPr } from "@/lib/api";
import type { TaskListItem } from "../types";

const STATE_LABEL: Record<string, { key: string; label: string; color: string }> = {
	OPEN: { key: "open", label: "Open", color: "#3fb950" },
	MERGED: { key: "merged", label: "Merged", color: "#8957e5" },
	CLOSED: { key: "closed", label: "Closed", color: "#f85149" },
};

export function ghPrToItem(pr: GhPr): TaskListItem {
	const baseStatus = STATE_LABEL[pr.state] ?? {
		key: pr.state.toLowerCase(),
		label: pr.state,
		color: "#6e7681",
	};
	const status = pr.isDraft
		? { key: "draft", label: "Draft", color: "#6e7681" }
		: baseStatus;
	const assignee = pr.assignees[0] ?? pr.author ?? undefined;
	return {
		key: `pr:${pr.number}`,
		displayId: `#${pr.number}`,
		source: "github-pr",
		title: pr.title,
		status,
		labels: pr.labels.map((l) => ({ name: l.name, color: `#${l.color}` })),
		assignee: assignee
			? { login: assignee.login, avatarUrl: null }
			: undefined,
		updatedAt: pr.updatedAt,
		url: pr.url,
	};
}
```

Run:
```bash
bun x vitest run src/features/tasks/adapters/github-pr.test.ts 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 7: Test + implement GitHub Issue adapter**

`src/features/tasks/adapters/github-issue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GhIssue } from "@/lib/api";
import { ghIssueToItem } from "./github-issue";

const sampleIssue: GhIssue = {
	number: 7,
	title: "Bug",
	url: "https://github.com/x/r/issues/7",
	state: "OPEN",
	updatedAt: "2026-03-23T10:00:00Z",
	author: { login: "dan" },
	assignees: [],
	labels: [{ name: "bug", color: "d73a4a" }],
};

describe("ghIssueToItem", () => {
	it("maps an open issue", () => {
		const item = ghIssueToItem(sampleIssue);
		expect(item.key).toBe("issue:7");
		expect(item.displayId).toBe("#7");
		expect(item.source).toBe("github-issue");
		expect(item.status.key).toBe("open");
		expect(item.labels).toEqual([{ name: "bug", color: "#d73a4a" }]);
	});

	it("classifies closed issues", () => {
		const item = ghIssueToItem({ ...sampleIssue, state: "CLOSED" });
		expect(item.status.key).toBe("closed");
	});
});
```

`src/features/tasks/adapters/github-issue.ts`:

```ts
import type { GhIssue } from "@/lib/api";
import type { TaskListItem } from "../types";

const STATE_LABEL: Record<string, { key: string; label: string; color: string }> = {
	OPEN: { key: "open", label: "Open", color: "#3fb950" },
	CLOSED: { key: "closed", label: "Closed", color: "#8b949e" },
};

export function ghIssueToItem(issue: GhIssue): TaskListItem {
	const status = STATE_LABEL[issue.state] ?? {
		key: issue.state.toLowerCase(),
		label: issue.state,
		color: "#6e7681",
	};
	const assignee = issue.assignees[0] ?? issue.author ?? undefined;
	return {
		key: `issue:${issue.number}`,
		displayId: `#${issue.number}`,
		source: "github-issue",
		title: issue.title,
		status,
		labels: issue.labels.map((l) => ({ name: l.name, color: `#${l.color}` })),
		assignee: assignee
			? { login: assignee.login, avatarUrl: null }
			: undefined,
		updatedAt: issue.updatedAt,
		url: issue.url,
	};
}
```

Run:
```bash
bun x vitest run src/features/tasks/adapters/github-issue.test.ts 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 8: Lint + commit**

```bash
bun x biome check src/features/tasks/ 2>&1 | tail -5
bun run typecheck 2>&1 | tail -5
git add src/features/tasks/
git commit -m "feat(tasks): adapters and TaskListItem type"
```

---

## Task 5: React Query keys + `use-tasks-query` hook

**Files:**
- Modify: `src/lib/query-client.ts`
- Create: `src/features/tasks/hooks/use-tasks-query.ts`

- [ ] **Step 1: Extend `src/lib/query-client.ts`**

Find the `helmorQueryKeys` object (starts ~line 61). Add a nested `tasks` entry alongside the existing keys:

```ts
	tasks: {
		linear: (repoId: string, teamId: string) =>
			["tasks", "linear", repoId, teamId] as const,
		githubPrs: (repoId: string) => ["tasks", "githubPrs", repoId] as const,
		githubIssues: (repoId: string) => ["tasks", "githubIssues", repoId] as const,
	},
```

Match the surrounding style (tabs, trailing commas).

- [ ] **Step 2: Create `src/features/tasks/hooks/use-tasks-query.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import {
	type GhIssue,
	type GhPr,
	type LinearIssue,
	githubListRepoIssues,
	githubListRepoPrs,
	linearListTasks,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { ghIssueToItem } from "../adapters/github-issue";
import { ghPrToItem } from "../adapters/github-pr";
import { linearIssueToItem } from "../adapters/linear";
import type { TaskListItem, TasksTab } from "../types";

const STALE_TIME = 60_000;

type Result = {
	items: TaskListItem[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
};

export function useTasksQuery(args: {
	tab: TasksTab;
	repoId: string | null;
	linearTeamId: string | null;
}): Result {
	const linear = useQuery<LinearIssue[]>({
		queryKey:
			args.repoId && args.linearTeamId
				? helmorQueryKeys.tasks.linear(args.repoId, args.linearTeamId)
				: ["tasks", "linear", "disabled"],
		queryFn: () => linearListTasks(args.linearTeamId as string),
		enabled:
			args.tab === "tasks" && !!args.repoId && !!args.linearTeamId,
		staleTime: STALE_TIME,
	});

	const prs = useQuery<GhPr[]>({
		queryKey: args.repoId
			? helmorQueryKeys.tasks.githubPrs(args.repoId)
			: ["tasks", "githubPrs", "disabled"],
		queryFn: () => githubListRepoPrs(args.repoId as string),
		enabled: args.tab === "prs" && !!args.repoId,
		staleTime: STALE_TIME,
	});

	const issues = useQuery<GhIssue[]>({
		queryKey: args.repoId
			? helmorQueryKeys.tasks.githubIssues(args.repoId)
			: ["tasks", "githubIssues", "disabled"],
		queryFn: () => githubListRepoIssues(args.repoId as string),
		enabled: args.tab === "issues" && !!args.repoId,
		staleTime: STALE_TIME,
	});

	const active =
		args.tab === "tasks" ? linear : args.tab === "prs" ? prs : issues;

	const items: TaskListItem[] = (() => {
		if (args.tab === "tasks") {
			return (linear.data ?? []).map(linearIssueToItem);
		}
		if (args.tab === "prs") {
			return (prs.data ?? []).map(ghPrToItem);
		}
		return (issues.data ?? []).map(ghIssueToItem);
	})();

	return {
		items,
		isLoading: active.isLoading,
		isError: active.isError,
		error: active.error,
		refetch: () => {
			void active.refetch();
		},
	};
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-client.ts src/features/tasks/hooks/use-tasks-query.ts
git commit -m "feat(tasks): query keys + use-tasks-query hook"
```

---

## Task 6: List + row + empty-state components

**Files:**
- Create: `src/features/tasks/components/item-row.tsx`
- Create: `src/features/tasks/components/item-list.tsx`
- Create: `src/features/tasks/components/empty-states.tsx`

- [ ] **Step 1: `item-row.tsx`**

```tsx
import { ChevronRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TaskListItem } from "../types";

const PRIORITY_GLYPH: Record<NonNullable<TaskListItem["priority"]>, string> = {
	urgent: "■",
	high: "▮",
	medium: "▬",
	low: "▭",
	none: "·",
};

function relative(dateIso: string): string {
	const then = new Date(dateIso).getTime();
	if (Number.isNaN(then)) return "";
	const diffSec = Math.round((Date.now() - then) / 1000);
	const day = 86_400;
	if (diffSec < day) return "today";
	if (diffSec < day * 7) return `${Math.round(diffSec / day)}d ago`;
	if (diffSec < day * 30) return `${Math.round(diffSec / (day * 7))}w ago`;
	if (diffSec < day * 365) return `${Math.round(diffSec / (day * 30))}mo ago`;
	return `${Math.round(diffSec / (day * 365))}y ago`;
}

export function ItemRow({ item }: { item: TaskListItem }) {
	return (
		<button
			type="button"
			onClick={() => void openUrl(item.url)}
			className="group flex w-full cursor-pointer items-center gap-2 border-b border-border/50 px-4 py-1.5 text-left text-xs hover:bg-muted/40"
		>
			<span
				className="w-3 shrink-0 text-center text-muted-foreground"
				aria-hidden="true"
				title={item.priority ?? "none"}
			>
				{PRIORITY_GLYPH[item.priority ?? "none"]}
			</span>
			<span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
				{item.displayId}
			</span>
			<span className="min-w-0 flex-1 truncate">{item.title}</span>
			<span className="ml-auto flex shrink-0 items-center gap-1.5">
				{item.labels.slice(0, 3).map((label) => (
					<span
						key={label.name}
						className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
						style={{ color: label.color }}
					>
						{label.name}
					</span>
				))}
				{item.assignee ? (
					<span className="size-5 shrink-0 rounded-full bg-muted text-center text-[10px] leading-5">
						{item.assignee.login.slice(0, 1).toUpperCase()}
					</span>
				) : null}
				<span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
					{relative(item.updatedAt)}
				</span>
				<ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
			</span>
		</button>
	);
}
```

- [ ] **Step 2: `item-list.tsx` — group by status with collapsible headers**

```tsx
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskListItem } from "../types";
import { ItemRow } from "./item-row";

type Group = {
	key: string;
	label: string;
	color: string;
	items: TaskListItem[];
};

function groupByStatus(items: TaskListItem[]): Group[] {
	const map = new Map<string, Group>();
	for (const item of items) {
		const existing = map.get(item.status.key);
		if (existing) {
			existing.items.push(item);
		} else {
			map.set(item.status.key, {
				key: item.status.key,
				label: item.status.label,
				color: item.status.color,
				items: [item],
			});
		}
	}
	return Array.from(map.values());
}

export function ItemList({ items }: { items: TaskListItem[] }) {
	const groups = useMemo(() => groupByStatus(items), [items]);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	if (items.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Nothing here yet.
			</div>
		);
	}

	return (
		<div className="flex flex-col overflow-auto">
			{groups.map((group) => {
				const isCollapsed = collapsed[group.key] === true;
				return (
					<section key={group.key}>
						<button
							type="button"
							onClick={() =>
								setCollapsed((prev) => ({
									...prev,
									[group.key]: !prev[group.key],
								}))
							}
							className="flex w-full cursor-pointer items-center gap-2 bg-muted/30 px-3 py-1 text-left text-xs font-medium"
						>
							{isCollapsed ? (
								<ChevronRight className="size-3" />
							) : (
								<ChevronDown className="size-3" />
							)}
							<span
								className="size-2 rounded-full"
								style={{ background: group.color }}
								aria-hidden="true"
							/>
							<span>{group.label}</span>
							<span className="text-muted-foreground">{group.items.length}</span>
						</button>
						{isCollapsed
							? null
							: group.items.map((item) => (
									<ItemRow key={item.key} item={item} />
								))}
					</section>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 3: `empty-states.tsx`**

```tsx
import { Linear, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyConnectLinear({ onOpenSettings }: { onOpenSettings: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<ListChecks className="size-8" />
			<p>Connect your Linear account to see tasks here.</p>
			<Button size="sm" onClick={onOpenSettings}>
				Open Settings
			</Button>
		</div>
	);
}

export function EmptyLinkLinearTeam({
	onPickTeam,
}: {
	onPickTeam: () => void;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<p>Link a Linear team to this repository to see tasks.</p>
			<Button size="sm" onClick={onPickTeam}>
				Link Linear team
			</Button>
		</div>
	);
}

export function EmptyNoGitHubLogin() {
	return (
		<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
			Sign in to GitHub in Settings to see this repository's PRs and issues.
		</div>
	);
}

export function ErrorState({ message }: { message: string }) {
	return (
		<div className="flex h-full items-center justify-center text-sm text-destructive">
			{message}
		</div>
	);
}
```

NOTE: There is no `Linear` icon in `lucide-react`. Remove that import and use a more generic icon like `Sparkles` or `Plug` — or just drop the icon import altogether and only import `ListChecks` (already used in the sidebar). Adjust the imports to whatever actually exists.

- [ ] **Step 4: Typecheck + biome**

```bash
bun run typecheck 2>&1 | tail -10
bun x biome check src/features/tasks/components/ 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/components/
git commit -m "feat(tasks): list, row, and empty-state components"
```

---

## Task 7: Repo switcher + tab bar

**Files:**
- Create: `src/features/tasks/components/repo-switcher.tsx`
- Create: `src/features/tasks/components/tab-bar.tsx`

- [ ] **Step 1: `repo-switcher.tsx`**

```tsx
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RepositoryCreateOption } from "@/lib/api";

export function RepoSwitcher({
	repos,
	selectedId,
	onSelect,
}: {
	repos: RepositoryCreateOption[];
	selectedId: string | null;
	onSelect: (repoId: string) => void;
}) {
	const selected = repos.find((r) => r.id === selectedId) ?? repos[0];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1.5">
					<span className="font-medium">{selected?.name ?? "Select repo"}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[180px]">
				{repos.map((repo) => (
					<DropdownMenuItem key={repo.id} onClick={() => onSelect(repo.id)}>
						{repo.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

If `RepositoryCreateOption` shape doesn't include `id` and `name`, inspect `src/lib/api.ts` for the actual type and adapt the props.

- [ ] **Step 2: `tab-bar.tsx`**

No filters yet — just three tabs side-by-side.

```tsx
import type { TasksTab } from "../types";

const TABS: { key: TasksTab; label: string }[] = [
	{ key: "tasks", label: "Tasks" },
	{ key: "prs", label: "PRs" },
	{ key: "issues", label: "Issues" },
];

export function TabBar({
	active,
	onChange,
}: {
	active: TasksTab;
	onChange: (tab: TasksTab) => void;
}) {
	return (
		<div className="flex items-center gap-1 text-xs">
			{TABS.map((tab) => (
				<button
					key={tab.key}
					type="button"
					onClick={() => onChange(tab.key)}
					className={
						active === tab.key
							? "cursor-pointer rounded px-2 py-1 font-medium bg-muted"
							: "cursor-pointer rounded px-2 py-1 text-muted-foreground hover:bg-muted/50"
					}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck 2>&1 | tail -5
bun x biome check src/features/tasks/components/ 2>&1 | tail -5
git add src/features/tasks/components/repo-switcher.tsx src/features/tasks/components/tab-bar.tsx
git commit -m "feat(tasks): repo switcher and tab bar"
```

---

## Task 8: Screen container + index.tsx

**Files:**
- Create: `src/features/tasks/index.tsx`
- Create: `src/features/tasks/container.tsx`

Container fetches the repos list, derives the linked Linear team for the active repo (calls `linearGetAuthStatus` + reads the repo's `linearTeamId` field — see note below), and wires the query hook + components together.

- [ ] **Step 1: Confirm `linearTeamId` is exposed on the repo type**

The Plan 1 migration added `linear_team_id` to the `repos` table. Whether the frontend `RepositoryCreateOption` (or equivalent repo DTO) actually surfaces this field depends on the existing Rust → TS serializer. Inspect `src/lib/api.ts`'s `RepositoryCreateOption` (or `Repository`) type and the corresponding Rust struct.

If `linearTeamId` is NOT yet exposed:
- Extend the Rust struct that lists repositories to include `linear_team_id` (Option<String>) with serde camelCase.
- Extend the TS type to match.
- Commit before continuing Task 8.

This is a minor exposure step, not architectural — it should be a 3-line change in Rust + TS.

- [ ] **Step 2: `container.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	type LinearAuthStatus,
	linearGetAuthStatus,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { repositoriesQueryOptions } from "@/lib/query-client";
import { useTasksQuery } from "./hooks/use-tasks-query";
import type { TasksTab } from "./types";
import {
	EmptyConnectLinear,
	EmptyLinkLinearTeam,
	EmptyNoGitHubLogin,
	ErrorState,
} from "./components/empty-states";
import { ItemList } from "./components/item-list";
import { RepoSwitcher } from "./components/repo-switcher";
import { TabBar } from "./components/tab-bar";

export function TasksScreenContainer({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	const reposQuery = useQuery(repositoriesQueryOptions());
	const repos = reposQuery.data ?? [];
	const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TasksTab>("tasks");

	useEffect(() => {
		if (!selectedRepoId && repos[0]) {
			setSelectedRepoId(repos[0].id);
		}
	}, [repos, selectedRepoId]);

	const linearAuthQuery = useQuery<LinearAuthStatus>({
		queryKey: ["linear", "auth-status"],
		queryFn: linearGetAuthStatus,
		staleTime: 60_000,
	});

	const selectedRepo = useMemo(
		() => repos.find((r) => r.id === selectedRepoId),
		[repos, selectedRepoId],
	);

	const tasks = useTasksQuery({
		tab: activeTab,
		repoId: selectedRepoId,
		linearTeamId: selectedRepo?.linearTeamId ?? null,
	});

	const body = (() => {
		if (!selectedRepo) {
			return <ErrorState message="Select a repository" />;
		}
		if (activeTab === "tasks") {
			if (linearAuthQuery.data && !linearAuthQuery.data.connected) {
				return <EmptyConnectLinear onOpenSettings={onOpenSettings} />;
			}
			if (!selectedRepo.linearTeamId) {
				return (
					<EmptyLinkLinearTeam
						onPickTeam={() => {
							// Plan 3 will add the team picker. For now, redirect to Settings.
							onOpenSettings();
						}}
					/>
				);
			}
		}
		if (activeTab !== "tasks" && !selectedRepo.forgeLogin) {
			return <EmptyNoGitHubLogin />;
		}
		if (tasks.isLoading) {
			return (
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					Loading…
				</div>
			);
		}
		if (tasks.isError) {
			return (
				<ErrorState
					message={
						tasks.error instanceof Error
							? tasks.error.message
							: "Something went wrong"
					}
				/>
			);
		}
		return <ItemList items={tasks.items} />;
	})();

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-3 border-b border-border/50 px-4 py-2">
				<RepoSwitcher
					repos={repos}
					selectedId={selectedRepoId}
					onSelect={setSelectedRepoId}
				/>
				<div className="h-4 w-px bg-border" />
				<TabBar active={activeTab} onChange={setActiveTab} />
			</header>
			<div className="min-h-0 flex-1">{body}</div>
		</div>
	);
}
```

Note `RepositoryCreateOption` field names — `selectedRepo.linearTeamId` and `selectedRepo.forgeLogin` must exist on the type. If the actual field is named differently (e.g., `forge_login`), adjust accordingly.

Note: `helmorQueryKeys` import is included but unused above; remove it if so. Keep only what compiles.

- [ ] **Step 3: `index.tsx` (re-export)**

```tsx
export { TasksScreenContainer } from "./container";
```

- [ ] **Step 4: Typecheck + biome**

```bash
bun run typecheck 2>&1 | tail -20
bun x biome check src/features/tasks/ 2>&1 | tail -10
```

If typecheck fails due to missing `linearTeamId` / `forgeLogin` on the repo type, fix it in step 1 then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/index.tsx src/features/tasks/container.tsx
git commit -m "feat(tasks): screen container with tabs and data wiring"
```

---

## Task 9: Wire into App.tsx + sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/navigation/index.tsx`

- [ ] **Step 1: Add `"tasks"` to `WorkspaceViewMode`**

In `src/App.tsx`, around line 184-189:

```ts
type WorkspaceViewMode = "conversation" | "editor" | "start" | "history" | "kanban" | "tasks";
```

- [ ] **Step 2: Add handler**

Near `handleOpenKanban` / `handleOpenHistory` (around line 2707-2733), add:

```ts
const handleOpenTasks = useCallback(() => {
    setSelectedWorkspaceId(null);
    setSelectedSessionId(null);
    setWorkspaceViewMode("tasks");
}, []);
```

Match exactly how the other handlers reset session/workspace state.

- [ ] **Step 3: Render**

In the rendering block around line 3203-3242 where `historyActive` / `kanbanActive` branches live, add a branch for tasks:

```tsx
) : workspaceViewMode === "tasks" ? (
    <TasksScreenContainer onOpenSettings={() => setSettingsOpen(true)} />
) : workspaceViewMode === "history" ? (
    // ... existing
```

Place the new branch above the history one (or wherever logically grouped with the other "non-conversation" modes). Import `TasksScreenContainer` at the top of the file.

`setSettingsOpen` — find the actual name in App.tsx (might be `setSettingsDialogOpen`). Match the existing usage.

- [ ] **Step 4: Pass props to sidebar**

Where the sidebar component is rendered (look for `onOpenKanban` / `onOpenHistory` near line 3138-3141), add:

```tsx
onOpenTasks={handleOpenTasks}
tasksActive={workspaceViewMode === "tasks"}
```

- [ ] **Step 5: Wire the sidebar nav item**

In `src/features/navigation/index.tsx`, lines 720-734, find:

```tsx
<SidebarNavItem icon={ListChecks} label="Tasks" />
```

Replace with:

```tsx
<SidebarNavItem
    icon={ListChecks}
    label="Tasks"
    onClick={onOpenTasks}
    active={tasksActive}
/>
```

Then add the two new props to the navigation component's prop type signature — match where `onOpenKanban` / `kanbanActive` are declared. Likely:

```ts
onOpenTasks?: () => void;
tasksActive?: boolean;
```

- [ ] **Step 6: Typecheck + frontend tests**

```bash
bun run typecheck 2>&1 | tail -15
bun run test:frontend 2>&1 | tail -20
```

Existing pre-existing failures in `src/features/editor/index.test.tsx` may still fail — that's unrelated to this work.

- [ ] **Step 7: Manual smoke**

```bash
bun run dev
```

Click the Tasks sidebar item. Verify the Tasks screen mounts with the repo switcher, tabs, and:
- If Linear connected + repo has a Linear team mapping → shows Linear tasks.
- If Linear not connected → "Connect Linear" CTA.
- If repo has no `linearTeamId` → "Link Linear team" CTA.
- Click PRs tab → shows open PRs for the repo (or "Sign in to GitHub" if no `forgeLogin`).
- Click Issues tab → shows open issues.
- Click a row → opens in the browser.
- Group headers collapse/expand on click.

There is no UI for mapping the Linear team yet — to set one for testing, either run a SQL update against the dev DB or temporarily add the mapping via the existing `linear_set_repo_team` command from the dev console:

```js
await window.__TAURI__.core.invoke("linear_set_repo_team", { repoId: "...", teamId: "..." })
```

(Use a real team id from `linear_list_teams`. The proper picker UI lands in Plan 3.)

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/features/navigation/index.tsx
git commit -m "feat(tasks): wire sidebar entry and routing"
```

---

## Task 10: Final sweep

- [ ] **Step 1: Full lint + test**

```bash
bun run lint 2>&1 | tail -20
bun run test 2>&1 | tail -30
```

Expect:
- biome + clippy clean.
- All frontend tests pass EXCEPT the pre-existing `src/features/editor/index.test.tsx` failures already documented in Plan 1.
- Rust + sidecar tests pass.

- [ ] **Step 2: Done.** Plan 3 (filters, persistence, detail panel, workspace integration, all-repos) is next.

---

## Verification matrix

| Spec requirement (from `2026-05-10-tasks-screen-design.md`) | Plan 2 task |
| --- | --- |
| `TaskListItem` shape used everywhere | Task 4 |
| Linear `list_tasks` Rust command | Tasks 1 + 2 |
| GH `list_repo_prs` / `list_repo_issues` commands | Task 3 |
| Adapter layer per source | Task 4 |
| Sidebar entry "Tasks" wired up | Task 9 |
| App.tsx routing for tasks view | Task 9 |
| Repo switcher | Task 7 |
| Tabs (Tasks / PRs / Issues) | Task 7 |
| Hardcoded filter defaults (no filter UI yet) | Tasks 1/3 (query-side); Task 7 (no UI) |
| Grouped by status, collapsible | Task 6 |
| Empty / disconnected states | Tasks 6 + 8 |
| Plain list, no virtualization | Task 6 |
| Click row → opens in browser (interim until Plan 3 detail panel) | Task 6 |
| Persisted filter / last-view state | **Deferred to Plan 3** |
| Detail panel | **Deferred to Plan 3** |
| "All repos" mode | **Deferred to Plan 3** |
| Workspace integration | **Deferred to Plan 3** |
