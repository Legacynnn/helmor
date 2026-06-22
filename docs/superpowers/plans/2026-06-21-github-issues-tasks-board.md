# GitHub Issues on the Tasks Board — Implementation Plan (Phases 1–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub issues a first-class, natively-editable provider on Helmor's Tasks board (today hard-coded to Linear), scoped per-repository and authed through the bundled `gh` CLI.

**Architecture:** Refactor the `integrations` backend from Linear-only into a multi-provider layer behind a `TaskProvider` trait, add a dedicated `integrations/github/` GraphQL client (built on the existing `forge/github` `gh`-auth + `run_graphql` plumbing) that normalizes GitHub repo issues into the existing `ProviderTask` model, then light up the (currently-disabled) GitHub tab on the Tasks board with provider-aware field gating and a repo selector. The local SQLite task mirror, board/list UI, drag-to-move, agent-review, and start-workspace are all provider-agnostic already and work unchanged.

**Tech Stack:** Rust (Tauri v2, `anyhow`, `serde_json`, `rusqlite`), TypeScript/React 19 (TanStack Query), the bundled `gh` CLI for GitHub GraphQL. Tests: `cargo test` (Rust unit/insta), `vitest` (frontend).

**Scope note:** This is the "board first" deliverable from the design doc (`docs/superpowers/specs/2026-06-21-github-issues-tasks-and-linear-sidebar-design.md`), covering spec Phases 1–3. Phase 4 (Linear in the context sidebar + rebuilding the Cmd+Shift+C GitHub-issue inbox path) is a separate follow-up plan.

---

## File Structure

**Backend (new):**
- `src-tauri/src/integrations/github/mod.rs` — `GithubProvider` struct + high-level ops (mirrors `linear/mod.rs`)
- `src-tauri/src/integrations/github/client.rs` — thin wrapper over `forge::github` `run_graphql` / `run_graphql_raw`
- `src-tauri/src/integrations/github/queries.rs` — GraphQL query/mutation strings
- `src-tauri/src/integrations/github/map.rs` — GitHub JSON → normalized `ProviderTask`/`TaskStatus`/etc.
- `src-tauri/src/integrations/github/auth.rs` — resolve the active `gh` login + friendly errors

**Backend (modified):**
- `src-tauri/src/integrations/provider.rs` — add `TaskProvider` trait + move shared `OrgTeams`/`IssuePatch`/`NewIssue` here; add fixed GitHub status helpers
- `src-tauri/src/integrations/mod.rs` — add `pub mod github;`, `GITHUB_PROVIDER`, `resolve_provider`
- `src-tauri/src/integrations/linear/mod.rs` — add `LinearProvider` impl wrapping existing fns
- `src-tauri/src/commands/integrations_commands.rs` — route every command through `resolve_provider`; provider-aware `connect_integration`/`build_status`
- `src-tauri/src/forge/github/api.rs` — make `run_graphql`/`run_graphql_raw` reachable from `integrations` (`pub(crate)`)
- `src-tauri/src/forge/github/accounts.rs` — expose a `default_login()` helper

**Frontend (modified):**
- `src/lib/api.ts` — `IntegrationProvider = "linear" | "github"`
- `src/features/tasks/components/provider-tab-bar.tsx` — enable the GitHub tab
- `src/features/tasks/container.tsx` — provider state (was `const provider = "linear"`), persisted; provider-aware empty state copy
- `src/features/tasks/filters/facets.tsx` — `facetsForProvider("github")` drops priority/project
- `src/features/tasks/components/task-detail-view.tsx` — hide priority/project editors for GitHub
- `src/features/tasks/components/create-task-dialog.tsx` — hide priority/project fields for GitHub
- `src/features/settings/panels/integrations.tsx` — add a GitHub card (gh-auth status + repo selector, no API key)

---

## PHASE 1 — Multi-provider integrations core (backend)

Goal: introduce the `TaskProvider` trait and `resolve_provider` dispatch, wrap Linear as one impl, and route all commands through it. **Zero behavior change for Linear** — existing `integration_connections` tests and any Linear flows stay green.

### Task 1: Relocate shared provider types into `provider.rs`

`OrgTeams`, `IssuePatch`, and `NewIssue` currently live in `linear/mod.rs` but are provider-agnostic. Move them so both providers and the trait can share them.

**Files:**
- Modify: `src-tauri/src/integrations/provider.rs`
- Modify: `src-tauri/src/integrations/linear/mod.rs`

- [ ] **Step 1: Add the shared types to `provider.rs`**

Append to `src-tauri/src/integrations/provider.rs`:

```rust
use serde_json::{json, Map, Value};

/// Result of the bootstrap probe — also doubles as credential validation.
pub struct OrgTeams {
    pub org_name: String,
    pub teams: Vec<IntegrationTeam>,
}

/// Mutable fields for an issue update. `None` leaves a field untouched.
#[derive(Debug, Default, Clone)]
pub struct IssuePatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<String>,
    pub priority: Option<i64>,
    pub assignee_id: Option<String>,
    /// Full replacement set of label ids.
    pub label_ids: Option<Vec<String>>,
}

impl IssuePatch {
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.status_id.is_none()
            && self.priority.is_none()
            && self.assignee_id.is_none()
            && self.label_ids.is_none()
    }

    /// Linear-style GraphQL input map. GitHub builds its own input separately.
    pub fn to_linear_input(&self) -> Value {
        let mut input = Map::new();
        if let Some(title) = &self.title {
            input.insert("title".into(), json!(title));
        }
        if let Some(description) = &self.description {
            input.insert("description".into(), json!(description));
        }
        if let Some(status_id) = &self.status_id {
            input.insert("stateId".into(), json!(status_id));
        }
        if let Some(priority) = self.priority {
            input.insert("priority".into(), json!(priority));
        }
        if let Some(assignee_id) = &self.assignee_id {
            if assignee_id.is_empty() {
                input.insert("assigneeId".into(), Value::Null);
            } else {
                input.insert("assigneeId".into(), json!(assignee_id));
            }
        }
        if let Some(label_ids) = &self.label_ids {
            input.insert("labelIds".into(), json!(label_ids));
        }
        Value::Object(input)
    }
}

/// Optional fields for a new issue beyond the required title.
#[derive(Debug, Default)]
pub struct NewIssue<'a> {
    pub description: Option<&'a str>,
    pub priority: Option<i64>,
    pub status_id: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub project_id: Option<&'a str>,
    pub label_ids: Option<&'a [String]>,
}
```

- [ ] **Step 2: Remove the duplicates from `linear/mod.rs` and import from `provider`**

In `src-tauri/src/integrations/linear/mod.rs`:
- Delete the `OrgTeams` struct (lines ~17-21), the `IssuePatch` struct + impl (lines ~23-72), and the `NewIssue` struct (lines ~221-230).
- Update the `use` block to import them and rename `to_input` → `to_linear_input`:

```rust
use crate::integrations::provider::{
    IntegrationTeam, IssuePatch, NewIssue, OrgTeams, ProviderTask, TaskAssignee, TaskLabel,
    TaskProject, TaskStatus,
};
```

- In `update_issue`, change `patch.to_input()` to `patch.to_linear_input()`.

- [ ] **Step 3: Compile**

Run: `cd src-tauri && cargo build`
Expected: builds clean (only `linear/mod.rs` and `provider.rs` touched; `integrations_commands.rs` still imports `IssuePatch` from `linear` — fix in next step if the compiler flags it).

- [ ] **Step 4: Fix the command import of `IssuePatch`**

