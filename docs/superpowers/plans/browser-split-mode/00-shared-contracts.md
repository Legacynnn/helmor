# Shared Contracts — Browser Split Mode & Agent-Controlled Preview

> **Source of truth for names/types across all 5 phase plans.** Every plan in this folder MUST use these exact identifiers. If a plan needs to change one, update it here first and grep the other plans.

PRD: `docs/prd/browser-split-mode-and-agent-control.md`

## Phase files
1. `01-split-mode-shell.md` — Split Mode layout (closed/split/expanded), re-host existing browser surface.
2. `02-agent-control-broker.md` — surface-agnostic broker, `PreviewDriver` trait, `BrowserDriver`, MCP tools, trust UX.
3. `03-coding-extras.md` — responsive/device preview, live-reload, element→source, flow recording.
4. `04-simulator-automation.md` — `SimulatorDriver` (iOS via `simctl`/idb, Android via `adb`), simulator surface.
5. `05-perf-hardening.md` — perf-HUD validation pass across browser + simulator.

## Layout (Phase 1)
- Reuse existing `ShellViewMode` union member `"browser"` (`src/shell/controllers/use-selection-controller.ts:59`). Do NOT add a new view-mode member.
- New layout dimension owned by `useBrowserSessionController`:
  - Type: `export type BrowserLayoutState = "split" | "expanded";` (added to `use-browser-session-controller.tsx`).
  - State field: `state.layout: BrowserLayoutState` (default `"split"`).
  - Actions: `setLayout(layout: BrowserLayoutState): void`, `toggleExpand(): void`.
- Persisted width: localStorage key **`helmor.workspaceBrowserSplitWidth`** (define in `src/shell/layout.ts` next to `SIDEBAR_WIDTH_STORAGE_KEY`). Clamp helper `clampBrowserSplitWidth(width)`; constants `DEFAULT_BROWSER_SPLIT_WIDTH = 640`, `MIN_BROWSER_SPLIT_WIDTH = 360`, `MAX_BROWSER_SPLIT_WIDTH = 1100`.
- Shell events (`src/shell/event-bus.ts` `ShellEvent` union): `{ type: "toggle-browser-split" }` and `{ type: "toggle-browser-expand" }`.
- Shortcut ids (`src/shell/hooks/use-global-shortcut-handlers.ts`): `"browser.toggleSplit"` (default `Cmd+Shift+B`), `"browser.toggleExpand"` (default `Cmd+Shift+Enter`). Keep `"composer.toggleContextPanel"` (`Cmd+Shift+C`) unchanged.

