# Agent Control Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coding agent drive its own workspace's preview surface through ten scoped `preview_*` MCP tools, routed safely sidecar → Rust broker → `PreviewDriver` → browser content webview, with a visible "agent controlling" indicator and one-click kill switch.

**Architecture:** A new Rust `preview/` module defines a surface-agnostic `PreviewDriver` trait + a `broker::dispatch` that resolves the focused surface for a workspace (rejecting cross-workspace/no-surface calls with a structured `PreviewError`) and a `BrowserDriver` that fulfils each verb by talking to the existing browser content webview over a NEW correlated request/response bridge path. A sidecar in-process SDK MCP server (`preview-mcp.ts`, the first in this codebase) exposes the tools and forwards each call to Rust via the existing `callHost("preview.<verb>", …)` reverse channel; a new `sidecar_host` handler namespace `preview.` routes those to the broker. Control state + a banner UI live behind two new `UiMutationEvent` variants.

**Tech Stack:** Rust (Tauri v2, async_trait, serde, tokio oneshot, insta), Bun/TypeScript sidecar (@anthropic-ai/claude-agent-sdk `createSdkMcpServer`/`tool`, Zod), React 19, Vitest.

---

## Prerequisites & key existing symbols (read before starting)

- **Shared contracts (authoritative names/types):** `docs/superpowers/plans/browser-split-mode/00-shared-contracts.md`. Every identifier below comes from there.
- **PRD:** `docs/prd/browser-split-mode-and-agent-control.md` (Phase 2, §5.2, D3–D7).
- **Sidecar reverse channel (already exists):**
  - `sidecar/src/host-bridge.ts` — `callHost<T>(method, params, timeoutMs)` emits `{ type: "hostRequest", callbackId, method, params }` and resolves on `{ type: "hostResponse", callbackId, ok|error }`. `setHostWriter` wired at `sidecar/src/index.ts:102`.
  - Rust side: `src-tauri/src/sidecar.rs:673-695` routes any stdout line whose `type == "hostRequest"` to a dispatcher; `src-tauri/src/lib.rs:403-416` writes the `hostResponse` back. Handlers are **namespaced** in `src-tauri/src/sidecar_host/handlers/mod.rs::route` (currently only `triage.`). The triage handler `src-tauri/src/sidecar_host/handlers/triage.rs` is the pattern to copy (`#[derive(Deserialize)]` params → work → `Ok(serde_json::to_value(...)?)`).
