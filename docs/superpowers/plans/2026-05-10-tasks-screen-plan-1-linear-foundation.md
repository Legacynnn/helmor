# Tasks Screen — Plan 1: Linear Adapter Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the backend + settings UI foundation for Linear integration: schema migrations, a `forge/linear/` Rust module, auth commands, a list-teams command, and a Settings dialog panel for the personal API key. After this plan ships, a user can paste their Linear key, see their viewer name, and link a Linear team to a repo.

**Architecture:** Mirror the existing `src-tauri/src/forge/github/` module shape. Store the Linear API key in the existing key/value `settings` table under `linear.api_key`. Linear's HTTP API is a single GraphQL endpoint authenticated with the key sent verbatim as the `Authorization` header. Two schema migrations add the columns that later plans will use: `repos.linear_team_id` and `workspaces.linear_task_id`. The Settings UI follows the `CliInstallPanel` shape.

**Tech Stack:** Rust (`reqwest`, `serde`, `anyhow`), Tauri commands, React 19 + vitest, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-05-10-tasks-screen-design.md`

---

## File Structure

**Create:**
- `src-tauri/src/forge/linear/mod.rs` — public API + sub-module declarations
- `src-tauri/src/forge/linear/auth.rs` — get/set/clear API key + viewer query
- `src-tauri/src/forge/linear/client.rs` — thin reqwest GraphQL client (takes base URL for testability)
- `src-tauri/src/forge/linear/queries.rs` — `viewer`, `teams` GraphQL query bodies + response parsing
- `src-tauri/src/forge/linear/types.rs` — `LinearTeam`, `LinearViewer`, `LinearAuthStatus`, `LinearError`
- `src-tauri/src/commands/linear_commands.rs` — Tauri commands wrapping the module
- `src/features/settings/panels/linear.tsx` — Settings panel UI
- `src/features/settings/panels/linear.test.tsx` — vitest for the panel

**Modify:**
- `src-tauri/src/schema.rs` — add the two `ALTER TABLE` migrations in `run_migrations()`
- `src-tauri/src/forge/mod.rs` — `pub mod linear;`
- `src-tauri/src/commands/mod.rs` — `pub mod linear_commands;`
- `src-tauri/src/lib.rs` — register the new commands in the `invoke_handler!` macro
- `src/lib/api.ts` — typed `invoke()` wrappers + TS types
- `src/features/settings/index.tsx` — add `"linear"` to `SettingsSection`, render the panel, add sidebar entry

---

## Task 1: Schema migrations

**Files:**
- Modify: `src-tauri/src/schema.rs` (add to `run_migrations()`, after the existing repos migrations around line 264)

- [ ] **Step 1: Add the two idempotent migrations**

Locate `run_migrations()` in `src-tauri/src/schema.rs` (starts at line 160). After the existing `repos.custom_prompt_review` migration block (ends ~line 263), insert:

```rust
    // Migration: repos.linear_team_id — links a repo to a Linear team for
    // the Tasks screen. NULL until the user maps one in the Tasks UI.
    let has_repos_table_for_linear: bool = connection
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'repos'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if has_repos_table_for_linear {
        let has_linear_team: bool = connection
            .prepare("SELECT 1 FROM pragma_table_info('repos') WHERE name = 'linear_team_id'")
            .and_then(|mut stmt| stmt.exists([]))
            .unwrap_or(false);
        if !has_linear_team {
            connection
                .execute_batch("ALTER TABLE repos ADD COLUMN linear_team_id TEXT")
                .context("Failed to add repos.linear_team_id column")?;
        }
    }

    // Migration: workspaces.linear_task_id — set when a workspace is created
    // from a Linear task, so the Tasks screen can find the existing workspace
    // for a given task on subsequent visits.
    let has_workspaces_table: bool = connection
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if has_workspaces_table {
        let has_linear_task: bool = connection
            .prepare("SELECT 1 FROM pragma_table_info('workspaces') WHERE name = 'linear_task_id'")
            .and_then(|mut stmt| stmt.exists([]))
            .unwrap_or(false);
        if !has_linear_task {
            connection
                .execute_batch("ALTER TABLE workspaces ADD COLUMN linear_task_id TEXT")
                .context("Failed to add workspaces.linear_task_id column")?;
        }
    }