`integrations_commands.rs` builds `linear::IssuePatch { ... }` (line ~340). Change the construction to `crate::integrations::provider::IssuePatch { ... }` and `linear::update_issue`'s call stays the same. Re-run `cargo build`.
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integrations/provider.rs src-tauri/src/integrations/linear/mod.rs src-tauri/src/commands/integrations_commands.rs
git commit -m "refactor(integrations): move shared OrgTeams/IssuePatch/NewIssue into provider.rs"
```

### Task 2: Define the `TaskProvider` trait and `LinearProvider` impl

**Files:**
- Modify: `src-tauri/src/integrations/provider.rs`
- Modify: `src-tauri/src/integrations/linear/mod.rs`

- [ ] **Step 1: Add the trait to `provider.rs`**

Append to `src-tauri/src/integrations/provider.rs`:

```rust
use anyhow::Result;

/// Provider-agnostic operations the IPC commands call. Each concrete provider
/// (Linear, GitHub) constructs short-lived clients internally.
pub trait TaskProvider: Send {
    /// Probe credentials and load the org name + selectable teams (GitHub: repos).
    fn org_and_teams(&self) -> Result<OrgTeams>;
    /// Workflow states for a team (GitHub: the fixed Open/Done/Not planned set).
    fn list_states(&self, team: &str) -> Result<Vec<TaskStatus>>;
    fn list_projects(&self, team: &str) -> Result<Vec<TaskProject>>;
    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>>;
    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>>;
    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>>;
    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask>;
    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask>;
}
```

- [ ] **Step 2: Add `LinearProvider` to `linear/mod.rs`**

The free functions in `linear/mod.rs` already do the work; wrap them. Append to `src-tauri/src/integrations/linear/mod.rs`:

```rust
use crate::integrations::provider::TaskProvider;

/// `TaskProvider` impl backed by a Linear personal API key.
pub struct LinearProvider {
    api_key: String,
}

impl LinearProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self { api_key: api_key.into() }
    }
}

impl TaskProvider for LinearProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        fetch_org_and_teams(&self.api_key)
    }
    fn list_states(&self, team: &str) -> Result<Vec<TaskStatus>> {
        list_team_states(&self.api_key, team)
    }
    fn list_projects(&self, team: &str) -> Result<Vec<TaskProject>> {
        list_team_projects(&self.api_key, team)
    }
    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>> {
        list_team_labels(&self.api_key, team)
    }
    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>> {
        list_team_members(&self.api_key, team)
    }
    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>> {
        list_team_issues(&self.api_key, team)
    }
    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask> {
        update_issue(&self.api_key, external_id, patch)
    }
    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask> {
        create_issue(&self.api_key, team, title, fields)
    }
}
```

- [ ] **Step 3: Compile**

Run: `cd src-tauri && cargo build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/integrations/provider.rs src-tauri/src/integrations/linear/mod.rs
git commit -m "feat(integrations): add TaskProvider trait + LinearProvider impl"
```

### Task 3: Add `GITHUB_PROVIDER` const and a placeholder `resolve_provider`

We add the dispatch now (GitHub branch will be filled in Phase 2). To keep Phase 1 self-contained and Linear-green, the GitHub branch returns a clear "not yet available" error until Phase 2.

**Files:**
- Modify: `src-tauri/src/integrations/mod.rs`

- [ ] **Step 1: Edit `integrations/mod.rs`**

Replace the body below the doc comment with:

```rust
pub mod credentials;
pub mod github;
pub mod linear;
pub mod provider;

use anyhow::{bail, Context, Result};
use provider::TaskProvider;

/// Stable provider id for Linear.
pub const LINEAR_PROVIDER: &str = "linear";
/// Stable provider id for GitHub Issues.
pub const GITHUB_PROVIDER: &str = "github";

/// Resolve a provider id into a live `TaskProvider`, loading its credentials.
pub fn resolve_provider(provider: &str) -> Result<Box<dyn TaskProvider>> {
    match provider {
        LINEAR_PROVIDER => {
            let key = credentials::load_api_key(LINEAR_PROVIDER)?.with_context(|| {
                "Linear is not connected — add an API key in Settings → Integrations".to_string()
            })?;
            Ok(Box::new(linear::LinearProvider::new(key)))
        }
        GITHUB_PROVIDER => {
            let login = github::default_login()?;
            Ok(Box::new(github::GithubProvider::new(login)))
        }
        other => bail!("Unsupported integration provider: {other}"),
    }
}
```

- [ ] **Step 2: Create a minimal `github` module so Phase 1 compiles**

Create `src-tauri/src/integrations/github/mod.rs` with a stub that the Phase-2 tasks will flesh out:

```rust
//! GitHub Issues provider. Repos act as "teams"; issues normalize into the
//! shared `ProviderTask` model. Built on the bundled `gh` auth via `forge`.

pub mod auth;

pub use auth::default_login;

use anyhow::Result;

use crate::integrations::provider::{
    IssuePatch, NewIssue, OrgTeams, ProviderTask, TaskAssignee, TaskLabel, TaskProject,
    TaskProvider, TaskStatus,
};

pub struct GithubProvider {
    login: String,
}

impl GithubProvider {
    pub fn new(login: impl Into<String>) -> Self {
        Self { login: login.into() }
    }
}

impl TaskProvider for GithubProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        let _ = &self.login;
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_states(&self, _team: &str) -> Result<Vec<TaskStatus>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_projects(&self, _team: &str) -> Result<Vec<TaskProject>> {
        Ok(Vec::new())
    }
    fn list_labels(&self, _team: &str) -> Result<Vec<TaskLabel>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_members(&self, _team: &str) -> Result<Vec<TaskAssignee>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_issues(&self, _team: &str) -> Result<Vec<ProviderTask>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn update_issue(&self, _external_id: &str, _patch: &IssuePatch) -> Result<ProviderTask> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn create_issue(&self, _team: &str, _title: &str, _fields: &NewIssue<'_>) -> Result<ProviderTask> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
}
```

- [ ] **Step 3: Create `auth.rs` with `default_login`**

First expose a default-login helper on `forge`. In `src-tauri/src/forge/github/accounts.rs`, add (near `list_github_accounts_full`):

```rust
/// The active GitHub login (the account `gh auth switch` points at), or the
/// first authenticated account if none is explicitly active.
pub(crate) fn default_login() -> anyhow::Result<Option<String>> {
    let accounts = list_github_accounts_full()?;
    let active = accounts.iter().find(|a| a.active).or_else(|| accounts.first());
    Ok(active.map(|a| a.login.clone()))
}
```

(If `ForgeAccount`'s field is named differently than `login`/`active`, match the actual field names — verify against the struct in `accounts.rs`.)

Then create `src-tauri/src/integrations/github/auth.rs`:

```rust
//! Resolve the GitHub login used for integration calls. We reuse Helmor's
//! existing bundled-`gh` auth (the same accounts that power the inbox) rather
//! than a separate token — "connecting" GitHub for tasks is just picking a repo.

use anyhow::{Context, Result};