- **MCP injection point:** `sidecar/src/claude-session-manager.ts:438-464` builds `query({ options: { …, ...(projectMcpServers ? { mcpServers: projectMcpServers } : {}) } })`. `mcpServers` is `Record<string, McpServerConfig>`; an in-process server (`McpSdkServerConfigWithInstance` from `createSdkMcpServer`) is a valid value, so we merge.
- **SDK API (confirmed in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`):**
  - `createSdkMcpServer(options: { name: string; version?: string; tools?: SdkMcpToolDefinition[] }): McpSdkServerConfigWithInstance` (line 485).
  - `tool(name: string, description: string, inputSchema: ZodRawShape, handler: (args, extra) => Promise<CallToolResult>): SdkMcpToolDefinition` (line 6297). `inputSchema` is a **Zod raw shape** (e.g. `{ url: z.string() }`).
- **Browser plumbing to reuse:** `src-tauri/src/browser/bridge.rs::eval_into_content` (host→page eval, ~100-114); `src-tauri/src/commands/browser_commands.rs::browser_bridge_event` (page→host, ~164-248); `src-tauri/src/browser/mod.rs` (content-webview `Mutex<Option<Webview>>` slot, `navigate`, `set_bounds`).
- **UI-sync pattern:** `src-tauri/src/ui_sync/events.rs` (enum + Browser* variants ~152-212), `crate::ui_sync::publish(&app, …)`; TS mirror in `src/lib/api.ts`; handled in `src/shell/hooks/use-ui-sync-bridge.ts` (`switch`/`case`, `ingestForWorkspace`).
- **Test patterns:** Rust inline `#[cfg(test)] mod tests` + `src-tauri/tests/*.rs` with `insta::assert_yaml_snapshot!`; sidecar `import { describe, expect, test } from "bun:test"`; frontend `import { describe, expect, it, vi } from "vitest"` + `renderHook`/`act`.

**Crate deps to add** (Task 0): `async-trait`, and confirm `tokio` has `sync` feature (oneshot). Run `cd src-tauri && cargo add async-trait` and ensure `tokio = { version = "1", features = ["sync", ...] }` in `Cargo.toml`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/preview/mod.rs` | Module root; re-exports `driver`, `broker`, `browser_driver`; `pub use` the public types. |
| `src-tauri/src/preview/driver.rs` | `PreviewDriver` trait + all shared types (`PreviewResult`, `PreviewError`, `PreviewStatus`, `PreviewSnapshot`, `InteractiveElement`, `PreviewDiagnostics`, `PreviewTarget`, `WaitCondition`, `PreviewSurfaceKind`). |
| `src-tauri/src/preview/broker.rs` | Surface registry (`Mutex<HashMap<workspace_id, RegisteredSurface>>`), `dispatch(...)`, active-control set, `PreviewCall`/`PreviewValue` wire enums. |
| `src-tauri/src/preview/browser_driver.rs` | `BrowserDriver: PreviewDriver` — fulfils each verb via the bridge request/response path. |
| `src-tauri/src/browser/bridge.rs` | (modify) add `request_into_content(id, payload)` + a pending-response map resolved by the new bridge event. |
| `src-tauri/src/commands/browser_commands.rs` | (modify) `browser_bridge_event` gains a `DriverResult { id, value }` arm that resolves the pending map. |
| `src-tauri/src/sidecar_host/handlers/preview.rs` | `preview.*` host-method dispatch → `preview::broker::dispatch`. |
| `src-tauri/src/sidecar_host/handlers/mod.rs` | (modify) add `preview.` prefix arm to `route`. |
| `src-tauri/src/commands/preview_commands.rs` | `preview_stop_agent_control(workspace_id)` Tauri command. |
| `src-tauri/src/ui_sync/events.rs` | (modify) add `BrowserAgentControlStarted`/`BrowserAgentControlEnded`. |
| `src-tauri/src/lib.rs` | (modify) `mod preview;`, register `preview_commands::*` in `generate_handler!`. |
| `sidecar/src/preview-mcp.ts` | `createPreviewMcpServer(ctx)` — first in-process SDK MCP server; 10 `preview_*` tools forwarding to `callHost`. |
| `sidecar/src/claude-session-manager.ts` | (modify) build + merge the preview MCP server into `mcpServers`. |
| `src/lib/api.ts` | (modify) add the two `UiMutationEvent` TS variants + `previewStopAgentControl` invoke wrapper. |
| `src/shell/hooks/use-ui-sync-bridge.ts` | (modify) handle the two new variants → update agent-control store. |
| `src/features/browser/agent-control-banner.tsx` | "Agent is controlling" banner with kill switch. |
| `src/features/browser/use-agent-control.ts` | Zustand store: per-workspace control flag, fed by ui-sync. |

---

## Task 0: Add crate dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add async-trait and verify tokio sync feature**

Run: `cd src-tauri && cargo add async-trait`
Then open `Cargo.toml` and confirm the `tokio` line includes `"sync"` in `features` (add it if missing):

```toml
tokio = { version = "1", features = ["sync", "rt-multi-thread", "macros"] }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: PASS (no code yet, just deps).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build(preview): add async-trait dep for PreviewDriver trait"
```

---

## Task 1: PreviewDriver trait + shared types

**Files:**
- Create: `src-tauri/src/preview/mod.rs`
- Create: `src-tauri/src/preview/driver.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod preview;`)

- [ ] **Step 1: Register the module**

In `src-tauri/src/lib.rs`, add near the other `mod` declarations:

```rust
mod preview;
```

- [ ] **Step 2: Write the failing serialization test**

Create `src-tauri/src/preview/driver.rs` with ONLY the test first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_error_serializes_camel_tagged() {
        let err = PreviewError::Unsupported("evaluate is browser-only".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "unsupported");
        assert_eq!(json["message"], "evaluate is browser-only");
    }

    #[test]
    fn preview_target_role_round_trips() {
        let t = PreviewTarget::Role { role: "button".into(), name: "Save".into() };
        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["by"], "role");
        let back: PreviewTarget = serde_json::from_value(json).unwrap();
        assert_eq!(back, t);
    }
}
```

- [ ] **Step 3: Run the test (fails to compile)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::driver`
Expected: FAIL — `PreviewError`/`PreviewTarget` not defined.

- [ ] **Step 4: Implement the trait + types**

Prepend to `src-tauri/src/preview/driver.rs` (above the test module):

```rust
//! Surface-agnostic preview driver contract. A `PreviewDriver` is the only
//! thing the broker knows about; `BrowserDriver` and (Phase 4) `SimulatorDriver`
//! implement it.

use serde::{Deserialize, Serialize};

pub type PreviewResult<T> = Result<T, PreviewError>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PreviewError {
    /// No controllable surface is open for the workspace.
    NoSurface,
    /// The call targeted a workspace the agent does not own.
    WrongWorkspace,
    /// This driver cannot perform the requested verb.
    Unsupported { message: String },
    /// A wait/operation exceeded its deadline.
    Timeout,
    /// Driver-internal failure (page eval error, idb/adb failure, etc.).
    Driver { message: String },
}

impl PreviewError {
    pub fn unsupported(msg: impl Into<String>) -> Self {
        PreviewError::Unsupported { message: msg.into() }
    }
    pub fn driver(msg: impl Into<String>) -> Self {
        PreviewError::Driver { message: msg.into() }
    }
}

impl std::fmt::Display for PreviewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PreviewError::NoSurface => write!(f, "no controllable preview surface"),
            PreviewError::WrongWorkspace => write!(f, "preview call targeted another workspace"),
            PreviewError::Unsupported { message } => write!(f, "unsupported: {message}"),
            PreviewError::Timeout => write!(f, "preview operation timed out"),
            PreviewError::Driver { message } => write!(f, "driver error: {message}"),
        }
    }
}
impl std::error::Error for PreviewError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreviewSurfaceKind {
    Browser,
    SimulatorIos,
    SimulatorAndroid,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewStatus {
    pub surface_kind: PreviewSurfaceKind,
    pub present: bool,
    pub url: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveElement {
    pub role: String,
    pub name: String,
    pub selector: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDiagnostics {
    pub console: Vec<serde_json::Value>,
    pub network: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSnapshot {
    pub url: Option<String>,
    pub title: Option<String>,
    pub visible_text: String,
    pub a11y_tree: serde_json::Value,
    pub interactive_elements: Vec<InteractiveElement>,
    pub diagnostics: PreviewDiagnostics,
    pub screenshot_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "by", rename_all = "camelCase")]
pub enum PreviewTarget {
    Selector { selector: String },
    Role { role: String, name: String },
    Coords { x: f64, y: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WaitCondition {
    Selector { selector: String },
    Text { text: String },
    Url { url: String },
    Ready,
}

#[async_trait::async_trait]
pub trait PreviewDriver: Send + Sync {
    async fn status(&self) -> PreviewResult<PreviewStatus>;
    async fn open(&self, target: String) -> PreviewResult<()>;
    async fn navigate(&self, url: String) -> PreviewResult<()>;
    async fn snapshot(&self) -> PreviewResult<PreviewSnapshot>;
    async fn click(&self, target: PreviewTarget) -> PreviewResult<()>;
    async fn type_text(&self, target: PreviewTarget, text: String) -> PreviewResult<()>;
    async fn press(&self, key: String) -> PreviewResult<()>;
    async fn scroll(&self, target: Option<PreviewTarget>, dx: f64, dy: f64) -> PreviewResult<()>;
    async fn evaluate(&self, script: String) -> PreviewResult<serde_json::Value>;
    async fn wait_for(&self, condition: WaitCondition, timeout_ms: u64) -> PreviewResult<()>;
}
```

Create `src-tauri/src/preview/mod.rs`:

```rust
//! Surface-agnostic agent-control broker. `driver` defines the contract,
//! `broker` routes calls to the focused surface, `browser_driver` implements
//! the browser. Phase 4 adds `simulator_driver`.

pub mod broker;
pub mod browser_driver;
pub mod driver;

pub use driver::{
    InteractiveElement, PreviewDiagnostics, PreviewDriver, PreviewError, PreviewResult,
    PreviewSnapshot, PreviewStatus, PreviewSurfaceKind, PreviewTarget, WaitCondition,
};
```

> Note: `mod.rs` references `broker` and `browser_driver` which don't exist yet. To keep this task compiling on its own, temporarily comment out those two `pub mod` lines and the `pub use` for broker types; re-enable in Tasks 2 and 4. (Subagent-driven execution: leave them commented until the referenced file exists.)

- [ ] **Step 5: Run the test (passes)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::driver`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/preview/mod.rs src-tauri/src/preview/driver.rs src-tauri/src/lib.rs
git commit -m "feat(preview): add PreviewDriver trait and shared wire types"
```

---

## Task 2: Broker — surface registry, dispatch, active-control tracking

**Files:**
- Create: `src-tauri/src/preview/broker.rs`
- Modify: `src-tauri/src/preview/mod.rs` (re-enable `pub mod broker;`)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/preview/broker.rs` with the test first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn dispatch_no_surface_is_structured_error() {
        let reg = SurfaceRegistry::new();
        let err = reg
            .resolve("ws-unknown")
            .err()
            .expect("unknown workspace must error");
        assert_eq!(err, crate::preview::PreviewError::NoSurface);
    }

    #[test]
    fn control_set_tracks_entry_and_exit() {
        let reg = SurfaceRegistry::new();
        assert!(!reg.is_controlled("ws1"));
        reg.mark_controlled("ws1");
        assert!(reg.is_controlled("ws1"));
        reg.clear_controlled("ws1");
        assert!(!reg.is_controlled("ws1"));
    }
}
```

- [ ] **Step 2: Run the test (fails to compile)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::broker`
Expected: FAIL — `SurfaceRegistry` not defined.

- [ ] **Step 3: Implement the broker**

Prepend to `src-tauri/src/preview/broker.rs`:

```rust
//! Resolves a workspace's focused preview surface to a `PreviewDriver` and
//! tracks which workspaces are currently under agent control.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::preview::driver::{
    PreviewDriver, PreviewError, PreviewResult, PreviewSnapshot, PreviewStatus, PreviewSurfaceKind,
    PreviewTarget, WaitCondition,
};

/// A surface currently registered as controllable for a workspace.
#[derive(Clone)]
pub struct RegisteredSurface {
    pub kind: PreviewSurfaceKind,
    pub driver: Arc<dyn PreviewDriver>,
}

#[derive(Default)]
pub struct SurfaceRegistry {
    surfaces: Mutex<HashMap<String, RegisteredSurface>>,
    controlled: Mutex<HashSet<String>>,
}

impl SurfaceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, workspace_id: &str, surface: RegisteredSurface) {
        self.surfaces
            .lock()
            .expect("surfaces lock")
            .insert(workspace_id.to_string(), surface);
    }

    pub fn unregister(&self, workspace_id: &str) {
        self.surfaces.lock().expect("surfaces lock").remove(workspace_id);
        self.clear_controlled(workspace_id);
    }

    pub fn resolve(&self, workspace_id: &str) -> PreviewResult<RegisteredSurface> {
        self.surfaces
            .lock()
            .expect("surfaces lock")
            .get(workspace_id)
            .cloned()
            .ok_or(PreviewError::NoSurface)
    }

    pub fn is_controlled(&self, workspace_id: &str) -> bool {
        self.controlled.lock().expect("controlled lock").contains(workspace_id)
    }
    pub fn mark_controlled(&self, workspace_id: &str) {
        self.controlled
            .lock()
            .expect("controlled lock")
            .insert(workspace_id.to_string());
    }
    pub fn clear_controlled(&self, workspace_id: &str) {
        self.controlled.lock().expect("controlled lock").remove(workspace_id);
    }
}

/// Process-wide registry (the app has at most one controllable surface per
/// workspace; see PRD D7).
pub fn registry() -> &'static SurfaceRegistry {
    static REG: OnceLock<SurfaceRegistry> = OnceLock::new();
    REG.get_or_init(SurfaceRegistry::new)
}

/// One agent tool call, tagged by verb. Mirrors the sidecar `preview_*` tools.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "verb", rename_all = "camelCase")]
pub enum PreviewCall {
    Status,
    Open { target: String },
    Navigate { url: String },
    Snapshot,
    Click { target: PreviewTarget },
    Type { target: PreviewTarget, text: String },
    Press { key: String },
    Scroll { target: Option<PreviewTarget>, dx: f64, dy: f64 },
    Evaluate { script: String },
    WaitFor { condition: WaitCondition, timeout_ms: u64 },
}

/// Verbs that mutate the surface; the first one for a workspace flips it into
/// "agent controlling" and publishes `BrowserAgentControlStarted`.
fn is_mutating(call: &PreviewCall) -> bool {
    matches!(
        call,
        PreviewCall::Click { .. }
            | PreviewCall::Type { .. }
            | PreviewCall::Press { .. }
            | PreviewCall::Scroll { .. }
            | PreviewCall::Navigate { .. }
            | PreviewCall::Open { .. }
    )
}

/// The result union returned to the agent (serialized into the MCP tool reply).
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PreviewValue {
    Unit,
    Status(PreviewStatus),
    Snapshot(PreviewSnapshot),
    Json(serde_json::Value),
}

/// Entry point invoked by the `preview.` host handler. `workspace_id` is the
/// agent's OWN workspace (the sidecar stamps it; see Task 8), so resolving
/// against the registry is the entire cross-workspace safety boundary (D7).
pub async fn dispatch<R: Runtime>(
    app: &AppHandle<R>,
    workspace_id: &str,
    call: PreviewCall,
) -> PreviewResult<PreviewValue> {
    let surface = registry().resolve(workspace_id)?;

    if is_mutating(&call) && !registry().is_controlled(workspace_id) {
        registry().mark_controlled(workspace_id);
        crate::ui_sync::publish(
            app,
            crate::ui_sync::UiMutationEvent::BrowserAgentControlStarted {
                workspace_id: workspace_id.to_string(),
                surface_kind: surface.kind,
            },
        );
    }

    let d = surface.driver;
    let value = match call {
        PreviewCall::Status => PreviewValue::Status(d.status().await?),
        PreviewCall::Open { target } => {
            d.open(target).await?;
            PreviewValue::Unit
        }
        PreviewCall::Navigate { url } => {
            d.navigate(url).await?;
            PreviewValue::Unit
        }
        PreviewCall::Snapshot => PreviewValue::Snapshot(d.snapshot().await?),
        PreviewCall::Click { target } => {
            d.click(target).await?;
            PreviewValue::Unit
        }
        PreviewCall::Type { target, text } => {
            d.type_text(target, text).await?;
            PreviewValue::Unit
        }
        PreviewCall::Press { key } => {
            d.press(key).await?;
            PreviewValue::Unit
        }
        PreviewCall::Scroll { target, dx, dy } => {
            d.scroll(target, dx, dy).await?;
            PreviewValue::Unit
        }
        PreviewCall::Evaluate { script } => PreviewValue::Json(d.evaluate(script).await?),
        PreviewCall::WaitFor { condition, timeout_ms } => {
            d.wait_for(condition, timeout_ms).await?;
            PreviewValue::Unit
        }
    };
    Ok(value)
}

/// Kill switch: clear control + tell the UI. Called by `preview_stop_agent_control`.
pub fn stop_agent_control<R: Runtime>(app: &AppHandle<R>, workspace_id: &str) {
    registry().clear_controlled(workspace_id);
    crate::ui_sync::publish(
        app,
        crate::ui_sync::UiMutationEvent::BrowserAgentControlEnded {
            workspace_id: workspace_id.to_string(),
        },
    );
}
```

In `src-tauri/src/preview/mod.rs`, ensure `pub mod broker;` is enabled.

> The `UiMutationEvent::BrowserAgentControlStarted/Ended` variants are added in Task 6. Until then, comment out the two `publish(...)` blocks (keep `mark_controlled`/`clear_controlled`) so this task compiles; re-enable in Task 6.

- [ ] **Step 4: Run the test (passes)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::broker`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/preview/broker.rs src-tauri/src/preview/mod.rs
git commit -m "feat(preview): add broker surface registry, dispatch, control tracking"
```

---

## Task 3: Correlated request/response bridge path

The existing bridge is fire-and-forget (page→host events). `snapshot`/`click`/etc. need a reply. We add `request_into_content(id, payload)` that evals a request carrying a correlation id, a pending-response map keyed by id, and a new `browser_bridge_event` arm that resolves it.

**Files:**
- Modify: `src-tauri/src/browser/bridge.rs`
- Modify: `src-tauri/src/commands/browser_commands.rs`

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/browser/bridge.rs` a test module:

```rust
#[cfg(test)]
mod request_tests {
    use super::*;

    #[tokio::test]
    async fn pending_request_resolves_when_event_arrives() {
        let id = "req-1".to_string();
        let rx = register_pending(id.clone());
        // Simulate the page replying.
        resolve_pending(&id, serde_json::json!({ "ok": true }));
        let value = tokio::time::timeout(std::time::Duration::from_millis(100), rx)
            .await
            .expect("not timed out")
            .expect("sender not dropped");
        assert_eq!(value["ok"], true);
    }

    #[tokio::test]
    async fn unknown_id_resolve_is_noop() {
        // Must not panic when no one is waiting.
        resolve_pending("nobody", serde_json::json!({}));
    }
}
```

- [ ] **Step 2: Run the test (fails to compile)**

Run: `cd src-tauri && cargo test -p helmor_lib browser::bridge::request_tests`
Expected: FAIL — `register_pending`/`resolve_pending` not defined.

- [ ] **Step 3: Implement the pending map + request eval**

Add to `src-tauri/src/browser/bridge.rs`:

```rust
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::oneshot;

type PendingMap = Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>;

fn pending() -> &'static PendingMap {
    static P: OnceLock<PendingMap> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register interest in a driver reply; returns the receiver to await.
pub fn register_pending(id: String) -> oneshot::Receiver<serde_json::Value> {
    let (tx, rx) = oneshot::channel();
    pending().lock().expect("pending lock").insert(id, tx);
    rx
}

/// Resolve a pending driver request with the page's reply. No-op if unknown.
pub fn resolve_pending(id: &str, value: serde_json::Value) {
    if let Some(tx) = pending().lock().expect("pending lock").remove(id) {
        let _ = tx.send(value);
    }
}

/// Send a correlated driver request into the page. The page must reply via a
/// `DriverResult { id, value }` bridge event (see browser_commands.rs).
pub fn request_into_content(id: &str, payload: &serde_json::Value) -> anyhow::Result<()> {
    let envelope = serde_json::json!({ "kind": "driver-request", "id": id, "payload": payload });
    eval_into_content(&envelope)
}
```

- [ ] **Step 4: Add the resolving event arm**

In `src-tauri/src/browser/bridge.rs`, extend the `BridgeMessage` enum (the page→host enum, `#[serde(tag = "kind")]`) with:

```rust
    /// Reply to a `driver-request` (snapshot/click/etc.). `value` is opaque JSON
    /// shaped per the verb (a PreviewSnapshot, or `{ "ok": true }`, or an error).
    #[serde(rename_all = "camelCase")]
    DriverResult { id: String, value: serde_json::Value },
```

In `src-tauri/src/commands/browser_commands.rs`, add a match arm inside `browser_bridge_event`'s `match message { … }`:

```rust
        BridgeMessage::DriverResult { id, value } => {
            crate::browser::bridge::resolve_pending(&id, value);
        }
```

- [ ] **Step 5: Run the test (passes)**

Run: `cd src-tauri && cargo test -p helmor_lib browser::bridge::request_tests`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/browser/bridge.rs src-tauri/src/commands/browser_commands.rs
git commit -m "feat(preview): add correlated request/response path to browser bridge"
```

> **Page-side note for the executor:** the injected bridge bundle (`src/features/browser/bridge/`) must handle `{ kind: "driver-request", id, payload }` in `window.__helmorBridge.handleMsg`, perform the DOM work (build the a11y/interactive snapshot, dispatch a click on the resolved selector/role/coords, etc.), and post back a `{ kind: "driver-result", id, value }` event through the existing `browser_bridge_event` invoke. Add that handler + a vitest unit test for the snapshot builder in the bridge package; mirror `src/features/browser/content-host.test.ts` (DOM-free where possible, jsdom for DOM walks). This is Task 3b below.

---

## Task 3b: Page-side driver handler (snapshot + actions)

**Files:**
- Modify: `src/features/browser/bridge/channel.ts` (add `driver-request`/`driver-result` message variants)
- Modify: `src/features/browser/bridge/index.ts` (handle `driver-request`)
- Create: `src/features/browser/bridge/driver-snapshot.ts` (pure-ish DOM → snapshot builder)
- Test: `src/features/browser/bridge/driver-snapshot.test.ts`

- [ ] **Step 1: Failing test for the snapshot builder**

```ts
import { describe, expect, it } from "vitest";
import { buildInteractiveElements } from "./driver-snapshot";

describe("buildInteractiveElements", () => {
  it("collects role + accessible name + selector for buttons and links", () => {
    document.body.innerHTML = `
      <button data-testid="save">Save</button>
      <a href="/x" aria-label="Open X">link</a>`;
    const els = buildInteractiveElements(document);
    expect(els).toEqual([
      { role: "button", name: "Save", selector: '[data-testid="save"]' },
      { role: "link", name: "Open X", selector: 'a[href="/x"]' },
    ]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

Run: `bun x vitest run src/features/browser/bridge/driver-snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildInteractiveElements`**

```ts
import { cssSelectorFor } from "./selector";

const ROLE_TAGS: Record<string, string> = {
  BUTTON: "button",
  A: "link",
  INPUT: "textbox",
  SELECT: "combobox",
  TEXTAREA: "textbox",
};

export type SnapshotElement = { role: string; name: string; selector: string };

export function buildInteractiveElements(doc: Document): SnapshotElement[] {
  const out: SnapshotElement[] = [];
  const nodes = doc.querySelectorAll("button, a[href], input, select, textarea, [role]");
  for (const el of Array.from(nodes)) {
    const explicitRole = el.getAttribute("role");
    const role = explicitRole ?? ROLE_TAGS[el.tagName] ?? "generic";
    const name =
      el.getAttribute("aria-label") ??
      (el.textContent ?? "").trim() ||
      (el as HTMLInputElement).value ||
      "";
    out.push({ role, name, selector: cssSelectorFor(el) });
  }
  return out;
}
```

- [ ] **Step 4: Run (PASS)**

Run: `bun x vitest run src/features/browser/bridge/driver-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `driver-request` handling**

In `src/features/browser/bridge/channel.ts`, add to `HostToBridgeMessage`:

```ts
  | { kind: "driver-request"; id: string; payload: DriverRequestPayload }
```

and a new exported type + to `BridgeToHostMessage`:

```ts
  | { kind: "driver-result"; id: string; value: unknown };

export type DriverRequestPayload =
  | { op: "snapshot" }
  | { op: "click"; target: DriverTarget }
  | { op: "type"; target: DriverTarget; text: string }
  | { op: "scroll"; target?: DriverTarget; dx: number; dy: number };

export type DriverTarget =
  | { by: "selector"; selector: string }
  | { by: "role"; role: string; name: string }
  | { by: "coords"; x: number; y: number };
```

In `src/features/browser/bridge/index.ts`, in the message handler, add a branch that for `driver-request` builds the result (`buildInteractiveElements(document)` + `document.title` + `location.href` + `document.body.innerText` for snapshot; `resolveTarget(...).click()` for click; etc.) and posts `{ kind: "driver-result", id, value }` via the existing `browser_bridge_event` invoke path.

- [ ] **Step 6: Commit**

```bash
git add src/features/browser/bridge/
git commit -m "feat(preview): page-side driver-request handler + interactive snapshot builder"
```

---

## Task 4: BrowserDriver implements PreviewDriver

**Files:**
- Create: `src-tauri/src/preview/browser_driver.rs`
- Modify: `src-tauri/src/preview/mod.rs` (re-enable `pub mod browser_driver;`)

- [ ] **Step 1: Failing test (navigate delegates to browser::navigate via app handle stub)**

Because `BrowserDriver` calls into the live webview, the unit-testable seam is its **request envelope construction** and **snapshot deserialization**. Test those:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::preview::driver::PreviewTarget;

    #[test]
    fn click_envelope_targets_selector() {
        let payload = click_payload(&PreviewTarget::Selector { selector: "#save".into() });
        assert_eq!(payload["op"], "click");
        assert_eq!(payload["target"]["by"], "selector");
        assert_eq!(payload["target"]["selector"], "#save");
    }

    #[test]
    fn snapshot_value_parses_into_struct() {
        let value = serde_json::json!({
            "url": "http://localhost:3000/",
            "title": "Home",
            "visibleText": "hello",
            "a11yTree": {},
            "interactiveElements": [{ "role": "button", "name": "Save", "selector": "#save" }],
            "diagnostics": { "console": [], "network": [] },
            "screenshotPath": null
        });
        let snap = parse_snapshot(value).expect("parse");
        assert_eq!(snap.interactive_elements.len(), 1);
        assert_eq!(snap.title.as_deref(), Some("Home"));
    }
}
```

- [ ] **Step 2: Run (FAIL)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::browser_driver`
Expected: FAIL — symbols undefined.

- [ ] **Step 3: Implement BrowserDriver**

```rust
//! `PreviewDriver` over the embedded browser content webview. Read/act verbs go
//! through the correlated bridge request/response path; navigate/open reuse the
//! existing browser commands.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use crate::browser::{self, bridge};
use crate::preview::driver::{
    PreviewDriver, PreviewError, PreviewResult, PreviewSnapshot, PreviewStatus, PreviewSurfaceKind,
    PreviewTarget, WaitCondition,
};

pub struct BrowserDriver<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> BrowserDriver<R> {
    pub fn new(app: AppHandle<R>) -> Arc<Self> {
        Arc::new(Self { app })
    }

    async fn driver_request(&self, payload: Value) -> PreviewResult<Value> {
        let id = Uuid::new_v4().to_string();
        let rx = bridge::register_pending(id.clone());
        bridge::request_into_content(&id, &payload).map_err(|e| PreviewError::driver(e.to_string()))?;
        match tokio::time::timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err(PreviewError::driver("bridge channel closed")),
            Err(_) => Err(PreviewError::Timeout),
        }
    }
}

pub(crate) fn click_payload(target: &PreviewTarget) -> Value {
    serde_json::json!({ "op": "click", "target": target })
}

pub(crate) fn parse_snapshot(value: Value) -> PreviewResult<PreviewSnapshot> {
    serde_json::from_value(value).map_err(|e| PreviewError::driver(format!("bad snapshot: {e}")))
}

#[async_trait::async_trait]
impl<R: Runtime> PreviewDriver for BrowserDriver<R> {
    async fn status(&self) -> PreviewResult<PreviewStatus> {
        Ok(PreviewStatus {
            surface_kind: PreviewSurfaceKind::Browser,
            present: true,
            url: None,
            title: None,
        })
    }

    async fn open(&self, target: String) -> PreviewResult<()> {
        self.navigate(target).await
    }

    async fn navigate(&self, url: String) -> PreviewResult<()> {
        browser::navigate(&self.app, &url).map_err(|e| PreviewError::driver(e.to_string()))
    }

    async fn snapshot(&self) -> PreviewResult<PreviewSnapshot> {
        let value = self.driver_request(serde_json::json!({ "op": "snapshot" })).await?;
        parse_snapshot(value)
    }

    async fn click(&self, target: PreviewTarget) -> PreviewResult<()> {
        self.driver_request(click_payload(&target)).await.map(|_| ())
    }

    async fn type_text(&self, target: PreviewTarget, text: String) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "type", "target": target, "text": text }))
            .await
            .map(|_| ())
    }

    async fn press(&self, key: String) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "press", "key": key })).await.map(|_| ())
    }

