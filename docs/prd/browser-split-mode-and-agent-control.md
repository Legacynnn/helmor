# PRD — Browser Split Mode & Agent-Controlled Preview

**Status:** Draft (ready to slice into plans)
**Source issues:** [#55](https://github.com/Legacynnn/helmor/issues/55) (Integrated Browser Surface) · [#57](https://github.com/Legacynnn/helmor/issues/57) (Split Mode + agent-controlled previews)
**Pattern reference:** T3 Code right-panel browser/preview workflow (analyzed in `.agent-contexts/t3code-feature-study/`)
**Decided via:** `/grill-me` design interview (decision log below)

---

## 1. Summary

Helmor already ships ~70% of an integrated browser surface (#55): a native Tauri child-webview that opens as a **full-pane peer to the Monaco editor**, with tabs, URL bar, an injected inspector bridge, comment/pick/draw modes, screenshot + full-page capture, CSP fallback, and per-workspace persistence.

This PRD takes that surface to its intended form by adding the **#57 delta**:

1. **Split Mode** — re-host the browser as a right-side *companion panel* beside chat (closed → split → expanded), instead of a full-pane mode that hides chat.
2. **Agent control broker (surface-agnostic)** — scoped `preview_*` tools so the agent itself can drive a preview surface (navigate / snapshot / click / type / scroll / wait), routed safely to the agent's own workspace surface. The broker dispatches through a **driver interface** so the same tool vocabulary drives a browser **or** a simulator.
3. **Coding extras** — responsive/device preview, localhost live-reload awareness, element→source jump, and flow recording.
4. **Simulator automation** — an iOS Simulator + Android emulator surface in the same Split Mode shell, driven by `simctl`/idb and `adb`, plugged into the generalized broker.

The point of the whole effort is the broker: turning Helmor's preview surfaces from "embedded Chrome + human annotation" into an **agent-operable preview** that closes the edit → see → verify loop — for web pages *and* iOS/Android simulators.

---

## 2. Current state (what is already built)

Do **not** re-build these; the PRD re-hosts and extends them.

| Capability | Status | Key locations |
| --- | --- | --- |
| Child-webview lifecycle (create/navigate/set_bounds/destroy) | BUILT | `src-tauri/src/browser/mod.rs`, `commands/browser_commands.rs` |
| Tab strip, URL bar, mode toolbar, content host | BUILT | `src/features/browser/` (`index.tsx`, `chrome/`, `content-host.tsx`, `tab-model.ts`) |
| Inspector bridge (inject + typed host↔page channel) | BUILT | `src/features/browser/bridge/`, `src-tauri/src/browser/bridge.rs` |
| Inspector modes: comment / pick / draw | BUILT | `bridge/`, `draw/`, `use-browser-bridge.ts` |
| Screenshot + full-page stitch capture | BUILT | `src/features/browser/capture/`, `src-tauri/src/browser/capture.rs` |
| `BrowserCapture` type + agent-handoff serialization | BUILT | `capture/types.ts` (`serializeCaptureContext()`) |
| CSP fallback (freeze → annotate image) | BUILT | `src/features/browser/csp-fallback/` |
| Per-workspace tab + comment persistence | BUILT | `models/browser.rs`, `models/browser_comments.rs`, `schema.rs` (`browser_sessions`/`browser_tabs`/`browser_comments`) |
| Browser-related `UiMutationEvent` variants | BUILT | `ui_sync/events.rs`, `src/lib/api.ts`, `use-ui-sync-bridge.ts` |
| Browser as **full-pane** `ShellViewMode` | BUILT | `use-selection-controller.ts`, `use-browser-session-controller.tsx`, `workspace-pane-surface.tsx` |
| **Split Mode layout** | ABSENT | — |
| **Agent control broker (`preview_*`)** | ABSENT | — |
| **Simulator surface (iOS/Android)** | ABSENT (Phase 4) | — |

---

## 3. Goals / Non-goals

### Goals
- Re-host the existing browser surface inside a **Split Mode** companion shell (closed/split/expanded) without losing any current capability.
- Let the **active agent drive the browser** through a scoped, safe `preview_*` tool surface.
- Keep the **human capture/annotation/handoff** flow (already built) working unchanged inside the new shell.
- Add the high-value coding extras that pair with agent-driving.
- **Zero perf regression** for chat/editor — validated under the perf HUD.

### Non-goals (explicitly deferred)
- **Editor ↔ browser side-by-side** — in v1 only *chat* sits beside the browser. Editor stays its own full-pane mode; editor-pairing is a future enhancement.
- **Before/after visual diff UI** — the `BrowserCapture.diff` field stays in the type, but no diff-capture UI ships in v1.
- **Generalized dockable panel system** — out of scope.
- **Full Playwright-style injected runtime** — v1 uses a lean semantic snapshot instead.

---

## 4. Decision log (resolved in grilling)

| # | Decision | Resolution |
| --- | --- | --- |
| D1 | Layout home | **Adopt Split Mode**, reuse all built internals. Current full-pane browser becomes the *expanded* state of Split Mode. Browser must be expandable. |
| D2 | Simulator | **In v1 as Phase 5.** iOS Simulator (`simctl`/idb) + Android emulator (`adb`) surfaces hosted in the same Split Mode shell, driven through the generalized broker. (Revised from initial "out of v1" once a concrete iOS+Android need surfaced.) |
| D3 | Agent control broker | **In scope — full broker, surface-agnostic** (`status`/`navigate`/`snapshot`/`click`/`type`/`press`/`scroll`/`evaluate`/`wait_for`). Tools dispatch through a driver interface (`BrowserDriver` \| `SimulatorDriver`) so the same vocabulary drives a browser or a simulator. |
| D4 | Broker delivery | Scoped **MCP tool server injected by the sidecar** per session (Helmor already injects `mcpServers` in `claude-session-manager.ts`; CLI can run as MCP server). |
| D5 | Trust model | **Default-on for the local trusted agent.** Persistent "Agent is controlling" indicator + one-click kill switch. **No mid-flow per-call prompts.** |
| D6 | `preview_snapshot` depth | **Semantic a11y tree + interactive-elements list + diagnostics + screenshot.** No Playwright runtime. |
| D7 | Surface scope | **Per-workspace surface.** An agent's `preview_*` tools target **only its own workspace's** surface; broker no-ops/rejects otherwise. |
| D8 | Split pairing | **Chat-only on the left in v1.** Editor-pairing deferred. |
| D9 | Coding extras in v1 | **Responsive/device preview, live-reload awareness, element→source jump, flow recording.** Before/after diff deferred. |
| D10 | Keybind | `Cmd+Shift+B` toggle Split Mode; `Cmd+Shift+Enter` expand/restore; keep `Cmd+Shift+C` for the existing context panel. |
| D11 | Tabs | Single live child-webview; inactive tabs persisted + suspended/throttled. |
| D12 | Capture files | Temp in `paste_cache/<session_id>/` until send, then ride `AgentSendRequest.images`. Not message-persisted artifacts in v1. |
| D13 | Panel sizing | Split panel has its own wider defaults (vs context panel), resizable, width persisted per workspace. |
| D14 | PRD slicing | **Phased horizontal layers** — each phase = one plan/issue. |

---

## 5. Architecture

### 5.1 Split Mode shell
- New layout states: **Closed** (chat uses full workspace area) → **Split** (chat left, browser companion panel right) → **Expanded** (browser takes over the workspace area; the current full-pane behavior).
- A **surface store/controller** owns the companion-panel state (open surface, layout state, panel width). The existing `use-browser-session-controller.tsx` becomes the *content* owner hosted inside the shell.
- `workspace-pane-surface.tsx` gains a split layout branch; the editor full-pane mode is untouched.
- Toggle/expand via header controls + keybinds (D10). Closing the last surface closes Split Mode.
- Panel width persisted per workspace (D13).

### 5.2 Agent control broker (surface-agnostic)
```
agent preview_* tool call
  → MCP tool server (sidecar-injected, scoped to session/workspace)   [D4]
    → Rust broker: resolve the focused Split Mode surface for THIS workspace   [D7]
      → PreviewDriver trait dispatch:
          • BrowserDriver   → browser bridge (eval_into_content / typed channel)
          • SimulatorDriver → idb/simctl (iOS) or adb (Android)
        → typed result back to the agent
```
- **Driver interface:** the broker does not know about webviews or simulators directly. It resolves the focused surface to a `PreviewDriver` implementation. `BrowserDriver` ships in Phase 2; `SimulatorDriver` (iOS + Android) ships in Phase 5 against the *same* trait, so no broker rework is needed.
- **Tool surface (v1):** `preview_status`, `preview_open`, `preview_navigate`, `preview_snapshot`, `preview_click`, `preview_type`, `preview_press`, `preview_scroll`, `preview_evaluate` (result-size-limited; browser-only — simulators return "unsupported"), `preview_wait_for`. Each tool maps to a `PreviewDriver` method; drivers that can't support a verb return a structured "unsupported on this surface" result.
- **Safety (D7):** the broker maps an agent/session to its workspace and only ever drives that workspace's surface. No surface, wrong workspace, or no Split Mode open → structured "no controllable surface" response (never controls another window).
- **Trust (D5):** while any `preview_*` mutating tool is active, the surface shows a persistent "Agent is controlling" banner/overlay with a one-click **Stop** that revokes control and returns the surface to the user. No per-call confirmation.
- **`preview_snapshot` (D6):** returns `{ url, title, visibleText, a11yTree, interactiveElements: [{ role, name, selector }], diagnostics: { console, network }, screenshotPath }`. Reuses the built selector generator (`bridge/selector.ts`), collectors (`bridge/collectors.ts`), and capture pipeline.

### 5.3 New `UiMutationEvent` variants (no ad-hoc `app.emit`)
- `BrowserAgentControlStarted { workspace_id }` / `BrowserAgentControlEnded { workspace_id }` — drive the "agent controlling" indicator.
- `BrowserSplitLayoutChanged { workspace_id, state }` — keep frontend layout state in sync if the backend initiates (e.g. agent calls `preview_open`).
- Mirror in `src/lib/api.ts`, handle in `use-ui-sync-bridge.ts`.

---

## 6. Phased plan (each phase = one plan/issue)

### Phase 1 — Split Mode shell (re-host existing surface)
**Scope:** companion-panel layout (closed/split/expanded); surface store/controller; header controls + keybinds (D10); persisted panel width (D13); re-host the existing `WorkspaceBrowserSurface` and `use-browser-session-controller` into the shell; the current full-pane browser becomes the *expanded* state. Editor mode untouched.
**Acceptance:**
- [ ] Browser opens in a right-side split panel beside chat; chat stays visible.
- [ ] `Cmd+Shift+B` toggles Split Mode; `Cmd+Shift+Enter` expands/restores; header controls do the same.
- [ ] Expanded state replicates today's full-pane browser behavior; all existing tabs/capture/inspector features work unchanged.
- [ ] Closing the last surface closes Split Mode; panel width persists per workspace.
- [ ] No regression to editor full-pane mode.

### Phase 2 — Agent control broker (surface-agnostic) + BrowserDriver
**Scope:** scoped MCP `preview_*` tool server (D4); Rust broker with per-workspace routing + safety (D7); the `PreviewDriver` trait + a `BrowserDriver` implementation (§5.2); semantic `preview_snapshot` (D6); trust UX — "agent controlling" indicator + kill switch (D5); new `UiMutationEvent` variants (§5.3).
**Acceptance:**
- [ ] The broker dispatches every `preview_*` tool through the `PreviewDriver` trait; `BrowserDriver` implements all verbs.
- [ ] Agent can `preview_open` / `preview_navigate` / `preview_snapshot` and act on results.
- [ ] Agent can `preview_click` / `preview_type` / `preview_press` / `preview_scroll` / `preview_wait_for` / `preview_evaluate` against the focused surface.
- [ ] Tools only ever target the agent's **own** workspace surface; cross-workspace/no-surface calls return a structured no-op, never controlling another window.
- [ ] Persistent "Agent is controlling" indicator shows during control; one-click Stop returns control to the user; no per-call prompts.
- [ ] Agent actions are visibly reflected in the surface UI.

### Phase 3 — Coding extras
**Scope (D9):** responsive/device preview (mobile/tablet/desktop/custom viewport via webview bounds + scale, capture at any size); localhost live-reload awareness (detect dev-server reload / HMR → auto-refresh); element→source jump (click element → open Monaco at source line, best-effort via source maps / framework debug attrs, degrade to selector-only); flow recording (record clicks/inputs/navigation as numbered repro steps). **Before/after diff deferred.**
**Acceptance:**
- [ ] Viewport presets resize the surface and capture at the selected size.
- [ ] A localhost reload/HMR auto-refreshes the surface so agent edits appear live.
- [ ] Element→source jump opens the right file/line when resolvable; degrades gracefully otherwise.
- [ ] Flow recording produces a structured, attachable repro-step list.

### Phase 4 — Simulator automation (iOS + Android)
**Scope (D2):** a `SimulatorSurface` hosted in the same Split Mode shell; a `SimulatorDriver` implementing the `PreviewDriver` trait from Phase 2. iOS: device list + boot via `xcrun simctl`, UI automation + accessibility snapshot via **idb** (`idb ui tap/text/key`, `idb ui describe-all`), screenshot via `simctl io booted screenshot`. Android: device list + boot via `adb`/`emulator`, automation via `adb shell input tap/text/keyevent`, view-hierarchy snapshot via `uiautomator dump`, screenshot via `adb exec-out screencap`. Surface displays the live screenshot stream (poll/capture) since simulator windows are separate processes, not webviews. Tooling presence is detected; missing `idb`/`adb` degrades to a clear "tooling not installed" surface state.
**Acceptance:**
- [ ] User can open a simulator surface in Split Mode, pick a booted iOS or Android device, and see its screen.
- [ ] `preview_snapshot` returns the accessibility/view hierarchy + interactive elements + screenshot for the active simulator.
- [ ] Agent can `preview_navigate` (deep-link/launch app), `preview_click` (tap by element/coords), `preview_type`, `preview_press`, `preview_scroll`, `preview_wait_for` against the simulator via the same broker.
- [ ] `preview_evaluate` returns a structured "unsupported on this surface" result for simulators.
- [ ] Trust indicator + kill switch + per-workspace routing behave identically to the browser surface.
- [ ] Missing `idb`/`adb`/Xcode tooling degrades to a clear, documented surface state (no crash).

### Phase 5 — Perf hardening
**Scope:** validate every performance criterion under the perf HUD (`VITE_HELMOR_PERF_HUD=1`), across both browser and simulator surfaces.
**Acceptance:**
- [ ] Split panel lazy-mounts; content webview created only on first use.
- [ ] Background/inactive tabs suspended/throttled; only the visible tab is live (D11).
- [ ] Screenshot/diff/full-page stitch run off the React main thread.
- [ ] Bridge scripts passive until a mode is activated (zero overhead in Navigate).
- [ ] Tearing down the surface fully releases the webview + memory.
- [ ] No dropped frames in chat/editor when opening/closing/splitting/expanding or switching tabs.

---

## 7. Capture payload & handoff (unchanged contract)

The human capture flow keeps producing a `BrowserCapture` (`capture/types.ts`): screenshot paths + structured comments/picks/drawings/console/network. It attaches in the composer (badge node mirroring `ImageBadgeNode`) and rides `AgentSendRequest.images` (absolute paths) + serialized text, so **terminal agents (Claude Code / Codex) work too**. Capture files stay temp in `paste_cache/<session_id>/` until send (D12). Handoff targets: attach to active agent, spawn new agent, terminal-agent-safe.

---

## 8. Data & test requirements

- Reuse existing tables (`browser_sessions` / `browser_tabs` / `browser_comments`). New persisted state limited to **per-workspace panel width / layout state** (small migration in `schema.rs` if persisted server-side; may live in app settings instead).
- 🚨 **Any change touching `pipeline/`, `agents/` persistence, `schema.rs`, or the `session_messages` storage shape MUST add snapshot coverage** in `src-tauri/tests/`. The broker and capture handoff must not alter the stored message shape without a snapshot test.
- Pure logic (broker routing decisions, snapshot serialization, viewport math, flow-step recording) gets unit tests co-located with source.

---

## 9. Risks / open questions

- Native webview overlay/positioning fidelity in the *split* layout across macOS resize, overlay traffic-light title bar, and fullscreen (new vs the full-pane case).
- Broker ↔ focused-surface routing when multiple sessions exist in one workspace (D7 says per-workspace surface — confirm there is exactly one controllable surface per workspace at all times).
- `preview_evaluate` result-size limits and sandboxing.
- CSP-blocked sites: agent control degrades to screenshot-only context (no DOM driving) — define the structured response the agent receives.
- Element→source reliability is framework-dependent; ship best-effort with selector-only fallback.
- Live-reload detection across dev servers without a universal HMR signal.

---

## 10. Deferred to follow-up PRDs
- Editor ↔ browser side-by-side split.
- Before/after visual diff capture + UI.
- Generalized dockable multi-surface panel system.
- Heavier Playwright-style locator runtime if the semantic snapshot proves insufficient.

---

_Decisions captured from a `/grill-me` interview. Grounded in the existing browser surface (`src/features/browser/`, `src-tauri/src/browser/`), the sidecar MCP injection path, and the `UiMutationEvent` pattern._

---

## Codex broker follow-up

Phase 2 wires the `preview_*` agent-control tools into **Claude** sessions only, via the in-process SDK MCP server (`sidecar/src/preview-mcp.ts`, merged into `query({ options: { mcpServers } })` in `claude-session-manager.ts`). Codex does **not** consume in-process SDK servers: it receives MCP servers through CLI config (`-c mcp_servers={...}` in `sidecar/src/codex-app-server.ts::buildCodexAppServerArgs`), which requires each server to be a spawnable stdio process.

To give Codex agents the same `preview_*` tools, ship a thin **stdio MCP shim** binary (e.g. `helmor-cli mcp preview --workspace <id>`) whose tools forward to the same `preview.*` host methods the Claude path already uses, and inject it into the Codex `mcp_servers` config keyed by the agent's workspace id. The broker, `PreviewDriver`, `BrowserDriver`, and the `preview.*` host-method routing are all agent-agnostic, so only the transport shim is new.

Scope: follow-up PR, after the Claude path is validated end-to-end.