/// The login the integration should act as. Errors with a connect hint if the
/// user has not authenticated `gh` yet.
pub fn default_login() -> Result<String> {
    crate::forge::github::accounts::default_login()?
        .context("GitHub is not signed in — sign in to GitHub first, then pick a repository")
}
```

- [ ] **Step 4: Compile**

Run: `cd src-tauri && cargo build`
Expected: clean build. (`resolve_provider` is unused so far → `cargo build` is fine; it's used in Task 4. If you get a dead-code warning, that's expected and cleared by Task 4. Do NOT add `#[allow(dead_code)]`.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integrations/mod.rs src-tauri/src/integrations/github/ src-tauri/src/forge/github/accounts.rs
git commit -m "feat(integrations): add GITHUB_PROVIDER + resolve_provider dispatch (github stubbed)"
```

### Task 4: Route the IPC commands through `resolve_provider`

Replace the Linear-hard-coded calls in `integrations_commands.rs` with trait dispatch. `connect_integration` and `build_status` stay provider-aware.

**Files:**
- Modify: `src-tauri/src/commands/integrations_commands.rs`

- [ ] **Step 1: Rework the helpers and imports**

At the top, replace `use crate::integrations::{self, credentials, linear};` and the `LINEAR` const + `ensure_supported`/`require_api_key` helpers with:

```rust
use crate::integrations::provider::{
    IntegrationStatus, IntegrationTeam, IssuePatch, NewIssue, TaskAssignee, TaskLabel, TaskProject,
    TaskStatus,
};
use crate::integrations::{self, credentials, resolve_provider, GITHUB_PROVIDER, LINEAR_PROVIDER};
```

Keep `credentials` (Linear connect still stores a key). Remove `ensure_supported` and `require_api_key`.

Add a helper to resolve the selected team for a provider (used by several commands):

```rust
fn selected_team(provider: &str, team_id: Option<String>) -> anyhow::Result<String> {
    team_id
        .or_else(|| {
            conns::load_connection(provider)
                .ok()
                .flatten()
                .and_then(|r| r.selected_team_id)
        })
        .with_context(|| format!("No team selected for {provider}"))
}
```

- [ ] **Step 2: Rewrite `build_status` to be provider-agnostic**

```rust
fn build_status(provider: &str, teams: Option<Vec<IntegrationTeam>>) -> anyhow::Result<IntegrationStatus> {
    let record = conns::load_connection(provider)?;
    // Try to resolve the provider; if creds are missing this is Err and we treat
    // the integration as disconnected (no teams).
    let resolved = resolve_provider(provider);
    let teams = match (resolved.as_ref(), teams) {
        (_, Some(t)) => t,
        (Ok(p), None) => p.org_and_teams().map(|ot| ot.teams).unwrap_or_default(),
        (Err(_), None) => Vec::new(),
    };
    let has_creds = resolved.is_ok();
    let connected = has_creds && record.as_ref().map(|r| r.connected).unwrap_or(false);
    Ok(IntegrationStatus {
        provider: provider.to_string(),
        connected,
        org_name: record.as_ref().and_then(|r| r.org_name.clone()),
        selected_team_id: record.as_ref().and_then(|r| r.selected_team_id.clone()),
        selected_team_name: record.as_ref().and_then(|r| r.selected_team_name.clone()),
        teams,
        last_synced_at: record.and_then(|r| r.last_synced_at),
    })
}
```

- [ ] **Step 3: Make `connect_integration` provider-aware**

```rust
#[tauri::command]
pub async fn connect_integration(
    app: AppHandle,
    provider: String,
    api_key: String,
) -> CmdResult<IntegrationStatus> {
    run_blocking(move || {
        match provider.as_str() {
            LINEAR_PROVIDER => {
                let key = api_key.trim().to_string();
                if key.is_empty() {
                    bail!("API key is empty");
                }
                credentials::store_api_key(&provider, &key)?;
            }
            GITHUB_PROVIDER => {
                // No API key — connection is the bundled gh auth. Validate it.
                integrations::github::default_login()?;
            }
            other => bail!("Unsupported integration provider: {other}"),
        }

        // Probe org + teams via the resolved provider (also validates creds).
        let org_teams = resolve_provider(&provider)?.org_and_teams()?;

        let existing = conns::load_connection(&provider)?;
        let selected_id = existing
            .and_then(|r| r.selected_team_id)
            .filter(|id| org_teams.teams.iter().any(|t| &t.id == id))
            .or_else(|| org_teams.teams.first().map(|t| t.id.clone()));
        let selected_name = selected_id.as_ref().and_then(|id| {
            org_teams.teams.iter().find(|t| &t.id == id).map(|t| t.name.clone())
        });

        conns::upsert_connection(&IntegrationConnectionRecord {
            provider: provider.clone(),
            connected: true,
            org_name: Some(org_teams.org_name.clone()),
            selected_team_id: selected_id,
            selected_team_name: selected_name,
            last_synced_at: None,
        })?;
        ui_sync::publish(&app, UiMutationEvent::IntegrationConnectionChanged { provider: provider.clone() });
        build_status(&provider, Some(org_teams.teams))
    })
    .await
}
```

- [ ] **Step 4: Update `disconnect_integration` and `get_integration_status`**

`disconnect_integration`: drop `ensure_supported`; keep `credentials::clear_api_key` (harmless no-op for GitHub) + `conns::clear_connection`. `get_integration_status`: drop `ensure_supported`, just `build_status(&provider, None)`.

- [ ] **Step 5: Replace the list/sync/update/create bodies with trait calls**

Rewrite the metadata + mirror commands to use `resolve_provider`. Examples:

```rust
#[tauri::command]
pub async fn list_task_statuses(provider: String, team_id: Option<String>) -> CmdResult<Vec<TaskStatus>> {
    run_blocking(move || {
        let team = selected_team(&provider, team_id)?;
        resolve_provider(&provider)?.list_states(&team)
    })
    .await
}
```

Apply the same shape to `list_task_projects` (→ `list_projects`), `list_task_labels` (→ `list_labels`), `list_task_assignees` (→ `list_members`).

`sync_tasks`:

```rust
#[tauri::command]
pub async fn sync_tasks(app: AppHandle, provider: String, team_id: Option<String>) -> CmdResult<usize> {
    run_blocking(move || {
        let team = selected_team(&provider, team_id)?;
        let mut issues = resolve_provider(&provider)?.list_issues(&team)?;
        let synced_at = db::current_timestamp()?;
        let count = issues.len();
        for issue in &mut issues {
            if issue.team_id.is_none() {
                issue.team_id = Some(team.clone());
            }
            tasks::upsert_task(issue, &synced_at)?;
        }
        conns::set_last_synced(&provider, &synced_at)?;
        ui_sync::publish(&app, UiMutationEvent::TasksChanged { provider: provider.clone() });
        ui_sync::publish(&app, UiMutationEvent::IntegrationConnectionChanged { provider });
        Ok(count)
    })
    .await
}
```

`update_task`:

```rust
let task = tasks::load_task(&task_id)?.with_context(|| format!("Task {task_id} not found"))?;
let issue_patch = IssuePatch {
    title: patch.title,
    description: patch.description,
    status_id: patch.status_id,
    priority: patch.priority,
    assignee_id: patch.assignee_id,
    label_ids: patch.label_ids,
};
let updated = resolve_provider(&task.provider)?.update_issue(&task.external_id, &issue_patch)?;
```

`create_task`:

```rust
let created = resolve_provider(&input.provider)?.create_issue(
    &input.team_id,
    &input.title,
    &NewIssue {
        description: input.description.as_deref(),
        priority: input.priority,
        status_id: input.status_id.as_deref(),
        assignee_id: input.assignee_id.as_deref(),
        project_id: input.project_id.as_deref(),
        label_ids: input.label_ids.as_deref(),
    },
)?;
```

Remove the now-unused `linear` import if nothing references it.

- [ ] **Step 6: Compile + run existing integration tests**

Run: `cd src-tauri && cargo build && cargo test integration_connections`
Expected: clean build; the `upsert_load_and_clear_round_trip` test still passes.

- [ ] **Step 7: Lint**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: zero warnings.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/integrations_commands.rs
git commit -m "refactor(integrations): route IPC commands through resolve_provider dispatch"
```

---

## PHASE 2 — GitHub task provider (backend)