    async fn scroll(&self, target: Option<PreviewTarget>, dx: f64, dy: f64) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "scroll", "target": target, "dx": dx, "dy": dy }))
            .await
            .map(|_| ())
    }

    async fn evaluate(&self, script: String) -> PreviewResult<Value> {
        self.driver_request(serde_json::json!({ "op": "evaluate", "script": script })).await
    }

    async fn wait_for(&self, condition: WaitCondition, timeout_ms: u64) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "waitFor", "condition": condition, "timeoutMs": timeout_ms }))
            .await
            .map(|_| ())
    }
}
```

Add `uuid` if not present: `cd src-tauri && cargo add uuid --features v4` (it is already a dep per `browser/capture.rs`; skip if `cargo tree -p uuid` shows it).

Re-enable `pub mod browser_driver;` and the broker `pub use` in `mod.rs`.

- [ ] **Step 4: Run (PASS)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::browser_driver`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/preview/browser_driver.rs src-tauri/src/preview/mod.rs
git commit -m "feat(preview): BrowserDriver fulfilling PreviewDriver over the bridge"
```

---

## Task 5: `preview.` host-method handler

**Files:**
- Create: `src-tauri/src/sidecar_host/handlers/preview.rs`
- Modify: `src-tauri/src/sidecar_host/handlers/mod.rs`

- [ ] **Step 1: Failing test (verb param parses into PreviewCall)**

Create `src-tauri/src/sidecar_host/handlers/preview.rs` test-first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_navigate_params() {
        let params = serde_json::json!({ "workspaceId": "ws1", "url": "http://localhost:3000" });
        let parsed = parse_call("navigate", params).expect("parse");
        assert_eq!(parsed.0, "ws1");
        matches!(parsed.1, crate::preview::broker::PreviewCall::Navigate { .. });
    }

    #[test]
    fn missing_workspace_id_errors() {
        let params = serde_json::json!({ "url": "x" });
        assert!(parse_call("navigate", params).is_err());
    }
}
```