```

- [ ] **Step 2: Also add the columns to the CREATE TABLE statements for fresh DBs**

In the same file, locate `SCHEMA_SQL` (starts line 634). Update:

`CREATE TABLE IF NOT EXISTS repos (...)` — add `linear_team_id TEXT,` before the `created_at` line.

`CREATE TABLE IF NOT EXISTS workspaces (...)` — add `linear_task_id TEXT,` before the `created_at` line.

- [ ] **Step 3: Run rust tests to ensure schema still compiles + applies cleanly**

```bash
cd src-tauri && cargo test --test pipeline_scenarios -- schema 2>&1 | head -40
```

Expected: no compilation errors. (No schema-specific test exists, but compilation + clippy are the safety net.)

- [ ] **Step 4: Clippy clean**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

Expected: pass with zero warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/schema.rs
git commit -m "feat(schema): add repos.linear_team_id and workspaces.linear_task_id"
```

---

## Task 2: Linear types module

**Files:**
- Create: `src-tauri/src/forge/linear/types.rs`
- Create: `src-tauri/src/forge/linear/mod.rs` (stub)
- Modify: `src-tauri/src/forge/mod.rs`

- [ ] **Step 1: Add `pub mod linear;` to `src-tauri/src/forge/mod.rs`**

Find the `pub mod github;` line in `src-tauri/src/forge/mod.rs` and add `pub mod linear;` directly below it.

- [ ] **Step 2: Create the module stub `src-tauri/src/forge/linear/mod.rs`**

```rust
//! Linear backend. Mirrors the layout of `forge::github`, but talks to a
//! single GraphQL endpoint (`https://api.linear.app/graphql`) using a
//! Personal API Key stored in the `settings` table under `linear.api_key`.
//!
//! Public surface:
//! - `auth::{get_api_key, set_api_key, clear_api_key, get_auth_status}`
//! - `queries::list_teams`

pub mod auth;
pub mod client;
pub mod queries;
pub mod types;
```

- [ ] **Step 3: Create `src-tauri/src/forge/linear/types.rs`**

```rust
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearViewer {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTeam {
    pub id: String,
    pub key: String,
    pub name: String,
}

/// Result of probing the stored API key. Frontend uses `connected` to
/// decide whether to show the "Connect Linear" CTA or the connected state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearAuthStatus {
    pub connected: bool,
    pub viewer: Option<LinearViewer>,
}

#[derive(Debug, Error)]
pub enum LinearError {
    #[error("Linear API key not configured")]
    NoApiKey,
    #[error("Linear API key is invalid or revoked")]
    Unauthorized,
    #[error("Linear API returned errors: {0}")]
    GraphQl(String),
    #[error("Network error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("Failed to parse Linear response: {0}")]
    Parse(String),
}
```

- [ ] **Step 4: Confirm the codebase already depends on `thiserror`. If not, add it.**

Run:
```bash
grep -q "thiserror" src-tauri/Cargo.toml && echo "ok" || echo "missing"
```

If `missing`, add `thiserror = "1"` to `[dependencies]` in `src-tauri/Cargo.toml`.

- [ ] **Step 5: Compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
```

Expected: clean compile.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/forge/linear/ src-tauri/src/forge/mod.rs src-tauri/Cargo.toml
git commit -m "feat(linear): add types module and forge submodule scaffold"
```

---

## Task 3: Linear GraphQL client (parser-tested)

The client is split into transport (`client.rs`) and request bodies (`queries.rs`) so we can unit-test the response parsers without spinning up an HTTP mock server. Transport gets exercised manually when the Settings UI is wired up.

**Files:**
- Create: `src-tauri/src/forge/linear/client.rs`

- [ ] **Step 1: Create `src-tauri/src/forge/linear/client.rs`**

```rust
use anyhow::Result;
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::types::LinearError;

