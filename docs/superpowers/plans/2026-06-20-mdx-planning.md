# MDX Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental mode where plan-mode produces a rich, locally-rendered `.mdx` plan (stored gitignored under `.helmor/plans/`, shown as its own conversation tab with comment/handoff controls) instead of an inline in-thread plan.

**Architecture:** The `.mdx` file on disk is the single source of truth. Rust owns the file store (create/read/write, git-exclude, session→plan index, lifecycle status) and broadcasts changes via `UiMutationEvent`. The frontend renders the file by parsing MDX to an AST (`remark` + `remark-mdx`) and mapping an allowlist of components to existing Helmor UI; unknown components degrade gracefully and no agent-authored JS is ever evaluated. The plan opens as a new conversation tab kind with a toolbar (request changes / approve / handoff). Milestone B redirects plan-mode to author the file and wires the feedback + handoff loop reusing the existing plan-review submit plumbing.

**Tech Stack:** Rust (Tauri commands, `serde`, `anyhow`), React 19 + TypeScript, `remark`/`remark-mdx`/`unified` (new deps), `streamdown` (existing), existing UI kit (`CodeBlock`, `FileTree`, Mermaid), React Query, insta + vitest + bun test.

**Reference spec:** `docs/superpowers/specs/2026-06-20-mdx-planning-design.md`

---

## Decomposition

- **Milestone A — "See a plan"** (Tasks 1–9): toggle, Rust plan store + git-exclude + index, MDX renderer + v1 components, Plan conversation tab. Shippable on its own: create a `.mdx` by hand under `.helmor/plans/`, toggle on, see it rendered in a tab.
- **Milestone B — "Drive a plan"** (Tasks 10–14): plan-mode redirect so the agent authors the file, request-changes feedback loop, handoff to a fresh agent.

Each milestone ends in a working, testable state. Implement A fully before B.

## File Structure

**Rust (new):**
- `src-tauri/src/plans/mod.rs` — module root; re-exports.
- `src-tauri/src/plans/store.rs` — file IO (path resolution under `.helmor/plans/`, read/write/list), git-exclude, lifecycle status read/write via frontmatter.
- `src-tauri/src/plans/types.rs` — `PlanSummary`, `PlanLifecycle`, `PlanDoc` serde types (camelCase).
- `src-tauri/src/commands/plans.rs` — `#[tauri::command]` handlers (`create_plan`, `read_plan`, `write_plan`, `list_plans`, `set_plan_status`).
- `src-tauri/tests/plans_store.rs` — insta/unit coverage for store.

**Rust (modify):**
- `src-tauri/src/lib.rs` — register commands; startup backfill of git-exclude.
- `src-tauri/src/ui_sync/events.rs` — add `PlanFileChanged` variant.
- `src-tauri/src/commands/mod.rs` (or wherever command modules are declared) — `pub mod plans;`.

**Frontend (new):**
- `src/features/plan-viewer/mdx/parse.ts` — MDX string → block list (AST walk).
- `src/features/plan-viewer/mdx/registry.tsx` — allowlist component map.
- `src/features/plan-viewer/components/` — `risk-card.tsx`, `steps.tsx`, `file-map.tsx`, `open-questions.tsx`, `annotated-code.tsx`, `diagram.tsx`, `placeholder.tsx`.
- `src/features/plan-viewer/plan-view.tsx` — surface: toolbar + rendered blocks.
- `src/features/plan-viewer/index.tsx` — container (loads plan via query, owns toolbar actions).
- `src/features/plan-viewer/use-plan.ts` — React Query hooks for plan read/list/status.
- co-located `*.test.tsx` / `*.test.ts`.

**Frontend (modify):**
- `src/lib/settings.ts` — `mdxPlanningEnabled` flag.
- `src/features/settings/panels/dev-tools.tsx` — toggle UI.
- `src/lib/api.ts` — typed IPC wrappers + `UiMutationEvent` `planFileChanged` mirror + plan types.
- `src/lib/query-client.ts` — plan query keys.
- `src/shell/hooks/use-ui-sync-bridge.ts` — handle `planFileChanged`.
- `src/features/panel/header.tsx` — render Plan tab trigger.
- `src/features/panel/index.tsx` — render `PlanView` when the plan tab is active.
- `src/features/panel/container.tsx` + `thread-viewport.tsx` — pane model for the plan tab kind.

---

## MILESTONE A — "See a plan"

### Task 1: Experimental setting `mdxPlanningEnabled`

**Files:**
- Modify: `src/lib/settings.ts` (AppSettings type, DEFAULT_SETTINGS, SETTINGS_KEY_MAP, loadSettings, saveSettings)
- Test: `src/lib/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/settings.test.ts (add to existing suite, or create)
import { DEFAULT_SETTINGS, SETTINGS_KEY_MAP } from "./settings";

test("mdxPlanningEnabled defaults to false and maps to a db key", () => {
  expect(DEFAULT_SETTINGS.mdxPlanningEnabled).toBe(false);
  expect(SETTINGS_KEY_MAP.mdxPlanningEnabled).toBe("app.mdx_planning_enabled");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/lib/settings.test.ts`
Expected: FAIL — `mdxPlanningEnabled` is undefined.

- [ ] **Step 3: Add the field in all five spots**