- [ ] **Step 2: Run (FAIL)**

Run: `cd src-tauri && cargo test -p helmor_lib sidecar_host::handlers::preview`
Expected: FAIL — `parse_call` undefined.

- [ ] **Step 3: Implement the handler**

Prepend to `preview.rs`:

```rust
//! `preview.*` host methods — the agent-control broker reverse channel.
//! Method tail is the verb: navigate, snapshot, click, type, press, scroll,
//! evaluate, waitFor, status, open. `workspaceId` scopes to the agent's own
//! workspace (D7).

use anyhow::Result;
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::preview::broker::{self, PreviewCall};

/// Split `{ workspaceId, ...verbParams }` into (workspace_id, PreviewCall).
pub(crate) fn parse_call(verb: &str, mut params: Value) -> Result<(String, PreviewCall)> {
    let workspace_id = params
        .get("workspaceId")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("preview.{verb}: missing workspaceId"))?
        .to_string();
    if let Some(obj) = params.as_object_mut() {
        obj.remove("workspaceId");
    }
    // Re-tag the remaining params with the verb so PreviewCall's internal tag
    // deserializes (camelCase verb).
    let mut tagged = params;
    if let Some(obj) = tagged.as_object_mut() {
        obj.insert("verb".to_string(), Value::String(verb.to_string()));
    }
    let call: PreviewCall = serde_json::from_value(tagged)
        .map_err(|e| anyhow::anyhow!("preview.{verb}: bad params: {e}"))?;
    Ok((workspace_id, call))
}

pub async fn dispatch<R: Runtime>(app: AppHandle<R>, verb: &str, params: Value) -> Result<Value> {
    let (workspace_id, call) = parse_call(verb, params)?;
    match broker::dispatch(&app, &workspace_id, call).await {
        Ok(value) => Ok(serde_json::to_value(value)?),
        // Structured PreviewError surfaces as a tool result the agent can read,
        // NOT a transport error — the agent learns "no surface" gracefully.
        Err(err) => Ok(serde_json::json!({ "error": serde_json::to_value(err)? })),
    }
}
```