pub const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

/// Send a GraphQL request and deserialize the `data` field into `T`.
///
/// `base_url` is parameterised so tests can point at a mock server. In
/// production, callers pass [`LINEAR_API_URL`].
pub async fn graphql<T: DeserializeOwned>(
    base_url: &str,
    api_key: &str,
    query: &str,
    variables: Value,
) -> Result<T, LinearError> {
    let client = reqwest::Client::new();
    let response = client
        .post(base_url)
        .header("Authorization", api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "query": query,
            "variables": variables,
        }))
        .send()
        .await?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| LinearError::Parse(format!("response not JSON: {e}")))?;

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(LinearError::Unauthorized);
    }

    if let Some(errors) = body.get("errors") {
        return Err(LinearError::GraphQl(errors.to_string()));
    }

    let data = body
        .get("data")
        .ok_or_else(|| LinearError::Parse("missing 'data' field".into()))?
        .clone();

    serde_json::from_value(data)
        .map_err(|e| LinearError::Parse(format!("decode data: {e}")))
}
```

- [ ] **Step 2: Compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/forge/linear/client.rs
git commit -m "feat(linear): add thin GraphQL client"
```

---

## Task 4: `viewer` and `teams` queries (TDD on the response parser)

**Files:**
- Create: `src-tauri/src/forge/linear/queries.rs`

- [ ] **Step 1: Write the failing test first**

Create `src-tauri/src/forge/linear/queries.rs` with the test module only:

```rust
use anyhow::Result;
use serde::Deserialize;
use serde_json::{json, Value};

use super::client::{graphql, LINEAR_API_URL};
use super::types::{LinearError, LinearTeam, LinearViewer};

pub const VIEWER_QUERY: &str = r#"query Viewer { viewer { id name email } }"#;

pub const TEAMS_QUERY: &str = r#"
query Teams { teams(first: 100) { nodes { id key name } } }
"#;

#[derive(Debug, Deserialize)]
struct ViewerEnvelope {
    viewer: LinearViewer,
}

#[derive(Debug, Deserialize)]
struct TeamsEnvelope {
    teams: TeamsConnection,
}

#[derive(Debug, Deserialize)]
struct TeamsConnection {
    nodes: Vec<LinearTeam>,
}

pub fn parse_viewer(data: Value) -> Result<LinearViewer, LinearError> {
    serde_json::from_value::<ViewerEnvelope>(data)
        .map(|e| e.viewer)
        .map_err(|e| LinearError::Parse(format!("viewer: {e}")))
}

pub fn parse_teams(data: Value) -> Result<Vec<LinearTeam>, LinearError> {
    serde_json::from_value::<TeamsEnvelope>(data)
        .map(|e| e.teams.nodes)
        .map_err(|e| LinearError::Parse(format!("teams: {e}")))
}

pub async fn fetch_viewer(api_key: &str) -> Result<LinearViewer, LinearError> {
    let data: Value = graphql(LINEAR_API_URL, api_key, VIEWER_QUERY, json!({})).await?;
    parse_viewer(data)
}

pub async fn fetch_teams(api_key: &str) -> Result<Vec<LinearTeam>, LinearError> {
    let data: Value = graphql(LINEAR_API_URL, api_key, TEAMS_QUERY, json!({})).await?;
    parse_teams(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_viewer_response() {
        let data = json!({
            "viewer": { "id": "u1", "name": "Dan", "email": "dan@example.com" }
        });
        let viewer = parse_viewer(data).expect("parse");
        assert_eq!(viewer.id, "u1");
        assert_eq!(viewer.name, "Dan");
        assert_eq!(viewer.email, "dan@example.com");
    }

    #[test]
    fn parses_teams_response() {
        let data = json!({
            "teams": {
                "nodes": [
                    { "id": "t1", "key": "SUPER", "name": "Superset" },
                    { "id": "t2", "key": "HELM",  "name": "Helmor"   }
                ]
            }
        });
        let teams = parse_teams(data).expect("parse");
        assert_eq!(teams.len(), 2);
        assert_eq!(teams[0].key, "SUPER");
        assert_eq!(teams[1].name, "Helmor");
    }

    #[test]
    fn viewer_parse_error_is_typed() {
        let data = json!({ "viewer": { "id": "u1" } }); // missing name/email
        let err = parse_viewer(data).expect_err("should fail");
        assert!(matches!(err, LinearError::Parse(_)));
    }
}
```