In the `AppSettings` type (near line 281), add:
```ts
  mdxPlanningEnabled?: boolean;
```
In `DEFAULT_SETTINGS` (near line 427):
```ts
  mdxPlanningEnabled: false,
```
In `SETTINGS_KEY_MAP` (near line 624):
```ts
  mdxPlanningEnabled: "app.mdx_planning_enabled",
```
In `loadSettings()` parsing (near line 1460):
```ts
  mdxPlanningEnabled:
    raw[SETTINGS_KEY_MAP.mdxPlanningEnabled] === "true"
      ? true
      : DEFAULT_SETTINGS.mdxPlanningEnabled,
```
In `saveSettings()` boolean serialization path, ensure `mdxPlanningEnabled` is stringified the same way as the other boolean keys (follow the existing pattern in the `isJsonKey`/boolean branch around line 1531).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/lib/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat(settings): add mdxPlanningEnabled experimental flag"
```

### Task 2: Dev-tools toggle UI

**Files:**
- Modify: `src/features/settings/panels/dev-tools.tsx`
- Test: `src/features/settings/panels/dev-tools.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// dev-tools.test.tsx
import { render, screen } from "@testing-library/react";
import { DevToolsPanel } from "./dev-tools";

test("renders the MDX planning toggle", () => {
  render(<DevToolsPanel />); // wrap with the panel's required providers per existing tests
  expect(screen.getByText(/MDX planning/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/settings/panels/dev-tools.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 3: Add a `SettingsRow` + Switch bound to the setting**

Follow the existing toggle rows in this panel. Read `mdxPlanningEnabled` from the settings context and write it via the same update function other toggles use:
```tsx
<SettingsRow
  title="MDX planning (experimental)"
  description="Plan mode writes a rich .mdx plan to .helmor/plans/ and opens it as an interactive tab."
>
  <Switch
    checked={settings.mdxPlanningEnabled ?? false}
    onCheckedChange={(v) => updateSettings({ mdxPlanningEnabled: v })}
  />
</SettingsRow>
```
(Use the actual settings hook + `updateSettings` signature already used in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/settings/panels/dev-tools.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/panels/dev-tools.tsx src/features/settings/panels/dev-tools.test.tsx
git commit -m "feat(settings): add MDX planning toggle to dev tools"
```

### Task 3: Rust plan types

**Files:**
- Create: `src-tauri/src/plans/types.rs`, `src-tauri/src/plans/mod.rs`
- Test: in `src-tauri/tests/plans_store.rs` (created Task 5) — types exercised there.

- [ ] **Step 1: Write the types**

```rust
// src-tauri/src/plans/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlanLifecycle {
    Draft,
    Approved,
    HandedOff,
}

impl PlanLifecycle {
    pub fn as_str(self) -> &'static str {
        match self {
            PlanLifecycle::Draft => "draft",
            PlanLifecycle::Approved => "approved",
            PlanLifecycle::HandedOff => "handed-off",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub slug: String,
    pub title: String,
    pub status: PlanLifecycle,
    pub path: String, // workspace-relative, e.g. ".helmor/plans/foo.mdx"
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDoc {
    pub summary: PlanSummary,
    pub content: String, // raw .mdx
}
```

```rust
// src-tauri/src/plans/mod.rs
pub mod store;
pub mod types;
pub use types::{PlanDoc, PlanLifecycle, PlanSummary};
```

- [ ] **Step 2: Register module**

In `src-tauri/src/lib.rs`, add `mod plans;` alongside the other `mod` declarations.

- [ ] **Step 3: Build**

Run: `cd src-tauri && cargo build`
Expected: compiles (store referenced but created next task — if build fails on missing `store`, create an empty `store.rs` with `// placeholder` and proceed; Task 5 fills it).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/plans/mod.rs src-tauri/src/plans/types.rs src-tauri/src/lib.rs
git commit -m "feat(plans): add plan domain types"
```

### Task 4: Git-exclude helper for `.helmor/`

**Files:**
- Create: `src-tauri/src/plans/store.rs` (exclude portion)
- Test: `src-tauri/tests/plans_store.rs`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/plans_store.rs
use std::process::Command;

#[test]
fn ensure_excluded_adds_helmor_rule_to_git_exclude() {
    let tmp = tempfile::tempdir().unwrap();
    Command::new("git").arg("init").current_dir(tmp.path()).output().unwrap();

    helmor_lib::plans::store::ensure_excluded(tmp.path()).unwrap();

    let exclude = std::fs::read_to_string(tmp.path().join(".git/info/exclude")).unwrap();
    assert!(exclude.contains("/.helmor/"));

    // idempotent
    helmor_lib::plans::store::ensure_excluded(tmp.path()).unwrap();
    let exclude2 = std::fs::read_to_string(tmp.path().join(".git/info/exclude")).unwrap();
    assert_eq!(exclude2.matches("/.helmor/").count(), 1);
}
```
(Use the crate's actual test-facing name in place of `helmor_lib`; match how `agent_contexts` is exercised. `tempfile` is already a dev-dependency if `agent_contexts` tests use it — otherwise add it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test plans_store`
Expected: FAIL — `ensure_excluded` not found.

- [ ] **Step 3: Implement, mirroring `workspace/agent_contexts.rs`**

```rust
// src-tauri/src/plans/store.rs
use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;

const EXCLUDE_RULE: &str = "/.helmor/";
const EXCLUDE_COMMENT: &str = "# Helmor: local plan files (.helmor/plans)";

fn git_exclude_path(workspace_dir: &Path) -> Result<std::path::PathBuf> {
    // Works in linked worktrees, mirrors agent_contexts::resolve_git_exclude_path.
    let out = Command::new("git")
        .args(["rev-parse", "--git-path", "info/exclude"])
        .current_dir(workspace_dir)
        .output()
        .context("git rev-parse --git-path info/exclude")?;
    let rel = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let path = workspace_dir.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    Ok(path)
}

pub fn ensure_excluded(workspace_dir: &Path) -> Result<()> {
    let path = git_exclude_path(workspace_dir)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == EXCLUDE_RULE) {
        return Ok(());
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(EXCLUDE_COMMENT);
    next.push('\n');
    next.push_str(EXCLUDE_RULE);
    next.push('\n');
    std::fs::write(&path, next).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test --test plans_store`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/plans/store.rs src-tauri/tests/plans_store.rs
git commit -m "feat(plans): git-exclude .helmor/ via repo-local exclude"
```

### Task 5: Plan store IO (create/read/write/list + frontmatter status)

**Files:**
- Modify: `src-tauri/src/plans/store.rs`
- Test: `src-tauri/tests/plans_store.rs`

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn create_then_read_roundtrips_summary_and_content() {
    let tmp = tempfile::tempdir().unwrap();
    std::process::Command::new("git").arg("init").current_dir(tmp.path()).output().unwrap();
    use helmor_lib::plans::store;

    let summary = store::create_plan(tmp.path(), "my-feature", "My Feature").unwrap();
    assert_eq!(summary.slug, "my-feature");
    assert_eq!(summary.path, ".helmor/plans/my-feature.mdx");

    let doc = store::read_plan(tmp.path(), "my-feature").unwrap();
    assert_eq!(doc.summary.title, "My Feature");
    assert!(matches!(doc.summary.status, helmor_lib::plans::PlanLifecycle::Draft));
    assert!(doc.content.contains("title: \"My Feature\""));
}

#[test]
fn write_then_list_reflects_status_from_frontmatter() {
    let tmp = tempfile::tempdir().unwrap();
    std::process::Command::new("git").arg("init").current_dir(tmp.path()).output().unwrap();
    use helmor_lib::plans::store;

    store::create_plan(tmp.path(), "p1", "P1").unwrap();
    let new_body = "---\ntitle: \"P1\"\nstatus: approved\n---\n\n# P1\n\nbody\n";
    store::write_plan(tmp.path(), "p1", new_body).unwrap();

    let list = store::list_plans(tmp.path()).unwrap();
    assert_eq!(list.len(), 1);
    assert!(matches!(list[0].status, helmor_lib::plans::PlanLifecycle::Approved));
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test --test plans_store`
Expected: FAIL — functions missing.

- [ ] **Step 3: Implement store IO**

```rust
use crate::plans::types::{PlanDoc, PlanLifecycle, PlanSummary};

fn plans_dir(workspace_dir: &Path) -> std::path::PathBuf {
    workspace_dir.join(".helmor").join("plans")
}

fn parse_frontmatter(content: &str) -> (Option<String>, PlanLifecycle) {
    // Minimal YAML-ish frontmatter scan; only title + status are read.
    let mut title = None;
    let mut status = PlanLifecycle::Draft;
    if let Some(rest) = content.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            for line in rest[..end].lines() {
                let line = line.trim();
                if let Some(v) = line.strip_prefix("title:") {
                    title = Some(v.trim().trim_matches('"').to_string());
                } else if let Some(v) = line.strip_prefix("status:") {
                    status = match v.trim() {
                        "approved" => PlanLifecycle::Approved,
                        "handed-off" => PlanLifecycle::HandedOff,
                        _ => PlanLifecycle::Draft,
                    };
                }
            }
        }
    }
    (title, status)
}

fn summary_for(workspace_dir: &Path, slug: &str, content: &str) -> PlanSummary {
    let (title, status) = parse_frontmatter(content);
    PlanSummary {
        slug: slug.to_string(),
        title: title.unwrap_or_else(|| slug.to_string()),
        status,
        path: format!(".helmor/plans/{slug}.mdx"),
    }
}

pub fn create_plan(workspace_dir: &Path, slug: &str, title: &str) -> Result<PlanSummary> {
    ensure_excluded(workspace_dir)?;
    let dir = plans_dir(workspace_dir);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    let path = dir.join(format!("{slug}.mdx"));
    let content = format!(
        "---\ntitle: \"{title}\"\nstatus: draft\nsummary: \"\"\n---\n\n# {title}\n\n",
    );
    if !path.exists() {
        std::fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    }
    let on_disk = std::fs::read_to_string(&path)?;
    Ok(summary_for(workspace_dir, slug, &on_disk))
}

pub fn read_plan(workspace_dir: &Path, slug: &str) -> Result<PlanDoc> {
    let path = plans_dir(workspace_dir).join(format!("{slug}.mdx"));
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("read {}", path.display()))?;
    let summary = summary_for(workspace_dir, slug, &content);
    Ok(PlanDoc { summary, content })
}

pub fn write_plan(workspace_dir: &Path, slug: &str, content: &str) -> Result<PlanSummary> {
    let path = plans_dir(workspace_dir).join(format!("{slug}.mdx"));
    std::fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
    Ok(summary_for(workspace_dir, slug, content))
}

pub fn list_plans(workspace_dir: &Path) -> Result<Vec<PlanSummary>> {
    let dir = plans_dir(workspace_dir);
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("mdx") {
                if let Some(slug) = p.file_stem().and_then(|s| s.to_str()) {
                    let content = std::fs::read_to_string(&p).unwrap_or_default();
                    out.push(summary_for(workspace_dir, slug, &content));
                }
            }
        }
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

pub fn set_status(workspace_dir: &Path, slug: &str, status: PlanLifecycle) -> Result<PlanSummary> {
    let doc = read_plan(workspace_dir, slug)?;
    // Replace the status: line in frontmatter, else prepend frontmatter.
    let updated = if doc.content.starts_with("---\n") {
        replace_status_line(&doc.content, status)
    } else {
        format!("---\ntitle: \"{}\"\nstatus: {}\n---\n\n{}", doc.summary.title, status.as_str(), doc.content)
    };
    write_plan(workspace_dir, slug, &updated)
}

fn replace_status_line(content: &str, status: PlanLifecycle) -> String {
    let mut replaced = false;
    let out: Vec<String> = content
        .lines()
        .map(|l| {
            if !replaced && l.trim_start().starts_with("status:") {
                replaced = true;
                format!("status: {}", status.as_str())
            } else {
                l.to_string()
            }
        })
        .collect();
    let mut s = out.join("\n");
    if content.ends_with('\n') {
        s.push('\n');
    }
    s
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test --test plans_store`
Expected: PASS (both tests)

- [ ] **Step 5: Clippy + commit**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd .. && git add src-tauri/src/plans/store.rs src-tauri/tests/plans_store.rs
git commit -m "feat(plans): file store for create/read/write/list + frontmatter status"
```

### Task 6: Tauri commands + UiMutationEvent

**Files:**
- Create: `src-tauri/src/commands/plans.rs`
- Modify: `src-tauri/src/ui_sync/events.rs`, `src-tauri/src/lib.rs`, commands module declaration
- Test: covered by store tests + a frontend api test (Task 7); commands are thin wrappers.

- [ ] **Step 1: Add the event variant**

In `src-tauri/src/ui_sync/events.rs`, inside the `UiMutationEvent` enum:
```rust
    /// A plan file under `.helmor/plans/` was created or changed.
    PlanFileChanged {
        session_id: String,
        slug: String,
    },
```

- [ ] **Step 2: Write the command handlers**

```rust
// src-tauri/src/commands/plans.rs
use crate::error::CommandError;
use crate::plans::{store, PlanDoc, PlanLifecycle, PlanSummary};
use std::path::PathBuf;

// Resolve workspace dir from a session id using the existing service/db layer.
// Mirror how other commands resolve the workspace path for a session.
fn workspace_dir_for_session(session_id: &str) -> Result<PathBuf, CommandError> {
    crate::service::workspace_dir_for_session(session_id) // adapt to real helper
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn create_plan(
    session_id: String,
    slug: String,
    title: String,
) -> Result<PlanSummary, CommandError> {
    let dir = workspace_dir_for_session(&session_id)?;
    Ok(store::create_plan(&dir, &slug, &title)?)
}

#[tauri::command]
pub async fn read_plan(session_id: String, slug: String) -> Result<PlanDoc, CommandError> {
    let dir = workspace_dir_for_session(&session_id)?;
    Ok(store::read_plan(&dir, &slug)?)
}

#[tauri::command]
pub async fn list_plans(session_id: String) -> Result<Vec<PlanSummary>, CommandError> {
    let dir = workspace_dir_for_session(&session_id)?;
    Ok(store::list_plans(&dir)?)
}

#[tauri::command]
pub async fn write_plan(
    app: tauri::AppHandle,
    session_id: String,
    slug: String,
    content: String,
) -> Result<PlanSummary, CommandError> {
    let dir = workspace_dir_for_session(&session_id)?;
    let summary = store::write_plan(&dir, &slug, &content)?;
    crate::ui_sync::publish(&app, crate::ui_sync::events::UiMutationEvent::PlanFileChanged {
        session_id: session_id.clone(),
        slug: slug.clone(),
    });
    Ok(summary)
}

#[tauri::command]
pub async fn set_plan_status(
    app: tauri::AppHandle,
    session_id: String,
    slug: String,
    status: PlanLifecycle,
) -> Result<PlanSummary, CommandError> {
    let dir = workspace_dir_for_session(&session_id)?;
    let summary = store::set_status(&dir, &slug, status)?;
    crate::ui_sync::publish(&app, crate::ui_sync::events::UiMutationEvent::PlanFileChanged {
        session_id, slug,
    });
    Ok(summary)
}
```
(Adapt `workspace_dir_for_session` and `crate::ui_sync::publish` to the exact helpers in this codebase — see `commands/session.rs` for the session→workspace resolution pattern and `ui_sync` for the publish fn name.)

- [ ] **Step 3: Register commands + module**

Add `pub mod plans;` to the commands module file, and register each command in the `tauri::generate_handler![...]` list in `src-tauri/src/lib.rs`:
```rust
commands::plans::create_plan,
commands::plans::read_plan,
commands::plans::list_plans,
commands::plans::write_plan,
commands::plans::set_plan_status,
```

- [ ] **Step 4: Startup git-exclude backfill**

In `src-tauri/src/lib.rs` setup hook (near the existing `agent_contexts` backfill, ~line 307), call `plans::store::ensure_excluded` for each existing worktree (reuse the same iteration the agent-contexts backfill uses).

- [ ] **Step 5: Build + clippy + commit**

```bash
cd src-tauri && cargo build && cargo clippy --all-targets -- -D warnings
cd .. && git add src-tauri/src/commands/plans.rs src-tauri/src/ui_sync/events.rs src-tauri/src/lib.rs
git commit -m "feat(plans): tauri commands + PlanFileChanged event"
```

### Task 7: Frontend IPC bindings + query keys + ui-sync bridge

**Files:**
- Modify: `src/lib/api.ts`, `src/lib/query-client.ts`, `src/shell/hooks/use-ui-sync-bridge.ts`
- Create: `src/features/plan-viewer/use-plan.ts`
- Test: `src/features/plan-viewer/use-plan.test.ts`

- [ ] **Step 1: Add types + wrappers in `api.ts`**

```ts
export type PlanLifecycle = "draft" | "approved" | "handed-off";
export type PlanSummary = { slug: string; title: string; status: PlanLifecycle; path: string };
export type PlanDoc = { summary: PlanSummary; content: string };

export const createPlan = (sessionId: string, slug: string, title: string) =>
  invoke<PlanSummary>("create_plan", { sessionId, slug, title });
export const readPlan = (sessionId: string, slug: string) =>
  invoke<PlanDoc>("read_plan", { sessionId, slug });
export const listPlans = (sessionId: string) =>
  invoke<PlanSummary[]>("list_plans", { sessionId });
export const writePlan = (sessionId: string, slug: string, content: string) =>
  invoke<PlanSummary>("write_plan", { sessionId, slug, content });
export const setPlanStatus = (sessionId: string, slug: string, status: PlanLifecycle) =>
  invoke<PlanSummary>("set_plan_status", { sessionId, slug, status });
```
Add `planFileChanged` to the `UiMutationEvent` union mirror:
```ts
  | { type: "planFileChanged"; sessionId: string; slug: string }
```

- [ ] **Step 2: Query keys**

In `src/lib/query-client.ts` add:
```ts
  plan: (sessionId: string, slug: string) => ["plan", sessionId, slug] as const,
  planList: (sessionId: string) => ["plan-list", sessionId] as const,
```

- [ ] **Step 3: Handle the event**

In `src/shell/hooks/use-ui-sync-bridge.ts`:
```ts
    case "planFileChanged":
      void queryClient.invalidateQueries({ queryKey: ["plan", event.sessionId, event.slug] });
      void queryClient.invalidateQueries({ queryKey: ["plan-list", event.sessionId] });
      return;
```

- [ ] **Step 4: Hooks + failing test**

```ts
// src/features/plan-viewer/use-plan.ts
import { useQuery } from "@tanstack/react-query";
import { readPlan } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

export function usePlan(sessionId: string, slug: string) {
  return useQuery({
    queryKey: helmorQueryKeys.plan(sessionId, slug),
    queryFn: () => readPlan(sessionId, slug),
    enabled: !!sessionId && !!slug,
  });
}
```
```ts
// src/features/plan-viewer/use-plan.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { usePlan } from "./use-plan";
// mock @/lib/api readPlan to resolve a fixture; wrap in a QueryClientProvider.
test("usePlan loads the plan doc", async () => {
  // ...arrange mock + wrapper...
  const { result } = renderHook(() => usePlan("s1", "p1"), { wrapper });
  await waitFor(() => expect(result.current.data?.summary.slug).toBe("p1"));
});
```

- [ ] **Step 5: Run + commit**

Run: `bun x vitest run src/features/plan-viewer/use-plan.test.ts`
Expected: PASS
```bash
git add src/lib/api.ts src/lib/query-client.ts src/shell/hooks/use-ui-sync-bridge.ts src/features/plan-viewer/use-plan.ts src/features/plan-viewer/use-plan.test.ts
git commit -m "feat(plans): frontend IPC bindings, query keys, ui-sync handling"
```

### Task 8: MDX parser + component registry + v1 components

**Files:**
- Create: `src/features/plan-viewer/mdx/parse.ts`, `src/features/plan-viewer/mdx/registry.tsx`, components under `src/features/plan-viewer/components/`
- Test: `src/features/plan-viewer/mdx/parse.test.ts`
- Modify: root `package.json` (add `remark`, `remark-mdx`, `unified`, `unist-util-visit`)

- [ ] **Step 1: Add deps**

Run: `bun add remark remark-mdx unified unist-util-visit`

- [ ] **Step 2: Write the failing parser test**

```ts
// src/features/plan-viewer/mdx/parse.test.ts
import { parsePlanMdx } from "./parse";

test("splits frontmatter, prose, and known components into ordered blocks", () => {
  const mdx = [
    "---", 'title: "Demo"', "status: draft", "---", "",
    "Intro prose.", "",
    '<RiskCard severity="high">DB migration is irreversible</RiskCard>', "",
    "<Unknowny />",
  ].join("\n");

  const result = parsePlanMdx(mdx);
  expect(result.frontmatter.title).toBe("Demo");
  expect(result.frontmatter.status).toBe("draft");
  const kinds = result.blocks.map((b) => b.kind);
  expect(kinds).toContain("prose");
  expect(kinds).toContain("component");
  const risk = result.blocks.find((b) => b.kind === "component" && b.name === "RiskCard");
  expect(risk?.props.severity).toBe("high");
  const unknown = result.blocks.find((b) => b.kind === "component" && b.name === "Unknowny");
  expect(unknown).toBeTruthy(); // unknown still parsed; rendered as placeholder later
});
```

- [ ] **Step 3: Implement the parser**

```ts
// src/features/plan-viewer/mdx/parse.ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";

export type PlanBlock =
  | { kind: "prose"; id: string; markdown: string }
  | { kind: "component"; id: string; name: string; props: Record<string, string>; children: string };

export type ParsedPlan = {
  frontmatter: { title?: string; status?: string; summary?: string };
  blocks: PlanBlock[];
};

function parseFrontmatter(src: string): { fm: ParsedPlan["frontmatter"]; body: string } {
  if (!src.startsWith("---\n")) return { fm: {}, body: src };
  const end = src.indexOf("\n---", 4);
  if (end === -1) return { fm: {}, body: src };
  const block = src.slice(4, end);
  const fm: ParsedPlan["frontmatter"] = {};
  for (const line of block.split("\n")) {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const val = m[2].trim().replace(/^"|"$/g, "");
    if (m[1] === "title") fm.title = val;
    if (m[1] === "status") fm.status = val;
    if (m[1] === "summary") fm.summary = val;
  }
  const body = src.slice(end + 4).replace(/^\n+/, "");
  return { fm, body };
}

export function parsePlanMdx(src: string): ParsedPlan {
  const { fm, body } = parseFrontmatter(src);
  const tree = unified().use(remarkParse).use(remarkMdx).parse(body) as any;
  const blocks: PlanBlock[] = [];
  let i = 0;
  for (const node of tree.children ?? []) {
    if (node.type === "mdxJsxFlowElement") {
      const props: Record<string, string> = {};
      for (const attr of node.attributes ?? []) {
        if (attr.type === "mdxJsxAttribute" && typeof attr.value === "string") {
          props[attr.name] = attr.value;
        }
      }
      blocks.push({
        kind: "component",
        id: `b${i++}`,
        name: node.name ?? "Unknown",
        props,
        children: childText(body, node),
      });
    } else {
      const md = sliceNode(body, node);
      if (md.trim()) blocks.push({ kind: "prose", id: `b${i++}`, markdown: md });
    }
  }
  return { frontmatter: fm, blocks };
}

function sliceNode(src: string, node: any): string {
  if (node.position) return src.slice(node.position.start.offset, node.position.end.offset);
  return "";
}
function childText(src: string, node: any): string {
  const kids = node.children ?? [];
  if (!kids.length) return "";
  const start = kids[0].position?.start.offset ?? 0;
  const end = kids[kids.length - 1].position?.end.offset ?? 0;
  return src.slice(start, end);
}
```

- [ ] **Step 4: Run parser test**

Run: `bun x vitest run src/features/plan-viewer/mdx/parse.test.ts`
Expected: PASS

- [ ] **Step 5: Implement v1 components + registry**

Create each component (concrete, minimal, reusing existing kit). Example `RiskCard`:
```tsx
// src/features/plan-viewer/components/risk-card.tsx
import { AlertTriangle } from "lucide-react";
import { LazyStreamdown } from "@/components/streamdown-loader";

const TONE: Record<string, string> = {
  low: "border-emerald-500/40",
  medium: "border-amber-500/40",
  high: "border-red-500/50",
};

export function RiskCard({ severity = "medium", children }: { severity?: string; children: string }) {
  return (
    <div className={`my-3 rounded-md border ${TONE[severity] ?? TONE.medium} bg-app-base/40 p-3`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4" /> Risk · {severity}
      </div>
      <LazyStreamdown mode="static">{children}</LazyStreamdown>
    </div>
  );
}
```
Create `steps.tsx` (renders `<Step title=...>` children as an ordered list), `file-map.tsx` (parses a newline list of `create|modify|delete path` into the existing `FileTree`), `open-questions.tsx` (renders question lines with a "comment" affordance placeholder for Milestone B), `annotated-code.tsx` (wraps `CodeBlock` with a side note), `diagram.tsx` (passes a mermaid code string to the existing Mermaid renderer), and `placeholder.tsx`:
```tsx
// src/features/plan-viewer/components/placeholder.tsx
export function UnsupportedBlock({ name }: { name: string }) {
  return (
    <div className="my-2 rounded border border-dashed border-app-border px-3 py-2 text-xs text-app-muted-foreground">
      Unsupported plan block: <code>{name}</code>
    </div>
  );
}
```
Registry:
```tsx
// src/features/plan-viewer/mdx/registry.tsx
import { RiskCard } from "../components/risk-card";
import { Steps } from "../components/steps";
import { FileMap } from "../components/file-map";
import { OpenQuestions } from "../components/open-questions";
import { AnnotatedCode } from "../components/annotated-code";
import { Diagram } from "../components/diagram";

export const PLAN_COMPONENTS: Record<string, React.ComponentType<any>> = {
  RiskCard, Steps, FileMap, OpenQuestions, AnnotatedCode, Diagram,
};
```

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer package.json bun.lock
git commit -m "feat(plans): MDX AST parser, component registry, and v1 blocks"
```

### Task 9: Plan view surface + conversation tab integration

**Files:**
- Create: `src/features/plan-viewer/plan-view.tsx`, `src/features/plan-viewer/index.tsx`
- Modify: `src/features/panel/thread-viewport.tsx` (pane union), `src/features/panel/container.tsx` (pane build), `src/features/panel/header.tsx` (tab trigger), `src/features/panel/index.tsx` (content switch)
- Test: `src/features/plan-viewer/plan-view.test.tsx`

- [ ] **Step 1: Write the failing render test**

```tsx
// src/features/plan-viewer/plan-view.test.tsx
import { render, screen } from "@testing-library/react";
import { PlanView } from "./plan-view";

const MDX = '---\ntitle: "Demo"\nstatus: draft\n---\n\nHello.\n\n<RiskCard severity="high">danger</RiskCard>\n\n<Mystery />';

test("renders known blocks and a placeholder for unknown ones", () => {
  render(<PlanView content={MDX} status="draft" onRequestChanges={() => {}} onApprove={() => {}} onHandoff={() => {}} />);
  expect(screen.getByText(/Risk · high/)).toBeInTheDocument();
  expect(screen.getByText(/Unsupported plan block/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /handoff/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun x vitest run src/features/plan-viewer/plan-view.test.tsx`
Expected: FAIL — `PlanView` missing.

- [ ] **Step 3: Implement the surface**

```tsx
// src/features/plan-viewer/plan-view.tsx
import { useMemo } from "react";
import { parsePlanMdx } from "./mdx/parse";
import { PLAN_COMPONENTS } from "./mdx/registry";
import { UnsupportedBlock } from "./components/placeholder";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";

export function PlanView({
  content, status, onRequestChanges, onApprove, onHandoff,
}: {
  content: string;
  status: string;
  onRequestChanges: () => void;
  onApprove: () => void;
  onHandoff: () => void;
}) {
  const parsed = useMemo(() => parsePlanMdx(content), [content]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-app-border px-4 py-2">
        <span className="text-xs uppercase text-app-muted-foreground">Plan · {status}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={onRequestChanges}>Request changes</Button>
          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={onApprove}>Approve</Button>
          <Button size="sm" className="cursor-pointer" onClick={onHandoff}>Handoff</Button>
        </div>
      </div>
      <div className="conversation-markdown mx-auto w-full max-w-3xl overflow-y-auto px-6 py-6">
        {parsed.blocks.map((b) => {
          if (b.kind === "prose") {
            return <LazyStreamdown key={b.id} mode="static">{b.markdown}</LazyStreamdown>;
          }
          const Cmp = PLAN_COMPONENTS[b.name];
          if (!Cmp) return <UnsupportedBlock key={b.id} name={b.name} />;
          return <Cmp key={b.id} {...b.props}>{b.children}</Cmp>;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun x vitest run src/features/plan-viewer/plan-view.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the conversation tab**

In `thread-viewport.tsx`, widen the pane type to a discriminated union:
```ts
export type PlanPane = { kind: "plan"; sessionId: string; slug: string; presentationState: "presented" };
export type SessionPane = (PresentedSessionPane & { kind?: "session" }) | PlanPane;
```
In `container.tsx`, when `mdxPlanningEnabled` and the session has a plan (from `listPlans`), append a `PlanPane` to the panes array.
In `header.tsx`, render an extra `TabsTrigger` (value `__plan__:<slug>`) next to the context-preview tab, with a clipboard icon + plan title; route its selection through the existing `onValueChange` to a new `onSelectPlan(slug)` callback.
In `index.tsx`, extend the content switch: when the active pane `kind === "plan"`, render the `PlanViewContainer` (Task wiring) instead of `ActiveThreadViewport`.

- [ ] **Step 6: Container that binds data + actions**

```tsx
// src/features/plan-viewer/index.tsx
import { usePlan } from "./use-plan";
import { PlanView } from "./plan-view";
import { setPlanStatus } from "@/lib/api";

export function PlanViewContainer({
  sessionId, slug, onRequestChanges, onHandoff,
}: { sessionId: string; slug: string; onRequestChanges: () => void; onHandoff: () => void }) {
  const { data } = usePlan(sessionId, slug);
  if (!data) return null;
  return (
    <PlanView
      content={data.content}
      status={data.summary.status}
      onRequestChanges={onRequestChanges}
      onApprove={() => void setPlanStatus(sessionId, slug, "approved")}
      onHandoff={onHandoff}
    />
  );
}
```
(Milestone A leaves `onRequestChanges`/`onHandoff` as no-ops or simple stubs; Milestone B implements them.)

- [ ] **Step 7: Typecheck, lint, test, commit**

```bash
bun run typecheck && bun run lint && bun x vitest run src/features/plan-viewer
git add src/features/plan-viewer src/features/panel
git commit -m "feat(plans): plan view surface + conversation tab integration"
```

**Milestone A checkpoint:** With the toggle on, create `.helmor/plans/demo.mdx` by hand, open the workspace, and confirm a Plan tab appears and renders the blocks. This is a shippable slice.

---

## MILESTONE B — "Drive a plan"

### Task 10: Plan-mode authoring contract (system prompt)

**Files:**
- Modify: `src-tauri/src/agents/system_prompt.rs`
- Test: `src-tauri/tests/` snapshot of the built prompt when MDX planning is on.

- [ ] **Step 1: Write a failing prompt test**

Add a test that builds `build_helmor_system_prompt` with a context where `permission_mode == "plan"` and an `mdx_planning` flag is true, and asserts the prompt contains the MDX authoring instructions (the v1 component catalog + "write the plan to `.helmor/plans/<slug>.mdx`").

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test --test <prompt_test>`
Expected: FAIL — instructions absent.

- [ ] **Step 3: Thread the flag + inject instructions**

Add an `mdx_planning: bool` field to `HelmorSystemPromptContext`, populate it from the session settings where the context is built (trace from `streaming/params.rs`), and when `permission_mode == "plan" && mdx_planning`, append a block instructing the agent to author the plan as MDX using ONLY the v1 components (RiskCard, Steps/Step, FileMap, OpenQuestions, AnnotatedCode, Diagram, prose) and to write it via the `write_plan`-backed path to `.helmor/plans/<slug>.mdx`, then call `ExitPlanMode` referencing that path.

- [ ] **Step 4: Run to verify pass + accept snapshot**

Run: `cd src-tauri && INSTA_UPDATE=always cargo test --test <prompt_test>` then review.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agents/system_prompt.rs src-tauri/tests
git commit -m "feat(plans): inject MDX plan authoring contract in plan mode"
```

### Task 11: Surface the written plan as the plan tab (not inline)

**Files:**
- Modify: `src-tauri/src/agents/session_plan.rs` and/or `src-tauri/src/pipeline/` where `plan-review` is produced; `src/features/conversation/index.tsx` (auto-open behavior)
- Test: pipeline snapshot in `src-tauri/tests/pipeline_scenarios.rs`

- [ ] **Step 1: Write the failing snapshot test**

Add a scenario: an `ExitPlanMode` whose `planFilePath` points under `.helmor/plans/` and `mdx_planning` is on produces a `plan-review` part that carries the slug/path, and (separately) the front end opens the plan tab rather than rendering the full plan inline.

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test --test pipeline_scenarios -- <name>`
Expected: FAIL.

- [ ] **Step 3: Implement**

When the plan file path is under `.helmor/plans/`, keep the `plan-review` part lightweight (slug + path, no full inline markdown). On the frontend, in `conversation/index.tsx` where it currently auto-activates plan permission mode on `hasPlanReview`, also auto-select the plan tab for that slug when `mdxPlanningEnabled`.

- [ ] **Step 4: Accept snapshot + verify**

Run: `cd src-tauri && INSTA_UPDATE=always cargo test --test pipeline_scenarios -- <name>` then `cargo insta review`.
Expected: PASS, snapshot reflects lightweight part.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src src-tauri/tests src/features/conversation/index.tsx
git commit -m "feat(plans): route MDX plans to the plan tab instead of inline"
```

### Task 12: Request-changes → agent (block-anchored feedback)

**Files:**
- Modify: `src/features/plan-viewer/plan-view.tsx` (per-block comment affordance), `src/features/plan-viewer/index.tsx` (assemble + submit), reuse the conversation `onSubmit` from `conversation/index.tsx`
- Test: `src/features/plan-viewer/feedback.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
test("collecting block comments builds a structured prompt", () => {
  const { buildFeedbackPrompt } = require("./feedback");
  const prompt = buildFeedbackPrompt("demo", [
    { blockId: "b2", blockName: "RiskCard", comment: "this risk is wrong" },
  ]);
  expect(prompt).toContain(".helmor/plans/demo.mdx");
  expect(prompt).toContain("RiskCard");
  expect(prompt).toContain("this risk is wrong");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun x vitest run src/features/plan-viewer/feedback.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `feedback.ts` + wire affordance**

```ts
// src/features/plan-viewer/feedback.ts
export type BlockComment = { blockId: string; blockName: string; comment: string };

export function buildFeedbackPrompt(slug: string, comments: BlockComment[]): string {
  const lines = comments.map(
    (c) => `- [block ${c.blockId} · ${c.blockName}] ${c.comment}`,
  );
  return [
    `Revise the plan at .helmor/plans/${slug}.mdx based on this feedback.`,
    `Keep it as MDX using only the approved components. Apply targeted edits; do not rewrite unrelated sections.`,
    ``,
    ...lines,
  ].join("\n");
}
```
Add a small "comment" button per block in `PlanView` that collects `BlockComment`s into local state; the toolbar "Request changes" submits `buildFeedbackPrompt(...)` through the existing conversation `onSubmit` (passed down from `conversation/index.tsx`, the same submit used by `handlePlanRequestChanges`).

- [ ] **Step 4: Run to verify pass**

Run: `bun x vitest run src/features/plan-viewer/feedback.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer src/features/conversation/index.tsx
git commit -m "feat(plans): block-anchored request-changes feedback to agent"
```

### Task 13: Handoff to a fresh agent

**Files:**
- Modify: `src/features/plan-viewer/index.tsx` (handoff action), and the session-creation/launch path used elsewhere (trace from the existing "new session" action in the panel/sidebar)
- Test: `src/features/plan-viewer/handoff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("handoff prompt instructs the new agent to own the plan file", () => {
  const { buildHandoffPrompt } = require("./handoff");
  const p = buildHandoffPrompt("demo");
  expect(p).toContain(".helmor/plans/demo.mdx");
  expect(p).toMatch(/implement|keep .* updated/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun x vitest run src/features/plan-viewer/handoff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/plan-viewer/handoff.ts
export function buildHandoffPrompt(slug: string): string {
  return [
    `You are taking over an approved implementation plan at .helmor/plans/${slug}.mdx.`,
    `Read it first. Treat it as the living plan: implement it step by step and keep the file updated`,
    `(check off steps, record decisions) as you go.`,
  ].join(" ");
}
```
Wire `onHandoff` in `PlanViewContainer` to: (1) `setPlanStatus(sessionId, slug, "handed-off")`, (2) create a new session in the same workspace using the existing new-session API, and (3) seed its first prompt with `buildHandoffPrompt(slug)`. Reuse the existing session-launch helper (trace from the panel/sidebar "new session" handler).

- [ ] **Step 4: Run to verify pass**

Run: `bun x vitest run src/features/plan-viewer/handoff.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer
git commit -m "feat(plans): handoff approved plan to a fresh agent"
```

### Task 14: End-to-end verification + docs

**Files:**
- Modify: add a `.changeset/*.md`
- Verify: full suite

- [ ] **Step 1: Run the full suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all green.

- [ ] **Step 2: Manual smoke (debug build, Tauri MCP)**

Toggle on → start plan mode → confirm the agent writes `.helmor/plans/<slug>.mdx`, the Plan tab opens and renders, "Request changes" round-trips an edit, "Approve" flips status, "Handoff" spawns a session seeded with the plan path. Confirm `.helmor/` does not appear in `git status`.

- [ ] **Step 3: Changeset**

Create `.changeset/<name>.md`:
```md
---
"helmor": minor
---

Add experimental MDX planning: plan mode can write a rich .mdx plan to .helmor/plans/ and open it as an interactive conversation tab with request-changes and handoff controls.
```

- [ ] **Step 4: Commit**

```bash
git add .changeset
git commit -m "chore: changeset for MDX planning"
```

---

## Self-Review Notes

- **Spec coverage:** toggle (T1–2), file-based `.helmor/plans/` + gitignore (T4–5), AST-mapped no-eval rendering (T8–9), v1 catalog (T8), conversation-tab surface with controls (T9), plan-mode redirect (T10–11), request-changes loop (T12), handoff (T13). All spec sections map to tasks.
- **Adapt-to-codebase markers:** `workspace_dir_for_session`, `crate::ui_sync::publish`, the new-session launch helper, and the settings `updateSettings` signature are explicitly called out to be matched against real helpers during execution — they are the only non-determinable bindings and each names where to find the pattern.
- **Open items deferred to execution:** exact `TabsTrigger` value encoding for the plan tab and the precise pane-array insertion point in `container.tsx` (both grounded to specific files/lines in the spec's research).
```