In `src-tauri/src/sidecar_host/handlers/mod.rs`, add `pub mod preview;` and a route arm:

```rust
    if let Some(m) = method.strip_prefix("preview.") {
        return preview::dispatch(app, m, params).await;
    }
```

> Note: `PreviewCall`'s serde tag is `verb` (camelCase). `parse_call` injects `"verb": "<verb>"`; verbs `waitFor` map to `WaitFor`. Confirm the tool layer sends camelCase verbs (Task 8 does).

- [ ] **Step 4: Run (PASS)**

Run: `cd src-tauri && cargo test -p helmor_lib sidecar_host::handlers::preview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sidecar_host/handlers/preview.rs src-tauri/src/sidecar_host/handlers/mod.rs
git commit -m "feat(preview): route preview.* host methods to the broker"
```

---

## Task 6: UiMutationEvent variants + kill-switch command

**Files:**
- Modify: `src-tauri/src/ui_sync/events.rs`
- Create: `src-tauri/src/commands/preview_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Failing test (event serializes camelCase tagged)**

Add to the existing `#[cfg(test)]` block in `events.rs` (or create one):

```rust
    #[test]
    fn agent_control_started_serializes() {
        let ev = UiMutationEvent::BrowserAgentControlStarted {
            workspace_id: "ws1".into(),
            surface_kind: crate::preview::PreviewSurfaceKind::Browser,
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "browserAgentControlStarted");
        assert_eq!(json["workspaceId"], "ws1");
        assert_eq!(json["surfaceKind"], "browser");
    }
```