- [ ] **Step 2: Run the tests — they should compile and pass**

```bash
cd src-tauri && cargo test --lib forge::linear::queries 2>&1 | tail -20
```

Expected: 3 passed.

- [ ] **Step 3: Clippy clean**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/linear/queries.rs
git commit -m "feat(linear): viewer and teams queries with parser tests"
```

---

## Task 5: Auth module — store/load API key + auth status

**Files:**
- Create: `src-tauri/src/forge/linear/auth.rs`

- [ ] **Step 1: Create `src-tauri/src/forge/linear/auth.rs`**

```rust
use anyhow::Result;

use crate::models::settings::{
    delete_setting_value, load_setting_value, upsert_setting_value,
};

use super::queries::fetch_viewer;
use super::types::{LinearAuthStatus, LinearError};

const KEY: &str = "linear.api_key";

pub fn get_api_key() -> Result<Option<String>> {
    load_setting_value(KEY)
}

pub fn set_api_key(value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return clear_api_key();
    }
    upsert_setting_value(KEY, trimmed)
}

pub fn clear_api_key() -> Result<()> {
    delete_setting_value(KEY)
}

/// Probe the stored key by calling Linear's `viewer` query.
/// - No key stored → `{ connected: false, viewer: None }`.
/// - Key stored + 401/403 → `{ connected: false, viewer: None }` and the
///   stored key is left in place (user can fix it in Settings).
/// - Key stored + viewer returned → `{ connected: true, viewer: Some(_) }`.
pub async fn get_auth_status() -> Result<LinearAuthStatus, LinearError> {
    let Some(key) = get_api_key().map_err(|e| LinearError::Parse(e.to_string()))? else {
        return Ok(LinearAuthStatus { connected: false, viewer: None });
    };
    match fetch_viewer(&key).await {
        Ok(viewer) => Ok(LinearAuthStatus { connected: true, viewer: Some(viewer) }),
        Err(LinearError::Unauthorized) => {
            Ok(LinearAuthStatus { connected: false, viewer: None })
        }
        Err(e) => Err(e),
    }
}
```

- [ ] **Step 2: Compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Clippy**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/forge/linear/auth.rs
git commit -m "feat(linear): auth helpers + get_auth_status probe"
```

---

## Task 6: Tauri commands

**Files:**
- Create: `src-tauri/src/commands/linear_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/linear_commands.rs`**

```rust
use crate::error::CmdResult;
use crate::forge::linear::{auth, queries};
use crate::forge::linear::types::{LinearAuthStatus, LinearTeam};
use crate::models;

#[tauri::command]
pub async fn linear_set_api_key(key: String) -> CmdResult<()> {
    tokio::task::spawn_blocking(move || auth::set_api_key(&key))
        .await
        .map_err(|e| anyhow::anyhow!(e))??;
    Ok(())
}

#[tauri::command]
pub async fn linear_clear_api_key() -> CmdResult<()> {
    tokio::task::spawn_blocking(auth::clear_api_key)
        .await
        .map_err(|e| anyhow::anyhow!(e))??;
    Ok(())
}

#[tauri::command]
pub async fn linear_get_auth_status() -> CmdResult<LinearAuthStatus> {
    Ok(auth::get_auth_status().await.map_err(|e| anyhow::anyhow!(e.to_string()))?)
}

#[tauri::command]
pub async fn linear_list_teams() -> CmdResult<Vec<LinearTeam>> {
    let key = tokio::task::spawn_blocking(auth::get_api_key)
        .await
        .map_err(|e| anyhow::anyhow!(e))??
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    Ok(queries::fetch_teams(&key)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()))?)
}

#[tauri::command]
pub async fn linear_set_repo_team(repo_id: String, team_id: Option<String>) -> CmdResult<()> {
    tokio::task::spawn_blocking(move || {
        models::repos::set_linear_team_id(&repo_id, team_id.as_deref())
    })
    .await
    .map_err(|e| anyhow::anyhow!(e))??;
    Ok(())
}
```