## Broker + driver (Phase 2, extended in Phase 4)
- New Rust module dir: **`src-tauri/src/preview/`** with `mod.rs`, `driver.rs` (trait), `browser_driver.rs`, `broker.rs`. Phase 4 adds `simulator_driver.rs`.
- Trait (in `preview/driver.rs`):
  ```rust
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
- Shared types (in `preview/driver.rs`):
  - `pub type PreviewResult<T> = Result<T, PreviewError>;`
  - `pub enum PreviewError { NoSurface, WrongWorkspace, Unsupported(String), Timeout, Driver(String) }` (serde `tag = "kind"`, camelCase).
  - `pub struct PreviewStatus { surface_kind: PreviewSurfaceKind, present: bool, url: Option<String>, title: Option<String> }`.
  - `pub enum PreviewSurfaceKind { Browser, SimulatorIos, SimulatorAndroid }` (serde camelCase).
  - `pub struct PreviewSnapshot { url: Option<String>, title: Option<String>, visible_text: String, a11y_tree: serde_json::Value, interactive_elements: Vec<InteractiveElement>, diagnostics: PreviewDiagnostics, screenshot_path: Option<String> }`.
  - `pub struct InteractiveElement { role: String, name: String, selector: String }`.
  - `pub struct PreviewDiagnostics { console: Vec<serde_json::Value>, network: Vec<serde_json::Value> }`.
  - `pub enum PreviewTarget { Selector(String), Role { role: String, name: String }, Coords { x: f64, y: f64 } }` (serde `tag = "by"`, camelCase).
  - `pub enum WaitCondition { Selector(String), Text(String), Url(String), Ready }` (serde `tag = "kind"`, camelCase).
- Broker entry (in `preview/broker.rs`): `pub async fn dispatch(app: &AppHandle, workspace_id: &str, call: PreviewCall) -> PreviewResult<PreviewValue>` where `PreviewCall` is a serde-tagged enum mirroring the tool names and `PreviewValue` is a serde-tagged result union. The broker resolves the focused surface for `workspace_id`, returns `PreviewError::NoSurface` if none, then calls the trait.
- Active-control tracking: `preview/broker.rs` holds `Mutex<HashSet<String>>` of workspace_ids under agent control; entering on first mutating call, exiting on kill switch or session end.

## MCP tool surface (Phase 2)
- Sidecar in-process SDK MCP server: **`sidecar/src/preview-mcp.ts`** exporting `createPreviewMcpServer(ctx)` using `createSdkMcpServer` + `tool` from `@anthropic-ai/claude-agent-sdk`. This is the FIRST in-process SDK MCP server in the sidecar.
- Injected in `sidecar/src/claude-session-manager.ts` by merging into the `mcpServers` option (alongside `projectMcpServers`).
- Tool names (exact): `preview_status`, `preview_open`, `preview_navigate`, `preview_snapshot`, `preview_click`, `preview_type`, `preview_press`, `preview_scroll`, `preview_evaluate`, `preview_wait_for`.
- Each tool handler calls the host via `callHost("preview/<verb>", { workspaceId, ...params })` from `sidecar/src/host-bridge.ts` (existing reverse-channel; `verb` ∈ status/open/navigate/snapshot/click/type/press/scroll/evaluate/wait_for).
- Rust host-request handler routes `method == "preview/<verb>"` → `preview::broker::dispatch(...)`. (Phase 2 adds this arm wherever the Rust side handles `hostRequest`; the sidecar→host transport is `{ type: "hostRequest", callbackId, method, params }` / `{ type: "hostResponse", callbackId, ok|error }`.)
- The MCP server's per-session context carries `workspaceId` so every tool call is scoped to the agent's own workspace (Decision D7). Codex MCP wiring is a documented follow-up inside Phase 2 (Codex receives MCP via `-c mcp_servers=...`, requires a stdio shim, not the in-process server).

## UiMutationEvent variants (Phase 2)
Add to `src-tauri/src/ui_sync/events.rs` `UiMutationEvent` (serde `tag = "type"`, camelCase), mirror in `src/lib/api.ts`, handle in `src/shell/hooks/use-ui-sync-bridge.ts`:
- `BrowserAgentControlStarted { workspace_id: String, surface_kind: PreviewSurfaceKind }`
- `BrowserAgentControlEnded { workspace_id: String }`

Frontend: an `AgentControlBanner` (in `src/features/browser/agent-control-banner.tsx`) shows while control is active, with a one-click Stop calling a new command `preview_stop_agent_control(workspace_id)`.

## Simulator (Phase 4)
- `SimulatorDriver` impl of `PreviewDriver` in `src-tauri/src/preview/simulator_driver.rs`, parameterized by platform.
- iOS tooling: `xcrun simctl` (`list devices`, `boot`, `io booted screenshot <path>`, `openurl booted <url>`), `idb` (`idb ui describe-all`, `idb ui tap <x> <y>`, `idb ui text <text>`, `idb ui key <code>`).
- Android tooling: `adb` (`adb devices`, `adb shell input tap <x> <y>`, `adb shell input text <text>`, `adb shell input keyevent <code>`, `adb exec-out screencap -p`, `uiautomator dump`).
- Tooling presence detection helper returns a structured "tooling not installed" surface state; missing tooling never panics.
- New surface: `src/features/simulator/` (mirrors `src/features/browser/` structure) hosted in the same Split Mode shell. New `SimulatorSurface` rendered by `workspace-pane-surface.tsx` when the active preview surface kind is a simulator.
- `evaluate` returns `PreviewError::Unsupported("evaluate is browser-only")` for simulators.

## Conventions (all phases)
- Serde: `#[serde(rename_all = "camelCase")]` on every new struct/enum crossing IPC.
- New Tauri commands registered in `src-tauri/src/lib.rs` `generate_handler![...]`.
- Backend→frontend notifications go ONLY through `UiMutationEvent` + `crate::ui_sync::publish(&app, ...)`. No ad-hoc `app.emit`.
- Rust tests: `cargo test`; pipeline/persistence/schema changes need insta snapshots in `src-tauri/tests/`.
- Sidecar tests: `bun test` (`import { describe, expect, test } from "bun:test"`).
- Frontend tests: vitest (`import { describe, expect, it } from "vitest"`), `renderHook`/`act` for hooks, `vi.mock("@/lib/api", ...)`.
- Path alias `@/` → `src/`. Biome tab indent.