Goal: implement the real `integrations/github/` client. Repos = teams; issues normalize into `ProviderTask` with the fixed Open/Done/Not planned status set; labels + assignees editable; create/update via GraphQL mutations; open/close/reopen for status.

### Task 5: GitHub client wrapper + expose `run_graphql`

**Files:**
- Modify: `src-tauri/src/forge/github/api.rs`
- Create: `src-tauri/src/integrations/github/client.rs`
- Modify: `src-tauri/src/integrations/github/mod.rs`

- [ ] **Step 1: Make `run_graphql` / `run_graphql_raw` crate-visible**

In `src-tauri/src/forge/github/api.rs`, change the visibility of `run_graphql` and `run_graphql_raw` from `pub(super)` to `pub(crate)`, and ensure `GraphqlOutcome` is `pub(crate)`. Verify `mod api;` in `forge/github/mod.rs` doesn't restrict re-export; add `pub(crate) use api::{run_graphql, run_graphql_raw, GraphqlOutcome};` to `forge/github/mod.rs` if those aren't already reachable as `crate::forge::github::run_graphql`.

- [ ] **Step 2: Create the client wrapper**

`src-tauri/src/integrations/github/client.rs`:

```rust
//! Thin GitHub GraphQL client for the integrations layer. Delegates transport
//! + auth to `forge::github` (bundled `gh`), so there's one GitHub auth path.

use anyhow::{bail, Result};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::forge::github::{run_graphql, run_graphql_raw, GraphqlOutcome};

pub struct GithubClient {
    login: String,
}

impl GithubClient {
    pub fn new(login: impl Into<String>) -> Self {
        Self { login: login.into() }
    }

    /// Run a typed query. Variables are string pairs (gh `-f key=value`).
    pub fn query<T: DeserializeOwned>(&self, query: &str, variables: &[(&str, &str)]) -> Result<T> {
        match run_graphql::<T>(&self.login, query, variables)? {
            GraphqlOutcome::Auth => {
                bail!("GitHub rejected the request — re-authenticate `gh` and try again")
            }
            GraphqlOutcome::Ok(value) => Ok(value),
        }
    }

    /// Run a mutation, returning raw JSON and surfacing GraphQL `errors`.
    pub fn mutate(&self, mutation: &str, variables: &[(&str, &str)]) -> Result<Value> {
        let value = match run_graphql_raw(&self.login, mutation, variables)? {
            GraphqlOutcome::Auth => {
                bail!("GitHub rejected the request — re-authenticate `gh` and try again")
            }
            GraphqlOutcome::Ok(value) => value,
        };
        if let Some(errors) = value.get("errors").and_then(|v| v.as_array()) {
            if !errors.is_empty() {
                let msgs: Vec<&str> = errors
                    .iter()
                    .filter_map(|e| e.get("message").and_then(|m| m.as_str()))
                    .collect();
                bail!("GitHub GraphQL error: {}", msgs.join("; "));
            }
        }
        Ok(value)
    }
}
```

- [ ] **Step 3: Add `pub mod client;` to `integrations/github/mod.rs`**

Add `pub mod client;` next to `pub mod auth;`.

- [ ] **Step 4: Compile**

Run: `cd src-tauri && cargo build`
Expected: clean build (client is unused until Task 7 — temporary; do not add `#[allow]`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/forge/github/api.rs src-tauri/src/forge/github/mod.rs src-tauri/src/integrations/github/client.rs src-tauri/src/integrations/github/mod.rs
git commit -m "feat(integrations/github): GraphQL client wrapper over forge gh auth"
```

### Task 6: GitHub status mapping (TDD)

The fixed three-state model + the open/closed→status mapping is pure logic — test it directly.

**Files:**
- Create: `src-tauri/src/integrations/github/map.rs`
- Modify: `src-tauri/src/integrations/github/mod.rs` (add `pub mod map;`)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/integrations/github/map.rs`:

```rust
//! GitHub issue JSON → normalized `ProviderTask`, plus the fixed status set.

use crate::integrations::provider::{
    TaskAssignee, TaskLabel, TaskPriority, TaskStatus, TaskStatusKind,
};

/// Stable ids for GitHub's synthetic statuses (used as `status_id` for write-back).
pub const STATUS_OPEN: &str = "github:open";
pub const STATUS_DONE: &str = "github:done";
pub const STATUS_NOT_PLANNED: &str = "github:not_planned";

/// The three fixed board columns for GitHub repo issues.
pub fn fixed_statuses() -> Vec<TaskStatus> {
    vec![
        TaskStatus { id: STATUS_OPEN.into(), name: "Open".into(), kind: TaskStatusKind::Unstarted, color: Some("#3fb950".into()) },
        TaskStatus { id: STATUS_DONE.into(), name: "Done".into(), kind: TaskStatusKind::Completed, color: Some("#8957e5".into()) },
        TaskStatus { id: STATUS_NOT_PLANNED.into(), name: "Not planned".into(), kind: TaskStatusKind::Canceled, color: Some("#6e7681".into()) },
    ]
}

/// Map GitHub `state` + `stateReason` to one of the fixed statuses.
pub fn status_for(state: &str, state_reason: Option<&str>) -> TaskStatus {
    let all = fixed_statuses();
    let id = match (state.to_ascii_uppercase().as_str(), state_reason.map(|r| r.to_ascii_uppercase())) {
        ("CLOSED", Some(r)) if r == "NOT_PLANNED" => STATUS_NOT_PLANNED,
        ("CLOSED", _) => STATUS_DONE,
        _ => STATUS_OPEN,
    };
    all.into_iter().find(|s| s.id == id).expect("fixed status exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_issue_maps_to_open_unstarted() {
        let s = status_for("OPEN", None);
        assert_eq!(s.id, STATUS_OPEN);
        assert_eq!(s.kind, TaskStatusKind::Unstarted);
    }

    #[test]
    fn closed_completed_maps_to_done() {
        let s = status_for("CLOSED", Some("COMPLETED"));
        assert_eq!(s.id, STATUS_DONE);
        assert_eq!(s.kind, TaskStatusKind::Completed);
    }

    #[test]
    fn closed_not_planned_maps_to_canceled() {
        let s = status_for("CLOSED", Some("NOT_PLANNED"));
        assert_eq!(s.id, STATUS_NOT_PLANNED);
        assert_eq!(s.kind, TaskStatusKind::Canceled);
    }

    #[test]
    fn fixed_statuses_count() {
        assert_eq!(fixed_statuses().len(), 3);
    }
}
```

Add `pub mod map;` to `integrations/github/mod.rs`.

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd src-tauri && cargo test integrations::github::map`
Expected: 4 tests PASS. (This logic is self-contained, so it passes immediately — that's fine; the test locks the mapping contract.)

- [ ] **Step 3: Add issue-node mapping + its test**

Append to `map.rs` (above `mod tests`):

```rust
/// A decoded GitHub issue search/list node. Field names match the GraphQL query.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueNode {
    pub id: String,
    pub number: i64,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    #[serde(default)]
    pub state_reason: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    pub repository: RepoRef,
    #[serde(default)]
    pub assignees: NodeList<AssigneeNode>,
    #[serde(default)]
    pub labels: NodeList<LabelNode>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    pub name_with_owner: String,
}