- [ ] **Step 2: Add the setter on the repos model**

Open `src-tauri/src/models/repos.rs`. Find any existing setter (e.g. `set_forge_login`) for the shape. Add:

```rust
pub fn set_linear_team_id(repo_id: &str, team_id: Option<&str>) -> Result<()> {
    let conn = open_connection()?;
    conn.execute(
        "UPDATE repos SET linear_team_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![team_id, repo_id],
    )
    .context("update repos.linear_team_id")?;
    Ok(())
}
```

If `open_connection` / imports differ in this file, match the existing helpers in `repos.rs`.

- [ ] **Step 3: Register the module**

In `src-tauri/src/commands/mod.rs`, add `pub mod linear_commands;` next to the other `pub mod` lines.

- [ ] **Step 4: Register the commands in `lib.rs`**

In `src-tauri/src/lib.rs`, find the `tauri::generate_handler![...]` block (around line 296). Add the five command names:

```rust
        crate::commands::linear_commands::linear_set_api_key,
        crate::commands::linear_commands::linear_clear_api_key,
        crate::commands::linear_commands::linear_get_auth_status,
        crate::commands::linear_commands::linear_list_teams,
        crate::commands::linear_commands::linear_set_repo_team,
```

(Place them alphabetically among the existing command paths, matching the style already in use.)

- [ ] **Step 5: Compile + clippy**

```bash
cd src-tauri && cargo check 2>&1 | tail -10 && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/linear_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/src/models/repos.rs
git commit -m "feat(linear): register Tauri commands for auth + teams"
```

---

## Task 7: Frontend API wrappers

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add TS types + invoke wrappers**

Open `src/lib/api.ts`. After an existing GitHub-related block (e.g. near `getCliStatus`), append:

```ts
export type LinearViewer = {
    id: string;
    name: string;
    email: string;
};

export type LinearTeam = {
    id: string;
    key: string;
    name: string;
};

export type LinearAuthStatus = {
    connected: boolean;
    viewer: LinearViewer | null;
};

export async function linearSetApiKey(key: string): Promise<void> {
    await invoke<void>("linear_set_api_key", { key });
}

export async function linearClearApiKey(): Promise<void> {
    await invoke<void>("linear_clear_api_key");
}

export async function linearGetAuthStatus(): Promise<LinearAuthStatus> {
    return await invoke<LinearAuthStatus>("linear_get_auth_status");
}

export async function linearListTeams(): Promise<LinearTeam[]> {
    return await invoke<LinearTeam[]>("linear_list_teams");
}

export async function linearSetRepoTeam(
    repoId: string,
    teamId: string | null,
): Promise<void> {
    await invoke<void>("linear_set_repo_team", { repoId, teamId });
}
```

If `invoke` is not already imported at the top of `api.ts`, it is — the file uses it throughout. Match existing camelCase argument naming (Tauri auto-converts `repoId` → `repo_id` only when serde uses `rename_all = "snake_case"`; this codebase uses `rename_all = "camelCase"` per CLAUDE.md, so pass camelCase from TS).

- [ ] **Step 2: Type check**

```bash
bun run typecheck 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(linear): frontend API wrappers"
```

---

## Task 8: Settings panel UI (TDD)