- [ ] **Step 2: Run (FAIL)**

Run: `cd src-tauri && cargo test -p helmor_lib ui_sync::events`
Expected: FAIL — variant undefined.

- [ ] **Step 3: Add the variants**

In `src-tauri/src/ui_sync/events.rs` `UiMutationEvent` enum, after the existing Browser* variants:

```rust
    /// An agent began controlling a workspace's preview surface.
    BrowserAgentControlStarted {
        workspace_id: String,
        surface_kind: crate::preview::PreviewSurfaceKind,
    },
    /// Agent control ended (kill switch, session end, or surface teardown).
    BrowserAgentControlEnded { workspace_id: String },
```

Now re-enable the two `publish(...)` blocks commented out in Task 2 (`broker.rs`).

- [ ] **Step 4: Run (PASS)**

Run: `cd src-tauri && cargo test -p helmor_lib ui_sync::events`
Expected: PASS.

- [ ] **Step 5: Add the kill-switch command + register it**

Create `src-tauri/src/commands/preview_commands.rs`:

```rust
use crate::error::CmdResult;

/// Kill switch: revoke agent control of a workspace's preview surface.
#[tauri::command]
pub async fn preview_stop_agent_control(app: tauri::AppHandle, workspace_id: String) -> CmdResult<()> {
    crate::preview::broker::stop_agent_control(&app, &workspace_id);
    Ok(())
}
```

In `src-tauri/src/commands/mod.rs` add `pub mod preview_commands;`. In `src-tauri/src/lib.rs` `generate_handler![...]`, add:

```rust
    commands::preview_commands::preview_stop_agent_control,
```

Mirror in `src/lib/api.ts`: add the two `UiMutationEvent` TS variants and the wrapper:

```ts
  | { readonly type: "browserAgentControlStarted"; readonly workspaceId: string; readonly surfaceKind: "browser" | "simulatorIos" | "simulatorAndroid" }
  | { readonly type: "browserAgentControlEnded"; readonly workspaceId: string }
```

```ts
export async function previewStopAgentControl(workspaceId: string): Promise<void> {
  await invoke("preview_stop_agent_control", { workspaceId });
}
```

- [ ] **Step 6: Verify build + commit**

Run: `cd src-tauri && cargo check` then `bun run typecheck`
Expected: PASS.

```bash
git add src-tauri/src/ui_sync/events.rs src-tauri/src/commands/preview_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/src/preview/broker.rs src/lib/api.ts
git commit -m "feat(preview): agent-control Ui events + stop-control kill switch command"
```

---

## Task 7: Frontend agent-control store + banner

**Files:**
- Create: `src/features/browser/use-agent-control.ts`
- Create: `src/features/browser/agent-control-banner.tsx`
- Modify: `src/shell/hooks/use-ui-sync-bridge.ts`
- Modify: `src/features/browser/index.tsx` (render the banner over the surface)

- [ ] **Step 1: Failing test for the store reducer**

`src/features/browser/use-agent-control.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agentControlReducer, emptyAgentControl } from "./use-agent-control";

describe("agentControlReducer", () => {
  it("marks a workspace controlled on start and clears on end", () => {
    let s = emptyAgentControl();
    s = agentControlReducer(s, { type: "start", workspaceId: "ws1" });
    expect(s.controlled.has("ws1")).toBe(true);
    s = agentControlReducer(s, { type: "end", workspaceId: "ws1" });
    expect(s.controlled.has("ws1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

Run: `bun x vitest run src/features/browser/use-agent-control.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement store + reducer**

```ts
import { create } from "zustand";

export type AgentControlState = { controlled: Set<string> };
export type AgentControlAction =
  | { type: "start"; workspaceId: string }
  | { type: "end"; workspaceId: string };

export function emptyAgentControl(): AgentControlState {
  return { controlled: new Set() };
}

export function agentControlReducer(
  state: AgentControlState,
  action: AgentControlAction,
): AgentControlState {
  const next = new Set(state.controlled);
  if (action.type === "start") next.add(action.workspaceId);
  else next.delete(action.workspaceId);
  return { controlled: next };
}

type Store = AgentControlState & {
  apply: (action: AgentControlAction) => void;
  isControlled: (workspaceId: string) => boolean;
};

export const useAgentControlStore = create<Store>((set, get) => ({
  ...emptyAgentControl(),
  apply: (action) => set((s) => agentControlReducer(s, action)),
  isControlled: (workspaceId) => get().controlled.has(workspaceId),
}));
```

- [ ] **Step 4: Run (PASS)**

Run: `bun x vitest run src/features/browser/use-agent-control.test.ts`
Expected: PASS.

- [ ] **Step 5: Handle the events + render the banner**

In `src/shell/hooks/use-ui-sync-bridge.ts`, add cases:

```ts
    case "browserAgentControlStarted":
      useAgentControlStore.getState().apply({ type: "start", workspaceId: event.workspaceId });
      return;
    case "browserAgentControlEnded":
      useAgentControlStore.getState().apply({ type: "end", workspaceId: event.workspaceId });
      return;
```

Create `src/features/browser/agent-control-banner.tsx`:

```tsx
import { previewStopAgentControl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAgentControlStore } from "./use-agent-control";

export function AgentControlBanner({ workspaceId }: { workspaceId: string }) {
  const controlled = useAgentControlStore((s) => s.controlled.has(workspaceId));
  if (!controlled) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-amber-500/90 px-3 py-1.5 text-sm text-black">
      <span className="font-medium">Agent is controlling this surface</span>
      <Button
        size="sm"
        variant="secondary"
        className="cursor-pointer"
        onClick={() => void previewStopAgentControl(workspaceId)}
      >
        Stop
      </Button>
    </div>
  );
}
```

Render `<AgentControlBanner workspaceId={workspaceId} />` inside `WorkspaceBrowserSurface` (`src/features/browser/index.tsx`), above the content host.

- [ ] **Step 6: Commit**

```bash
git add src/features/browser/use-agent-control.ts src/features/browser/use-agent-control.test.ts src/features/browser/agent-control-banner.tsx src/shell/hooks/use-ui-sync-bridge.ts src/features/browser/index.tsx
git commit -m "feat(preview): agent-control banner + kill switch wired to ui-sync"
```

---

## Task 8: Sidecar in-process MCP server (the 10 preview_* tools)

**Files:**
- Create: `sidecar/src/preview-mcp.ts`
- Test: `sidecar/test/preview-mcp.test.ts`

- [ ] **Step 1: Failing test for tool→host forwarding**

```ts
import { describe, expect, test } from "bun:test";
import { buildPreviewToolCalls } from "../src/preview-mcp.js";

describe("preview tool host calls", () => {
  test("navigate forwards verb + workspaceId + url to callHost", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const fakeCallHost = async (method: string, params: unknown) => {
      calls.push({ method, params });
      return { ok: true };
    };
    const tools = buildPreviewToolCalls("ws-42", fakeCallHost);
    await tools.navigate({ url: "http://localhost:3000" });
    expect(calls).toEqual([
      { method: "preview.navigate", params: { workspaceId: "ws-42", url: "http://localhost:3000" } },
    ]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

Run: `cd sidecar && bun test test/preview-mcp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server + the testable call layer**

```ts
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callHost } from "./host-bridge.js";

type CallHost = (method: string, params: unknown) => Promise<unknown>;

/** Pure, testable forwarding layer: each verb → callHost("preview.<verb>", {workspaceId, ...}). */
export function buildPreviewToolCalls(workspaceId: string, call: CallHost) {
  const fwd = (verb: string, params: Record<string, unknown> = {}) =>
    call(`preview.${verb}`, { workspaceId, ...params });
  return {
    status: () => fwd("status"),
    open: (a: { target: string }) => fwd("open", a),
    navigate: (a: { url: string }) => fwd("navigate", a),
    snapshot: () => fwd("snapshot"),
    click: (a: { target: unknown }) => fwd("click", a),
    type: (a: { target: unknown; text: string }) => fwd("type", a),
    press: (a: { key: string }) => fwd("press", a),
    scroll: (a: { target?: unknown; dx: number; dy: number }) => fwd("scroll", a),
    evaluate: (a: { script: string }) => fwd("evaluate", a),
    waitFor: (a: { condition: unknown; timeoutMs: number }) => fwd("waitFor", a),
  };
}

const target = z.union([
  z.object({ by: z.literal("selector"), selector: z.string() }),
  z.object({ by: z.literal("role"), role: z.string(), name: z.string() }),
  z.object({ by: z.literal("coords"), x: z.number(), y: z.number() }),
]);

function ok(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/** The in-process MCP server injected per Claude session. */
export function createPreviewMcpServer(workspaceId: string) {
  const c = buildPreviewToolCalls(workspaceId, callHost);
  return createSdkMcpServer({
    name: "helmor-preview",
    version: "1.0.0",
    tools: [
      tool("preview_status", "Report whether a controllable preview surface exists.", {}, async () => ok(await c.status())),
      tool("preview_open", "Open/show the preview surface and load a target.", { target: z.string() }, async (a) => ok(await c.open(a))),
      tool("preview_navigate", "Navigate the preview surface to a URL.", { url: z.string() }, async (a) => ok(await c.navigate(a))),
      tool("preview_snapshot", "Return title, URL, visible text, a11y tree, interactive elements, diagnostics, and a screenshot path.", {}, async () => ok(await c.snapshot())),
      tool("preview_click", "Click an element by selector, role+name, or coords.", { target }, async (a) => ok(await c.click(a))),
      tool("preview_type", "Type text into a target element.", { target, text: z.string() }, async (a) => ok(await c.type(a))),
      tool("preview_press", "Press a key.", { key: z.string() }, async (a) => ok(await c.press(a))),
      tool("preview_scroll", "Scroll the viewport or a target.", { target: target.optional(), dx: z.number(), dy: z.number() }, async (a) => ok(await c.scroll(a))),
      tool("preview_evaluate", "Evaluate page JavaScript (browser surfaces only).", { script: z.string() }, async (a) => ok(await c.evaluate(a))),
      tool("preview_wait_for", "Wait for a selector/text/url/readiness.", { condition: z.unknown(), timeoutMs: z.number() }, async (a) => ok(await c.waitFor(a as { condition: unknown; timeoutMs: number }))),
    ],
  });
}
```

Add `zod` if not already a sidecar dep: `cd sidecar && bun add zod` (the SDK peer-depends on it; confirm with `bun pm ls | grep zod` first).

- [ ] **Step 4: Run (PASS)**

Run: `cd sidecar && bun test test/preview-mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/preview-mcp.ts sidecar/test/preview-mcp.test.ts sidecar/package.json
git commit -m "feat(preview): in-process MCP server exposing preview_* tools"
```

---

## Task 9: Inject the preview MCP server per Claude session

**Files:**
- Modify: `sidecar/src/claude-session-manager.ts`

- [ ] **Step 1: Find the workspace id available at session build**

In `handleSendMessage`/the session setup, identify the variable carrying the workspace id (the same id the surface registers under in Rust — it must match `workspaceId` used by `browser_bridge_event` and the surface registry). If absent, thread it from the request params (it is already passed for browser bridge events). Document the exact variable name in a code comment.

- [ ] **Step 2: Build + merge the server**

At `claude-session-manager.ts:~438-464`, after `projectMcpServers` is computed:

```ts
import { createPreviewMcpServer } from "./preview-mcp.js";
// ...
const previewMcp = createPreviewMcpServer(workspaceId);
const mergedMcpServers = {
  ...(projectMcpServers ?? {}),
  helmorPreview: previewMcp,
};
```

Change the options spread from:

```ts
...(projectMcpServers ? { mcpServers: projectMcpServers } : {}),
```

to:

```ts
mcpServers: mergedMcpServers,
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (documented, not automated)**

Run `bun run dev`, open a workspace, open the browser surface, and prompt the agent: "Use preview_snapshot and tell me the page title." Confirm the agent calls the tool and the banner does NOT appear for read-only snapshot, but DOES appear after a `preview_click`. Confirm Stop removes the banner.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/claude-session-manager.ts
git commit -m "feat(preview): inject preview MCP server into each Claude session"
```

---

## Task 10: Surface registration lifecycle

The browser surface must `register`/`unregister` a `BrowserDriver` in the broker registry when it mounts/unmounts, so `dispatch` can resolve it.

**Files:**
- Modify: `src-tauri/src/browser/mod.rs` (`create` registers, `destroy` unregisters)
- Modify: `src-tauri/src/commands/browser_commands.rs` (pass workspace_id through `browser_create`)

- [ ] **Step 1: Failing test (registry resolves after register, errors after unregister)**

Add to `src-tauri/src/preview/broker.rs` tests:

```rust
    #[test]
    fn register_then_unregister_round_trips_resolution() {
        struct Dummy;
        #[async_trait::async_trait]
        impl crate::preview::PreviewDriver for Dummy {
            async fn status(&self) -> crate::preview::PreviewResult<crate::preview::PreviewStatus> {
                Ok(crate::preview::PreviewStatus { surface_kind: crate::preview::PreviewSurfaceKind::Browser, present: true, url: None, title: None })
            }
            async fn open(&self, _t: String) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn navigate(&self, _u: String) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn snapshot(&self) -> crate::preview::PreviewResult<crate::preview::PreviewSnapshot> { unreachable!() }
            async fn click(&self, _t: crate::preview::PreviewTarget) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn type_text(&self, _t: crate::preview::PreviewTarget, _x: String) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn press(&self, _k: String) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn scroll(&self, _t: Option<crate::preview::PreviewTarget>, _dx: f64, _dy: f64) -> crate::preview::PreviewResult<()> { Ok(()) }
            async fn evaluate(&self, _s: String) -> crate::preview::PreviewResult<serde_json::Value> { Ok(serde_json::Value::Null) }
            async fn wait_for(&self, _c: crate::preview::WaitCondition, _t: u64) -> crate::preview::PreviewResult<()> { Ok(()) }
        }
        let reg = SurfaceRegistry::new();
        reg.register("ws1", RegisteredSurface { kind: PreviewSurfaceKind::Browser, driver: std::sync::Arc::new(Dummy) });
        assert!(reg.resolve("ws1").is_ok());
        reg.unregister("ws1");
        assert_eq!(reg.resolve("ws1").err(), Some(crate::preview::PreviewError::NoSurface));
    }
```

- [ ] **Step 2: Run (FAIL or PASS-after-impl)**

Run: `cd src-tauri && cargo test -p helmor_lib preview::broker`
Expected: PASS if registry already supports it (it does from Task 2) — this test locks the contract. If it compiles+passes immediately, that's acceptable (regression lock).

- [ ] **Step 3: Wire registration into the webview lifecycle**

In `src-tauri/src/browser/mod.rs::create(app, url, rect)`, accept a `workspace_id: &str` (thread it from `browser_create`) and after the webview is embedded:

```rust
crate::preview::broker::registry().register(
    workspace_id,
    crate::preview::broker::RegisteredSurface {
        kind: crate::preview::PreviewSurfaceKind::Browser,
        driver: crate::preview::browser_driver::BrowserDriver::new(app.clone()),
    },
);
```

In `destroy(app)` (thread workspace_id similarly, or unregister all browser surfaces):

```rust
crate::preview::broker::registry().unregister(workspace_id);
```

Update `browser_create`/`browser_destroy` command signatures to pass `workspace_id` and update the TS wrappers in `src/lib/api.ts` + the call sites in `src/features/browser/content-host.tsx` (it already knows `workspaceId`).

- [ ] **Step 4: Run all preview tests + build**

Run: `cd src-tauri && cargo test -p helmor_lib preview` then `cargo check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/browser/mod.rs src-tauri/src/commands/browser_commands.rs src/lib/api.ts src/features/browser/content-host.tsx
git commit -m "feat(preview): register/unregister BrowserDriver on surface lifecycle"
```

---

## Task 11: Codex follow-up note (documentation only)

**Files:**
- Modify: `docs/prd/browser-split-mode-and-agent-control.md` (append a "Codex broker follow-up" note)

- [ ] **Step 1: Document the gap**

Add a short note: Codex receives MCP servers via CLI config (`-c mcp_servers={...}` in `sidecar/src/codex-app-server.ts::buildCodexAppServerArgs`), NOT via the in-process SDK server. To give Codex agents the `preview_*` tools, ship a thin **stdio MCP shim** binary (e.g. `helmor-cli mcp preview --workspace <id>`) whose tools forward to the same `preview.*` host methods, and inject it into the Codex `mcp_servers` config. Scope: follow-up PR after the Claude path is validated.

- [ ] **Step 2: Commit**

```bash
git add docs/prd/browser-split-mode-and-agent-control.md
git commit -m "docs(preview): note Codex stdio MCP shim as broker follow-up"
```

---

## Self-review notes (acceptance criteria → tasks)

| Acceptance criterion | Covered by |
| --- | --- |
| Broker dispatches every `preview_*` through `PreviewDriver`; `BrowserDriver` implements all verbs | Tasks 1, 2, 4 |
| Agent can `preview_open`/`navigate`/`snapshot` and act on results | Tasks 3, 3b, 4, 8, 9 |
| Agent can `preview_click`/`type`/`press`/`scroll`/`wait_for`/`evaluate` | Tasks 3b, 4, 8 |
| Tools only target the agent's OWN workspace; cross-workspace/no-surface → structured no-op | Tasks 2 (`resolve`→`NoSurface`), 5 (`workspaceId` scoping), 8 (`workspaceId` stamped) |
| Persistent "Agent is controlling" indicator; one-click Stop; no per-call prompts | Tasks 2 (control set + events), 6 (events + kill switch command), 7 (banner) |
| Agent actions visibly reflected in the surface UI | Task 3b (real DOM actions in the live page) + Task 7 (banner) |

## Open wiring risks

- **Rust reverse-channel (RESOLVED):** the sidecar→Rust `hostRequest` channel already routes through `sidecar_host/handlers/mod.rs::route` by namespace prefix (`triage.` today). Task 5 adds the `preview.` arm — no new transport plumbing needed. `src-tauri/src/sidecar.rs:673-695` forwards, `lib.rs:403-416` replies.
- **Workspace id at session build (VERIFY in Task 9):** the broker's entire safety boundary is that the sidecar stamps the agent's own `workspaceId`. Confirm that id is available in `claude-session-manager.ts` at MCP-server build time and is identical to the id the surface registers under in `browser/mod.rs`. If sessions can switch workspace mid-stream, rebuild/replace the MCP server's bound id accordingly.
- **`PreviewCall` tag injection:** `parse_call` injects `"verb"` into the params object; ensure no verb's params already contain a `verb` key (none do). `waitFor` (camelCase) must match the serde rename for `WaitFor`.
- **`evaluate` on simulators (Phase 4):** returns `PreviewError::Unsupported`; the browser path implements it. The tool description for `preview_evaluate` already says "browser surfaces only."