#[derive(Debug, Default, serde::Deserialize)]
pub struct NodeList<T> {
    #[serde(default = "Vec::new")]
    pub nodes: Vec<T>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssigneeNode {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub login: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LabelNode {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

/// Normalize a GitHub issue node into a `ProviderTask`.
pub fn map_issue(node: &IssueNode) -> crate::integrations::provider::ProviderTask {
    use crate::integrations::{provider::ProviderTask, GITHUB_PROVIDER};
    let assignee = node.assignees.nodes.first().map(|a| TaskAssignee {
        id: a.id.clone(),
        name: a.name.clone().unwrap_or_else(|| a.login.clone()),
        avatar_url: a.avatar_url.clone(),
    });
    let labels = node
        .labels
        .nodes
        .iter()
        .map(|l| TaskLabel {
            id: l.id.clone(),
            name: l.name.clone(),
            // GitHub colors are 6 hex digits with no leading '#'.
            color: l.color.as_ref().map(|c| format!("#{c}")),
        })
        .collect();
    ProviderTask {
        provider: GITHUB_PROVIDER.to_string(),
        external_id: node.id.clone(),
        identifier: format!("{}#{}", node.repository.name_with_owner, node.number),
        title: node.title.clone(),
        description: node.body.clone(),
        status: status_for(&node.state, node.state_reason.as_deref()),
        priority: TaskPriority::None,
        assignee,
        labels,
        project: None,
        url: node.url.clone(),
        team_id: Some(node.repository.name_with_owner.clone()),
        remote_updated_at: node.updated_at.clone(),
    }
}
```

Add to the `tests` module:

```rust
#[test]
fn map_issue_normalizes_fields() {
    let node = IssueNode {
        id: "I_1".into(),
        number: 42,
        title: "Fix the thing".into(),
        body: Some("details".into()),
        url: "https://github.com/acme/web/issues/42".into(),
        state: "OPEN".into(),
        state_reason: None,
        updated_at: Some("2026-06-21T00:00:00Z".into()),
        repository: RepoRef { name_with_owner: "acme/web".into() },
        assignees: NodeList { nodes: vec![AssigneeNode { id: "U_1".into(), name: Some("Ada".into()), login: "ada".into(), avatar_url: None }] },
        labels: NodeList { nodes: vec![LabelNode { id: "L_1".into(), name: "bug".into(), color: Some("d73a4a".into()) }] },
    };
    let task = map_issue(&node);
    assert_eq!(task.provider, "github");
    assert_eq!(task.identifier, "acme/web#42");
    assert_eq!(task.status.id, STATUS_OPEN);
    assert_eq!(task.priority, TaskPriority::None);
    assert_eq!(task.assignee.as_ref().unwrap().name, "Ada");
    assert_eq!(task.labels[0].color.as_deref(), Some("#d73a4a"));
    assert_eq!(task.team_id.as_deref(), Some("acme/web"));
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test integrations::github::map`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integrations/github/map.rs src-tauri/src/integrations/github/mod.rs
git commit -m "feat(integrations/github): issue->ProviderTask mapping + fixed status set (tested)"
```

### Task 7: GitHub queries + provider operations

**Files:**
- Create: `src-tauri/src/integrations/github/queries.rs`
- Modify: `src-tauri/src/integrations/github/mod.rs` (real `GithubProvider` impl)

- [ ] **Step 1: Write the query/mutation strings**

Create `src-tauri/src/integrations/github/queries.rs`:

```rust
//! GraphQL documents for the GitHub Issues provider.

/// Issue node fragment reused across list/detail/mutation responses.
pub const ISSUE_FIELDS: &str = r#"
  id number title body url state stateReason updatedAt
  repository { nameWithOwner }
  assignees(first: 10) { nodes { id name login avatarUrl } }
  labels(first: 50) { nodes { id name color } }
"#;

/// Viewer repositories the user can act on (affiliations cover owned + member).
pub const VIEWER_REPOSITORIES: &str = r#"
query ViewerRepos($after: String) {
  viewer {
    login
    repositories(first: 100, after: $after, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { id name nameWithOwner }
    }
  }
}
"#;

/// All issues for a repository, newest-updated first, paginated.
pub fn repo_issues(issue_fields: &str) -> String {
    format!(r#"
query RepoIssues($owner: String!, $name: String!, $after: String) {{
  repository(owner: $owner, name: $name) {{
    id
    issues(first: 50, after: $after, orderBy: {{ field: UPDATED_AT, direction: DESC }}) {{
      pageInfo {{ hasNextPage endCursor }}
      nodes {{ {issue_fields} }}
    }}
  }}
}}
"#)
}

/// Repository id + assignable users + labels for a repo (powers pickers + create).
pub const REPO_META: &str = r#"
query RepoMeta($owner: String!, $name: String!, $afterUsers: String, $afterLabels: String) {
  repository(owner: $owner, name: $name) {
    id
    assignableUsers(first: 100, after: $afterUsers) {
      pageInfo { hasNextPage endCursor }
      nodes { id name login avatarUrl }
    }
    labels(first: 100, after: $afterLabels) {
      pageInfo { hasNextPage endCursor }
      nodes { id name color }
    }
  }
}
"#;

pub const UPDATE_ISSUE: &str = r#"
mutation($id: ID!, $title: String, $body: String) {
  updateIssue(input: { id: $id, title: $title, body: $body }) { issue { id } }
}
"#;

pub const CLOSE_ISSUE: &str = r#"
mutation($id: ID!, $reason: IssueClosedStateReason!) {
  closeIssue(input: { issueId: $id, stateReason: $reason }) { issue { id } }
}
"#;

pub const REOPEN_ISSUE: &str = r#"
mutation($id: ID!) {
  reopenIssue(input: { issueId: $id }) { issue { id } }
}
"#;

pub const ADD_LABELS: &str = r#"
mutation($id: ID!, $labelIds: [ID!]!) {
  addLabelsToLabelable(input: { labelableId: $id, labelIds: $labelIds }) { clientMutationId }
}
"#;

pub const REMOVE_LABELS: &str = r#"
mutation($id: ID!, $labelIds: [ID!]!) {
  removeLabelsFromLabelable(input: { labelableId: $id, labelIds: $labelIds }) { clientMutationId }
}
"#;

/// Absolute assignee replacement (we model a single assignee).
pub const SET_ASSIGNEES: &str = r#"
mutation($id: ID!, $assigneeIds: [ID!]!) {
  updateIssue(input: { id: $id, assigneeIds: $assigneeIds }) { issue { id } }
}
"#;

pub const CREATE_ISSUE: &str = r#"
mutation($repositoryId: ID!, $title: String!, $body: String, $assigneeIds: [ID!], $labelIds: [ID!]) {
  createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body, assigneeIds: $assigneeIds, labelIds: $labelIds }) {
    issue { id }
  }
}
"#;

pub fn single_issue(issue_fields: &str) -> String {
    format!(r#"
query SingleIssue($id: ID!) {{
  node(id: $id) {{ ... on Issue {{ {issue_fields} }} }}
}}
"#)
}
```

Add `pub mod queries;` to `integrations/github/mod.rs`.

- [ ] **Step 2: Implement the real `GithubProvider`**

Replace the stubbed `impl TaskProvider for GithubProvider` block in `integrations/github/mod.rs` with the real implementation. Helper to split `owner/repo` and to label-fetch:

```rust
use crate::integrations::provider::{IntegrationTeam, TaskStatus};
use anyhow::{bail, Context};
use serde::Deserialize;
use serde_json::Value;

use self::client::GithubClient;

fn split_repo(team: &str) -> anyhow::Result<(&str, &str)> {
    team.split_once('/').context("Repository must be in owner/name form")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewerReposData {
    viewer: ViewerRepos,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewerRepos {
    login: String,
    repositories: map::NodeListPaged<RepoNode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoNode {
    id: String,
    name: String,
    name_with_owner: String,
}
```

Add `NodeListPaged` to `map.rs` (a paginated list helper):

```rust
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeListPaged<T> {
    #[serde(default = "Vec::new")]
    pub nodes: Vec<T>,
    #[serde(default)]
    pub page_info: PageInfo,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    #[serde(default)]
    pub has_next_page: bool,
    #[serde(default)]
    pub end_cursor: Option<String>,
}
```

Then the trait impl:

```rust
impl TaskProvider for GithubProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        let client = GithubClient::new(&self.login);
        let mut teams = Vec::new();
        let mut after: Option<String> = None;
        let mut login = self.login.clone();
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = Vec::new();
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let data: ViewerReposData = client.query(queries::VIEWER_REPOSITORIES, &vars)?;
            login = data.viewer.login.clone();
            for node in &data.viewer.repositories.nodes {
                teams.push(IntegrationTeam {
                    id: node.name_with_owner.clone(),
                    key: node.name.clone(),
                    name: node.name_with_owner.clone(),
                });
            }
            if data.viewer.repositories.page_info.has_next_page {
                after = data.viewer.repositories.page_info.end_cursor.clone();
                if after.is_none() { break; }
            } else {
                break;
            }
        }
        teams.sort_by_key(|t| t.name.to_lowercase());
        Ok(OrgTeams { org_name: login, teams })
    }

    fn list_states(&self, _team: &str) -> Result<Vec<TaskStatus>> {
        Ok(map::fixed_statuses())
    }

    fn list_projects(&self, _team: &str) -> Result<Vec<TaskProject>> {
        Ok(Vec::new())
    }

    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let data: Value = client.query(queries::REPO_META, &[("owner", owner), ("name", name)])?;
        let labels = data["repository"]["labels"]["nodes"].as_array().cloned().unwrap_or_default();
        let mut out: Vec<TaskLabel> = labels
            .iter()
            .filter_map(|l| Some(TaskLabel {
                id: l["id"].as_str()?.to_string(),
                name: l["name"].as_str()?.to_string(),
                color: l["color"].as_str().map(|c| format!("#{c}")),
            }))
            .collect();
        out.sort_by_key(|l| l.name.to_lowercase());
        Ok(out)
    }

    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let data: Value = client.query(queries::REPO_META, &[("owner", owner), ("name", name)])?;
        let users = data["repository"]["assignableUsers"]["nodes"].as_array().cloned().unwrap_or_default();
        let mut out: Vec<TaskAssignee> = users
            .iter()
            .filter_map(|u| {
                let login = u["login"].as_str()?.to_string();
                Some(TaskAssignee {
                    id: u["id"].as_str()?.to_string(),
                    name: u["name"].as_str().map(|s| s.to_string()).unwrap_or(login),
                    avatar_url: u["avatarUrl"].as_str().map(|s| s.to_string()),
                })
            })
            .collect();
        out.sort_by_key(|m| m.name.to_lowercase());
        Ok(out)
    }

    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let query = queries::repo_issues(queries::ISSUE_FIELDS);
        let mut all = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("owner", owner), ("name", name)];
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let data: Value = client.query(&query, &vars)?;
            let issues = &data["repository"]["issues"];
            if let Some(nodes) = issues["nodes"].as_array() {
                for raw in nodes {
                    let node: map::IssueNode = serde_json::from_value(raw.clone())
                        .context("Failed to decode GitHub issue node")?;
                    all.push(map::map_issue(&node));
                }
            }
            if issues["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false) {
                after = issues["pageInfo"]["endCursor"].as_str().map(|s| s.to_string());
                if after.is_none() { break; }
            } else {
                break;
            }
        }
        Ok(all)
    }

    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask> {
        if patch.is_empty() {
            bail!("No fields to update");
        }
        let client = GithubClient::new(&self.login);

        // Title / body
        if patch.title.is_some() || patch.description.is_some() {
            let title = patch.title.clone().unwrap_or_default();
            let body = patch.description.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("id", external_id)];
            if patch.title.is_some() { vars.push(("title", title.as_str())); }
            if patch.description.is_some() { vars.push(("body", body.as_str())); }
            client.mutate(queries::UPDATE_ISSUE, &vars)?;
        }

        // Status -> open/close/reopen
        if let Some(status_id) = &patch.status_id {
            match status_id.as_str() {
                map::STATUS_DONE => { client.mutate(queries::CLOSE_ISSUE, &[("id", external_id), ("reason", "COMPLETED")])?; }
                map::STATUS_NOT_PLANNED => { client.mutate(queries::CLOSE_ISSUE, &[("id", external_id), ("reason", "NOT_PLANNED")])?; }
                map::STATUS_OPEN => { client.mutate(queries::REOPEN_ISSUE, &[("id", external_id)])?; }
                other => bail!("Unknown GitHub status id: {other}"),
            }
        }

        // Assignee (single; empty string = unassign)
        if let Some(assignee_id) = &patch.assignee_id {
            let ids = if assignee_id.is_empty() {
                "[]".to_string()
            } else {
                format!("[\"{assignee_id}\"]")
            };
            // assigneeIds is a list var; gh -f sends strings, so pass JSON via -F is
            // not available here — use a templated mutation instead.
            let mutation = format!(
                "mutation($id: ID!) {{ updateIssue(input: {{ id: $id, assigneeIds: {ids} }}) {{ issue {{ id }} }} }}"
            );
            client.mutate(&mutation, &[("id", external_id)])?;
        }

        // Labels (absolute set): GitHub has no single "replace" — remove all then add.
        if let Some(label_ids) = &patch.label_ids {
            let json_ids = serde_json::to_string(label_ids)?;
            let add = format!(
                "mutation($id: ID!) {{ addLabelsToLabelable(input: {{ labelableId: $id, labelIds: {json_ids} }}) {{ clientMutationId }} }}"
            );
            // Clear existing labels first by reading the issue, then add the new set.
            let current = self.get_issue(external_id)?;
            if let Some(task) = &current {
                if !task.labels.is_empty() {
                    let existing: Vec<String> = task.labels.iter().map(|l| l.id.clone()).collect();
                    let existing_json = serde_json::to_string(&existing)?;
                    let remove = format!(
                        "mutation($id: ID!) {{ removeLabelsFromLabelable(input: {{ labelableId: $id, labelIds: {existing_json} }}) {{ clientMutationId }} }}"
                    );
                    client.mutate(&remove, &[("id", external_id)])?;
                }
            }
            if !label_ids.is_empty() {
                client.mutate(&add, &[("id", external_id)])?;
            }
        }

        self.get_issue(external_id)?.context("Issue vanished after update")
    }

    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        // Resolve the repository node id.
        let meta: Value = client.query(queries::REPO_META, &[("owner", owner), ("name", name)])?;
        let repo_id = meta["repository"]["id"].as_str().context("Repository id missing")?.to_string();

        // Build a templated mutation so list args (assigneeIds/labelIds) inline cleanly.
        let assignees = match fields.assignee_id {
            Some(id) if !id.is_empty() => format!(", assigneeIds: [\"{id}\"]"),
            _ => String::new(),
        };
        let labels = match fields.label_ids {
            Some(ids) if !ids.is_empty() => format!(", labelIds: {}", serde_json::to_string(ids)?),
            _ => String::new(),
        };
        let body = fields.description.unwrap_or_default();
        let mutation = format!(
            "mutation($repositoryId: ID!, $title: String!, $body: String) {{ createIssue(input: {{ repositoryId: $repositoryId, title: $title, body: $body{assignees}{labels} }}) {{ issue {{ id }} }} }}"
        );
        let created = client.mutate(&mutation, &[("repositoryId", repo_id.as_str()), ("title", title), ("body", body)])?;
        let id = created["data"]["createIssue"]["issue"]["id"].as_str().context("Created issue id missing")?.to_string();
        self.get_issue(&id)?.context("Issue vanished after create")
    }
}

impl GithubProvider {
    fn get_issue(&self, external_id: &str) -> Result<Option<ProviderTask>> {
        let client = GithubClient::new(&self.login);
        let query = queries::single_issue(queries::ISSUE_FIELDS);
        let data: Value = client.query(&query, &[("id", external_id)])?;
        let node_json = data["node"].clone();
        if node_json.is_null() { return Ok(None); }
        let node: map::IssueNode = serde_json::from_value(node_json).context("Failed to decode issue")?;
        Ok(Some(map::map_issue(&node)))
    }
}
```

> **Implementation note for the worker:** `run_graphql` passes variables as `gh api graphql -f key=value`, which sends every value as a **string**. GraphQL list/ID-list inputs (`assigneeIds`, `labelIds`) can't be string-encoded that way, which is why those are inlined into the mutation document above rather than passed as variables. Scalar `ID!`/`String` values (`id`, `title`, `body`, `owner`, `name`, `after`) go through variables normally. If `forge::github::run_graphql` exposes an `-F` (typed field) path, prefer real variables; otherwise keep the inline approach. Verify by reading `run_graphql_command` in `forge/github/api.rs` before implementing.

- [ ] **Step 3: Compile + clippy**

Run: `cd src-tauri && cargo build && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 4: Run the github unit tests**

Run: `cd src-tauri && cargo test integrations::github`
Expected: the map tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integrations/github/
git commit -m "feat(integrations/github): repos-as-teams, issue list, labels/assignees, create/update via GraphQL"
```

### Task 8: Manual backend smoke test (no automated GitHub network test)

We don't add a live-network test. Verify via the Helmor CLI against a real repo.

- [ ] **Step 1: Build the app**

Run: `bun run build && cd src-tauri && cargo build`
Expected: clean.

- [ ] **Step 2: Smoke-test the GitHub provider through the running app**

With `bun run dev` running and `gh` authenticated, use the Tauri MCP bridge or the Helmor CLI to invoke `connect_integration` with `provider: "github"` and an empty `apiKey`, then `set_integration_team` to a real `owner/repo`, then `sync_tasks`. Confirm issues land in the mirror (`list_tasks`). Document the commands you ran in the PR description.
Expected: issues appear; statuses are Open/Done/Not planned.

- [ ] **Step 3: Commit (if any fixups were needed)**

```bash
git add -A && git commit -m "fix(integrations/github): smoke-test fixups"
```

---

## PHASE 3 — GitHub on the Tasks board (frontend)

Goal: enable the GitHub tab, drive the board off the selected provider, gate priority/project UI for GitHub, and add a Settings card for gh-auth + repo selection.

### Task 9: Extend the `IntegrationProvider` type

**Files:**
- Modify: `src/lib/api.ts:5457`

- [ ] **Step 1: Widen the union**

Change:

```typescript
export type IntegrationProvider = "linear";
```

to:

```typescript
export type IntegrationProvider = "linear" | "github";
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: `provider-tab-bar.tsx`'s `"github" as IntegrationProvider` cast is now redundant but still compiles. Fix it in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(tasks): add github to IntegrationProvider type"
```

### Task 10: Enable the GitHub provider tab

**Files:**
- Modify: `src/features/tasks/components/provider-tab-bar.tsx:28-32`

- [ ] **Step 1: Flip the GitHub tab to enabled**

Replace the GitHub entry:

```tsx
{
    id: "github",
    label: "GitHub Issues",
    icon: <GithubBrandIcon size={15} />,
    enabled: true,
},
```

(Drop the `as IntegrationProvider` cast — the union now includes it. Leave ClickUp disabled with its cast.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/tasks/components/provider-tab-bar.tsx
git commit -m "feat(tasks): enable the GitHub Issues provider tab"
```

### Task 11: Drive the board off selected-provider state

**Files:**
- Modify: `src/features/tasks/container.tsx`

- [ ] **Step 1: Replace the hard-coded provider with persisted state**

Near the top of `TasksContainer`, replace:

```tsx
const provider: IntegrationProvider = "linear";
```

with:

```tsx
const [provider, setProvider] = useState<IntegrationProvider>(loadProvider);
```

Add a loader/saver next to `loadView` (top of file):

```tsx
const PROVIDER_STORAGE_KEY = "helmor-tasks-provider";

function loadProvider(): IntegrationProvider {
    try {
        return localStorage.getItem(PROVIDER_STORAGE_KEY) === "github"
            ? "github"
            : "linear";
    } catch {
        return "linear";
    }
}
```

- [ ] **Step 2: Wire the tab bar `onSelect`**

Replace the no-op `onSelect` on `<ProviderTabBar>` (lines ~261-263) with:

```tsx
onSelect={(next) => {
    setProvider(next);
    try {
        localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
        /* private mode — keep in-memory */
    }
    // Reset transient view state when switching providers.
    setSelectedTaskId(null);
    setFullTaskId(null);
    setHiddenColumns(new Set());
}}
```

- [ ] **Step 3: Relabel the team/repo indicator**

The header shows `status.selectedTeamName` (lines ~265-269). Leave as-is — for GitHub the connection's `selected_team_name` is the `owner/repo` string, which reads correctly. No change needed.

- [ ] **Step 4: Typecheck + run the existing container tests**

Run: `bun run typecheck && bun x vitest run src/features/tasks`
Expected: existing tests pass (they default to Linear; provider state defaults to "linear").

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/container.tsx
git commit -m "feat(tasks): drive board off selected-provider state (persisted)"
```

### Task 12: Gate priority/project facets for GitHub (TDD)

**Files:**
- Modify: `src/features/tasks/filters/facets.tsx:172-177`
- Create/Modify test: `src/features/tasks/filters/facets.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/tasks/filters/facets.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { facetsForProvider } from "./facets";

describe("facetsForProvider", () => {
    it("linear exposes project, assignee, priority, tags", () => {
        const ids = facetsForProvider("linear").map((f) => f.id);
        expect(ids).toEqual(["project", "assignee", "priority", "label"]);
    });

    it("github drops project and priority", () => {
        const ids = facetsForProvider("github").map((f) => f.id);
        expect(ids).toEqual(["assignee", "label"]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun x vitest run src/features/tasks/filters/facets.test.tsx`
Expected: FAIL — github currently returns all four facets (hits the `default` branch).

- [ ] **Step 3: Add the github branch**

In `facets.tsx`, change `facetsForProvider`:

```tsx
export function facetsForProvider(provider: IntegrationProvider): TaskFacet[] {
    switch (provider) {
        case "github":
            return [assigneeFacet, labelFacet];
        default:
            return [projectFacet, assigneeFacet, priorityFacet, labelFacet];
    }
}
```

- [ ] **Step 4: Run the test**

Run: `bun x vitest run src/features/tasks/filters/facets.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/filters/facets.tsx src/features/tasks/filters/facets.test.tsx
git commit -m "feat(tasks): drop project/priority facets for GitHub"
```

### Task 13: Hide priority/project editors in the detail view for GitHub

**Files:**
- Modify: `src/features/tasks/components/task-detail-view.tsx` (priority block ~139-143, project block ~150-155)

- [ ] **Step 1: Gate the priority editor**

Wrap the `<PrioritySelect ... />` (around lines 139-143) so it only renders for non-GitHub providers:

```tsx
{task.provider !== "github" ? (
    <PrioritySelect
        priority={task.priority}
        disabled={isUpdating}
        onChange={(priority) => onUpdate({ priority })}
    />
) : null}
```

- [ ] **Step 2: Gate the project badge**

Change the project badge condition (around lines 150-155) from `{task.project ? (` to:

```tsx
{task.provider !== "github" && task.project ? (
```

- [ ] **Step 3: Typecheck + run the detail-view tests**

Run: `bun run typecheck && bun x vitest run src/features/tasks/components/task-detail-view.test.tsx`
Expected: existing Linear tests still pass (they use `provider: "linear"`).

- [ ] **Step 4: Add a GitHub-gating test**

In `task-detail-view.test.tsx`, add a case rendering a task with `provider: "github"` and assert the priority control is absent (query by the priority control's role/label used in the existing tests — match the existing query pattern in that file). Run the test; expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/components/task-detail-view.tsx src/features/tasks/components/task-detail-view.test.tsx
git commit -m "feat(tasks): hide priority/project editors for GitHub in detail view"
```

### Task 14: Hide priority/project fields in the create dialog for GitHub

**Files:**
- Modify: `src/features/tasks/components/create-task-dialog.tsx` (priority ~192-195, project ~201-205)

- [ ] **Step 1: Gate both fields**

The dialog already receives `provider` as a prop (used in `createTask`). Wrap the `<PrioritySelect ... />` and `<ProjectSelect ... />` blocks:

```tsx
{provider !== "github" ? (
    <PrioritySelect
        priority={priority}
        onChange={(num) => setPriority(NUM_TO_PRIORITY[num] ?? "none")}
    />
) : null}
```

```tsx
{provider !== "github" ? (
    <ProjectSelect
        project={project}
        options={projectOptions}
        onChange={(id) => setProjectId(id || null)}
    />
) : null}
```

(`createTask` sends `priority: "none"`-equivalent and `projectId: null` for GitHub, which the backend ignores — `NewIssue.priority`/`project_id` are unused by the GitHub provider.)

- [ ] **Step 2: Typecheck + tests**

Run: `bun run typecheck && bun x vitest run src/features/tasks`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/tasks/components/create-task-dialog.tsx
git commit -m "feat(tasks): hide priority/project fields for GitHub in create dialog"
```

### Task 15: GitHub onboarding empty-state copy

The existing `TasksEmptyState` (rendered when `!connected`) is Linear-flavored. Make it provider-aware so GitHub users see "uses your GitHub login — pick a repository," with no API-key mention.

**Files:**
- Modify: `src/features/tasks/components/empty-state.tsx`
- Modify: `src/features/tasks/container.tsx` (pass `provider` to `<TasksEmptyState>`)

- [ ] **Step 1: Accept a `provider` prop in the empty state**

Add `provider: IntegrationProvider` to `TasksEmptyState`'s props and branch the copy: for `"github"`, show "Connect GitHub — Helmor uses your existing GitHub sign-in. Open Settings → Integrations to pick a repository." For Linear, keep the current copy. (Match the existing markup/structure in the file.)

- [ ] **Step 2: Pass the prop**

In `container.tsx`, change `<TasksEmptyState />` (line ~334) to `<TasksEmptyState provider={provider} />`.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/tasks/components/empty-state.tsx src/features/tasks/container.tsx
git commit -m "feat(tasks): provider-aware empty state (GitHub gh-auth onboarding copy)"
```

### Task 16: Settings → Integrations GitHub card

**Files:**
- Modify: `src/features/settings/panels/integrations.tsx`

- [ ] **Step 1: Add a `GitHubIntegrationCard`**

Following the existing `LinearIntegrationCard` pattern, add a `GitHubIntegrationCard` and render it inside `IntegrationsPanel` below the Linear card. Differences from Linear:
- No API-key input. Instead, a "Connect" button that calls `connectIntegration("github", "")` (empty key). If the call errors with the not-signed-in message, show that message and a hint to sign in to GitHub (the app's existing GitHub identity gate handles actual sign-in).
- When connected, render the repo selector from `status.teams` (each `team.name` is `owner/repo`); on change call `setIntegrationTeam("github", team.id, team.name)`.
- Reuse the existing refresh + disconnect + last-synced UI.

Use `getIntegrationStatus("github")` for the card's status query and the same query key (`helmorQueryKeys.integrationStatus("github")`).

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: clean (biome + clippy).

- [ ] **Step 3: Commit**

```bash
git add src/features/settings/panels/integrations.tsx
git commit -m "feat(settings): GitHub integration card (gh-auth + repo selector)"
```

### Task 17: Full verification + manual UI check

- [ ] **Step 1: Run the whole test suite**

Run: `bun run test`
Expected: frontend + sidecar + rust suites pass.

- [ ] **Step 2: Lint everything**

Run: `bun run lint`
Expected: biome clean + `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 3: Manual UI smoke (Tauri MCP)**

With `bun run dev`: open Settings → Integrations → connect GitHub → pick a repo. Open the Tasks screen, switch to the GitHub tab, Sync. Verify: issues render in Open/Done/Not planned columns; dragging a card open↔closed updates state; the detail view has no priority/project editors; "New task" creates a GitHub issue; "Ask agent to review" and "Start workspace" work. Switch back to the Linear tab and confirm Linear is unchanged.

- [ ] **Step 4: Confirm no stray files**

Run: `git status --short`
Expected: only intended changes; move any scratch into `.agent-contexts/`.

- [ ] **Step 5: Final commit (any fixups)**

```bash
git add -A && git commit -m "test(tasks): full-suite + lint pass for GitHub board integration"
```

---

## Self-Review

**Spec coverage (board-first scope = spec Phases 1–3):**
- Multi-provider core → Tasks 1–4. ✓
- Dedicated `integrations/github/` client over gh auth → Tasks 3, 5–7. ✓
- Repos-as-teams / per-repo selector → Task 7 (`org_and_teams`), Task 16 (repo selector UI). ✓
- Open/Done/Not planned status + write-back (close/reopen + reason) → Task 6 (mapping), Task 7 (`update_issue`). ✓
- Labels + single-assignee editable → Task 7. ✓
- Priority/project gating (facets, detail, create) → Tasks 12–14. ✓
- gh-auth connect (no API key) → Tasks 3 (`auth`), 4 (`connect_integration`), 15–16 (UI). ✓
- GitHub tab enabled + provider state → Tasks 10–11. ✓
- Agent-review / start-workspace / board / drag — provider-agnostic, unchanged (verified in Task 17). ✓
- Out of scope (Projects v2, GitHub priority, ClickUp, sidebar rebuild) — correctly excluded; sidebar is Phase 4 (separate plan). ✓

**Placeholder scan:** No TBD/TODO. Every code step shows concrete code. The one deliberate `bail!("…not available yet")` stub (Task 3) is intentional sequencing and is fully replaced in Task 7.

**Type consistency:** `TaskProvider` method names (`org_and_teams`, `list_states`, `list_projects`, `list_labels`, `list_members`, `list_issues`, `update_issue`, `create_issue`) are identical in the trait (Task 2), `LinearProvider` (Task 2), the GitHub stub (Task 3) and the real GitHub impl (Task 7). `resolve_provider` (Task 3) is consumed in every command (Task 4). Status id constants (`STATUS_OPEN`/`STATUS_DONE`/`STATUS_NOT_PLANNED`) defined in Task 6 are the exact strings matched in `update_issue` (Task 7). `IssuePatch::to_linear_input` rename is applied at its one call site (Task 1). `IntegrationProvider` union widened (Task 9) before its first new use (Tasks 10–16).

**Known verification points flagged inline for the worker:** (a) `ForgeAccount` field names in `default_login` (Task 3); (b) whether `forge::github::run_graphql` supports typed (`-F`) variables vs string-only (`-f`) — determines whether list-id mutation args can be real variables instead of inlined (Task 7 note); (c) the exact priority-control query selector in the detail-view test (Task 13).