**Files:**
- Create: `src/features/settings/panels/linear.test.tsx`
- Create: `src/features/settings/panels/linear.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/panels/linear.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return {
        ...actual,
        linearGetAuthStatus: vi.fn(),
        linearSetApiKey: vi.fn(),
        linearClearApiKey: vi.fn(),
    };
});

import {
    linearClearApiKey,
    linearGetAuthStatus,
    linearSetApiKey,
} from "@/lib/api";
import { LinearPanel } from "./linear";

const mocks = {
    linearGetAuthStatus: linearGetAuthStatus as unknown as ReturnType<typeof vi.fn>,
    linearSetApiKey: linearSetApiKey as unknown as ReturnType<typeof vi.fn>,
    linearClearApiKey: linearClearApiKey as unknown as ReturnType<typeof vi.fn>,
};

describe("LinearPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows the disconnected state when no key is stored", async () => {
        mocks.linearGetAuthStatus.mockResolvedValue({ connected: false, viewer: null });
        render(<LinearPanel />);
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/lin_api_/i)).toBeInTheDocument(),
        );
        expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
    });

    it("shows the viewer name when connected", async () => {
        mocks.linearGetAuthStatus.mockResolvedValue({
            connected: true,
            viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
        });
        render(<LinearPanel />);
        await waitFor(() =>
            expect(screen.getByText(/Dan Melo/)).toBeInTheDocument(),
        );
        expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
    });

    it("saves a pasted key and re-probes auth", async () => {
        mocks.linearGetAuthStatus
            .mockResolvedValueOnce({ connected: false, viewer: null })
            .mockResolvedValueOnce({
                connected: true,
                viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
            });
        mocks.linearSetApiKey.mockResolvedValue(undefined);
        render(<LinearPanel />);
        const input = await screen.findByPlaceholderText(/lin_api_/i);
        await userEvent.type(input, "lin_api_xyz");
        await userEvent.click(screen.getByRole("button", { name: /connect/i }));
        await waitFor(() =>
            expect(mocks.linearSetApiKey).toHaveBeenCalledWith("lin_api_xyz"),
        );
        await waitFor(() => expect(screen.getByText(/Dan Melo/)).toBeInTheDocument());
    });

    it("clears the key on disconnect", async () => {
        mocks.linearGetAuthStatus
            .mockResolvedValueOnce({
                connected: true,
                viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
            })
            .mockResolvedValueOnce({ connected: false, viewer: null });
        mocks.linearClearApiKey.mockResolvedValue(undefined);
        render(<LinearPanel />);
        await screen.findByText(/Dan Melo/);
        await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
        await waitFor(() => expect(mocks.linearClearApiKey).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/lin_api_/i)).toBeInTheDocument(),
        );
    });
});
```

- [ ] **Step 2: Run the test — it should fail (no implementation yet)**

```bash
bun x vitest run src/features/settings/panels/linear.test.tsx 2>&1 | tail -20
```

Expected: failures referencing missing `./linear` import.

- [ ] **Step 3: Implement the panel**

Create `src/features/settings/panels/linear.tsx`:

```tsx
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    type LinearAuthStatus,
    linearClearApiKey,
    linearGetAuthStatus,
    linearSetApiKey,
} from "@/lib/api";
import {
    SettingsGroup,
    SettingsNotice,
    SettingsRow,
} from "../components/settings-row";

export function LinearPanel() {
    const [status, setStatus] = useState<LinearAuthStatus | null>(null);
    const [keyDraft, setKeyDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            const next = await linearGetAuthStatus();
            setStatus(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const handleConnect = useCallback(async () => {
        if (!keyDraft.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await linearSetApiKey(keyDraft.trim());
            setKeyDraft("");
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [keyDraft, reload]);

    const handleDisconnect = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await linearClearApiKey();
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [reload]);

    const connected = status?.connected === true;

    return (
        <SettingsGroup>
            <SettingsRow
                align="start"
                title="Linear"
                description={
                    connected ? (
                        <>
                            Connected as{" "}
                            <span className="font-medium">{status?.viewer?.name}</span>{" "}
                            ({status?.viewer?.email}).
                            {error ? (
                                <SettingsNotice tone="error">{error}</SettingsNotice>
                            ) : null}
                        </>
                    ) : (
                        <>
                            Paste a Personal API Key from{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                                linear.app/settings/account/security
                            </code>
                            . Stored locally on this device.
                            {error ? (
                                <SettingsNotice tone="error">{error}</SettingsNotice>
                            ) : null}
                        </>
                    )
                }
            >
                {connected ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnect}
                        disabled={busy}
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Disconnect
                    </Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <Input
                            type="password"
                            placeholder="lin_api_..."
                            value={keyDraft}
                            onChange={(e) => setKeyDraft(e.target.value)}
                            className="w-64"
                        />
                        <Button
                            size="sm"
                            onClick={handleConnect}
                            disabled={busy || !keyDraft.trim()}
                        >
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Connect
                        </Button>
                    </div>
                )}
            </SettingsRow>
        </SettingsGroup>
    );
}
```

- [ ] **Step 4: Run the test — expect green**

```bash
bun x vitest run src/features/settings/panels/linear.test.tsx 2>&1 | tail -20
```

Expected: 4 passed.

- [ ] **Step 5: Typecheck + biome**

```bash
bun run typecheck 2>&1 | tail -10 && bun x biome check src/features/settings/panels/linear.tsx src/features/settings/panels/linear.test.tsx 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/panels/linear.tsx src/features/settings/panels/linear.test.tsx
git commit -m "feat(settings): Linear API key panel"
```

---

## Task 9: Wire the panel into the Settings dialog

**Files:**
- Modify: `src/features/settings/index.tsx`

- [ ] **Step 1: Add `"linear"` to the `SettingsSection` union**

In `src/features/settings/index.tsx` line 132-143, extend:

```ts
export type SettingsSection =
    | "general"
    | "globalPreferences"
    | "shortcuts"
    | "appearance"
    | "model"
    | "experimental"
    | "import"
    | "developer"
    | "account"
    | "inbox"
    | "linear"
    | `repo:${string}`;
```

- [ ] **Step 2: Import the panel**

Near the other panel imports (around line 67), add:

```ts
import { LinearPanel } from "./panels/linear";
```

- [ ] **Step 3: Render the panel**

Find the existing `{activeSection === "account" && ...}` block (around line 759). Below it, add:

```tsx
{activeSection === "linear" && <LinearPanel />}
```

- [ ] **Step 4: Add the sidebar entry**

Locate the array of top-level sections that powers the sidebar in `index.tsx` (search for `"account"` near the SidebarMenu rendering — around line 300). Add `"linear"` to the same list so it appears as a sidebar item. Match the existing surrounding placement (e.g., insert after `"account"`).

- [ ] **Step 5: Typecheck + run all frontend tests**

```bash
bun run typecheck 2>&1 | tail -10 && bun run test:frontend 2>&1 | tail -20
```

Expected: clean type-check; all frontend tests pass.

- [ ] **Step 6: Manual smoke test**

```bash
bun run dev
```

In the running app: open Settings → Linear → paste a real Linear Personal API Key → click Connect → confirm viewer name appears. Click Disconnect → confirm it returns to the empty state.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/index.tsx
git commit -m "feat(settings): mount Linear panel in dialog"
```

---

## Task 10: Final pass

- [ ] **Step 1: Full lint + test sweep**

```bash
bun run lint 2>&1 | tail -20
bun run test 2>&1 | tail -30
```

Expected: clean lint, all three test targets pass.

- [ ] **Step 2: Confirm migrations applied on a fresh debug DB**

```bash
rm -rf ~/helmor-dev && bun run dev
```

Once the app boots, in another terminal:

```bash
sqlite3 ~/helmor-dev/helmor.db "PRAGMA table_info(repos);" | grep linear_team_id
sqlite3 ~/helmor-dev/helmor.db "PRAGMA table_info(workspaces);" | grep linear_task_id
```

Expected: both queries return a row.

- [ ] **Step 3: Done.** Plan 2 (Tasks screen core) is the next plan to write.
