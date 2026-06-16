# Simulator Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SimulatorDriver` (iOS via `simctl`/`idb`, Android via `adb`/`uiautomator`) implementing the Phase 2 `PreviewDriver` trait, plus a polled-screenshot simulator surface hosted in the Phase 1 Split Mode shell, so agents can preview-navigate/click/type/press/scroll/wait against booted simulators exactly as they do the browser.

**Architecture:** A pure `SimCommand` argv builder + a `CommandExecutor` trait (real impl shells out via `std::process::Command`; tests inject a recording fake) form the unit-testable seam — no test ever shells out. `SimulatorDriver` builds argv through `SimCommand`, runs them through the executor, and parses real `idb ui describe-all` JSON / `uiautomator dump` XML into a shared `PreviewSnapshot`. The driver registers in `preview/broker.rs` surface resolution; new Tauri commands manage device listing/boot/screenshot and surface lifecycle (mirroring `browser/mod.rs`'s `Mutex<Option<...>>` slot). The frontend `src/features/simulator/` mirrors `src/features/browser/` but its content host polls `simulator_screenshot()` and renders an `<img>` instead of embedding a webview.

**Tech Stack:** Rust (Tauri v2, std::process::Command, serde, insta), React 19, TypeScript, Vitest. External tools: xcrun simctl, idb (iOS), adb + uiautomator (Android).

---

## Prerequisites

This phase runs AFTER Phase 1 (Split Mode shell) and Phase 2 (PreviewDriver trait + broker). It consumes these exact symbols — do NOT redefine them:

From **`src-tauri/src/preview/driver.rs`** (Phase 2, shapes in `00-shared-contracts.md`):
- `PreviewDriver` trait (the 10 async methods: `status`, `open`, `navigate`, `snapshot`, `click`, `type_text`, `press`, `scroll`, `evaluate`, `wait_for`).
- `pub type PreviewResult<T> = Result<T, PreviewError>;`
- `PreviewError { NoSurface, WrongWorkspace, Unsupported(String), Timeout, Driver(String) }`
- `PreviewStatus { surface_kind, present, url, title }`
- `PreviewSnapshot { url, title, visible_text, a11y_tree, interactive_elements, diagnostics, screenshot_path }`
- `InteractiveElement { role, name, selector }`
- `PreviewDiagnostics { console, network }`
- `PreviewTarget { Selector(String), Role { role, name }, Coords { x, y } }`
- `WaitCondition { Selector(String), Text(String), Url(String), Ready }`
- `PreviewSurfaceKind { Browser, SimulatorIos, SimulatorAndroid }`

From **`src-tauri/src/preview/broker.rs`** (Phase 2):
- `pub async fn dispatch(app, workspace_id, call) -> PreviewResult<PreviewValue>` and its surface-resolution path (the broker resolves the focused surface for a workspace; Phase 4 extends resolution to return a `SimulatorDriver` when a simulator surface is open).
- Active-control `Mutex<HashSet<String>>` (kill switch / trust banner plumbing — reused unchanged).

From **`src-tauri/src/browser/capture.rs`** (existing):
- `pub fn save_capture_to_cache(paste_root: &Path, session_id: &str, data_b64: &str) -> Result<String>` and the per-session paste-cache pattern (Task 8 adds a raw-bytes sibling `save_simulator_png` reusing `maintenance::paste_cache::destination_dir`).

From **Phase 1 shell** (`src/shell/components/workspace-pane-surface.tsx`, `use-browser-session-controller.tsx`): the Split-Mode pane that renders `WorkspaceBrowserSurface`. Phase 4 adds a sibling `WorkspaceSimulatorSurface` branch.

From **Phase 2 frontend**: `AgentControlBanner` (`src/features/browser/agent-control-banner.tsx`) and the `BrowserAgentControlStarted`/`Ended` UiMutationEvent plumbing — reused verbatim for simulator surfaces (the banner is surface-agnostic; pass it the workspace id + surface kind).

---

## File Structure

```
src-tauri/src/preview/
  simulator_driver.rs        # NEW — SimulatorDriver + SimCommand + CommandExecutor + parsers
  broker.rs                  # EDIT — resolve SimulatorDriver in surface resolution
src-tauri/src/simulator/
  mod.rs                     # NEW — device-handle slot (Mutex<Option<SimulatorSurfaceState>>), lifecycle
src-tauri/src/commands/
  simulator_commands.rs      # NEW — Tauri commands
src-tauri/src/browser/capture.rs   # EDIT — add save_simulator_png raw-bytes sibling
src-tauri/src/lib.rs               # EDIT — register commands + mod simulator
src-tauri/tests/
  simulator_parsing.rs       # NEW — insta snapshots for describe-all / uiautomator parsing
  fixtures/simulator/
    idb-describe-all.json    # NEW — real idb ui describe-all sample
    uiautomator-dump.xml     # NEW — real uiautomator dump sample
src/features/simulator/
  index.tsx                  # NEW — WorkspaceSimulatorSurface (mirrors browser/index.tsx)
  device-picker.tsx          # NEW — booted-device dropdown
  screenshot-host.tsx        # NEW — polls simulator_screenshot, renders <img>
  screenshot-host.test.ts    # NEW — vitest
  device-picker.test.tsx     # NEW — vitest
src/shell/components/workspace-pane-surface.tsx   # EDIT — add simulator branch
src/lib/api.ts                                    # EDIT — typed command wrappers + types
```

---

## Task 1 — `SimCommand` argv builder (pure, iOS)

The single unit-testable seam: a struct that builds the exact argv for each tool invocation. No process is spawned here.

**Files:** `src-tauri/src/preview/simulator_driver.rs`

- [ ] Write a failing test `simcommand_ios_argv` (inline `#[cfg(test)]`):
```rust
#[test]
fn simcommand_ios_argv() {
    assert_eq!(
        SimCommand::ios_list_devices().argv(),
        vec!["xcrun", "simctl", "list", "devices", "--json"]
    );
    assert_eq!(
        SimCommand::ios_boot("ABC-123").argv(),
        vec!["xcrun", "simctl", "boot", "ABC-123"]
    );
    assert_eq!(
        SimCommand::ios_screenshot("/tmp/s.png").argv(),
        vec!["xcrun", "simctl", "io", "booted", "screenshot", "/tmp/s.png"]
    );
    assert_eq!(
        SimCommand::ios_open_url("myapp://deep/link").argv(),
        vec!["xcrun", "simctl", "openurl", "booted", "myapp://deep/link"]
    );
    assert_eq!(SimCommand::idb_describe_all().argv(), vec!["idb", "ui", "describe-all"]);
    assert_eq!(SimCommand::idb_tap(10.0, 20.0).argv(), vec!["idb", "ui", "tap", "10", "20"]);
    assert_eq!(SimCommand::idb_text("hello world").argv(), vec!["idb", "ui", "text", "hello world"]);
    assert_eq!(SimCommand::idb_key("4").argv(), vec!["idb", "ui", "key", "4"]);
}
```
- [ ] Run `cd src-tauri && cargo test simcommand_ios_argv` → expect FAIL (no `SimCommand`).
- [ ] Implement minimal `SimCommand`:
```rust
pub struct SimCommand {
    program: &'static str,
    args: Vec<String>,
}
impl SimCommand {
    fn new(program: &'static str, args: Vec<String>) -> Self { Self { program, args } }
    pub fn argv(&self) -> Vec<String> {
        let mut v = vec![self.program.to_string()];
        v.extend(self.args.iter().cloned());
        v
    }
    pub fn ios_list_devices() -> Self { Self::new("xcrun", vec!["simctl","list","devices","--json"].into_iter().map(String::from).collect()) }
    pub fn ios_boot(udid: &str) -> Self { Self::new("xcrun", vec!["simctl".into(),"boot".into(),udid.into()]) }
    pub fn ios_screenshot(path: &str) -> Self { Self::new("xcrun", vec!["simctl".into(),"io".into(),"booted".into(),"screenshot".into(),path.into()]) }
    pub fn ios_open_url(url: &str) -> Self { Self::new("xcrun", vec!["simctl".into(),"openurl".into(),"booted".into(),url.into()]) }
    pub fn idb_describe_all() -> Self { Self::new("idb", vec!["ui".into(),"describe-all".into()]) }
    pub fn idb_tap(x: f64, y: f64) -> Self { Self::new("idb", vec!["ui".into(),"tap".into(),fmt_coord(x),fmt_coord(y)]) }
    pub fn idb_text(text: &str) -> Self { Self::new("idb", vec!["ui".into(),"text".into(),text.into()]) }
    pub fn idb_key(code: &str) -> Self { Self::new("idb", vec!["ui".into(),"key".into(),code.into()]) }
}
// Coordinates: integer pixels for idb/adb; drop trailing `.0`.
fn fmt_coord(v: f64) -> String { (v.round() as i64).to_string() }
```
- [ ] Run `cd src-tauri && cargo test simcommand_ios_argv` → expect PASS.
- [ ] Commit: `feat(preview): SimCommand iOS argv builder`.

## Task 2 — `SimCommand` argv builder (Android)

**Files:** `src-tauri/src/preview/simulator_driver.rs`

- [ ] Write a failing test `simcommand_android_argv`:
```rust
#[test]
fn simcommand_android_argv() {
    assert_eq!(SimCommand::adb_devices().argv(), vec!["adb", "devices"]);
    assert_eq!(SimCommand::adb_tap(10.0, 20.0).argv(), vec!["adb","shell","input","tap","10","20"]);
    assert_eq!(SimCommand::adb_text("hi").argv(), vec!["adb","shell","input","text","hi"]);
    assert_eq!(SimCommand::adb_keyevent("66").argv(), vec!["adb","shell","input","keyevent","66"]);
    assert_eq!(SimCommand::adb_screencap().argv(), vec!["adb","exec-out","screencap","-p"]);
    assert_eq!(SimCommand::adb_uiautomator_dump().argv(), vec!["adb","exec-out","uiautomator","dump","/dev/tty"]);
    assert_eq!(SimCommand::adb_openurl("myapp://x").argv(), vec!["adb","shell","am","start","-a","android.intent.action.VIEW","-d","myapp://x"]);
}
```
- [ ] Run `cd src-tauri && cargo test simcommand_android_argv` → expect FAIL.
- [ ] Implement the `adb_*` constructors mirroring Task 1 (program `"adb"`). `adb_uiautomator_dump` streams XML to stdout via `/dev/tty`; `adb_screencap` returns raw PNG on stdout.
- [ ] Run `cd src-tauri && cargo test simcommand_android_argv` → expect PASS.
- [ ] Commit: `feat(preview): SimCommand Android argv builder`.

## Task 3 — `CommandExecutor` trait + recording fake

The trait decouples argv from process execution. Real impl shells out; tests use a fake that records calls and returns canned stdout. NEVER shell out in tests.

**Files:** `src-tauri/src/preview/simulator_driver.rs`

- [ ] Write a failing test `fake_executor_records_and_replies`:
```rust
#[test]
fn fake_executor_records_and_replies() {
    let fake = FakeExecutor::new().with_response("idb ui describe-all", b"[]".to_vec());
    let out = fake.run(&SimCommand::idb_describe_all()).unwrap();
    assert_eq!(out.stdout, b"[]");
    assert_eq!(fake.calls(), vec![vec!["idb","ui","describe-all"]]);
}
```
- [ ] Run `cd src-tauri && cargo test fake_executor_records_and_replies` → expect FAIL.
- [ ] Implement:
```rust
pub struct CommandOutput { pub stdout: Vec<u8>, pub status_ok: bool, pub stderr: String }

pub trait CommandExecutor: Send + Sync {
    fn run(&self, cmd: &SimCommand) -> PreviewResult<CommandOutput>;
}

/// Real executor — the ONLY place that spawns a process.
pub struct ProcessExecutor;
impl CommandExecutor for ProcessExecutor {
    fn run(&self, cmd: &SimCommand) -> PreviewResult<CommandOutput> {
        let argv = cmd.argv();
        let output = std::process::Command::new(&argv[0])
            .args(&argv[1..])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    PreviewError::Unsupported(format!("tool not installed: {}", argv[0]))
                } else {
                    PreviewError::Driver(format!("{}: {e}", argv[0]))
                }
            })?;
        Ok(CommandOutput {
            stdout: output.stdout,
            status_ok: output.status.success(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

#[cfg(test)]
pub struct FakeExecutor { /* responses keyed by joined argv, recorded calls */ }
// `.with_response(key, stdout)`, `.run` records `cmd.argv()` and returns the
// canned CommandOutput (status_ok=true) or PreviewError::Driver("no fake") if unkeyed.
// `.calls() -> Vec<Vec<String>>`.
```
- [ ] Run `cd src-tauri && cargo test fake_executor_records_and_replies` → expect PASS.
- [ ] Commit: `feat(preview): CommandExecutor trait + recording fake`.

## Task 4 — Tooling-presence detection (pure, no panic)

**Files:** `src-tauri/src/preview/simulator_driver.rs`

- [ ] Write a failing test `tooling_presence_structured`:
```rust
#[test]
fn tooling_presence_structured() {
    // Pure mapping: which binaries each platform needs.
    assert_eq!(required_tools(PreviewSurfaceKind::SimulatorIos), vec!["xcrun", "idb"]);
    assert_eq!(required_tools(PreviewSurfaceKind::SimulatorAndroid), vec!["adb"]);

    // A fake executor that errors NotFound for `idb` yields a structured state.
    let fake = FakeExecutor::new().with_missing("idb");
    let report = check_tooling(&fake, PreviewSurfaceKind::SimulatorIos);
    assert!(!report.ready);
    assert_eq!(report.missing, vec!["idb"]);
}
```
- [ ] Run `cd src-tauri && cargo test tooling_presence_structured` → expect FAIL.
- [ ] Implement `required_tools(kind) -> Vec<&'static str>` and a `ToolingReport { ready: bool, missing: Vec<String> }` (serde camelCase, crosses IPC). `check_tooling` probes each tool via a no-op `--help`/version `SimCommand` (or `FakeExecutor::with_missing` in tests) and collects `Unsupported` results into `missing`. Never panics: a missing tool is data, not an error.
- [ ] Run `cd src-tauri && cargo test tooling_presence_structured` → expect PASS.
- [ ] Commit: `feat(preview): simulator tooling-presence detection`.

## Task 5 — Parse `idb ui describe-all` JSON → snapshot pieces (insta)

**Files:** `src-tauri/src/preview/simulator_driver.rs`, `src-tauri/tests/simulator_parsing.rs`, `src-tauri/tests/fixtures/simulator/idb-describe-all.json`

- [ ] Create the REAL fixture `idb-describe-all.json` (idb emits a JSON array of a11y nodes):
```json
[
  {"AXFrame":"{{0, 44}, {390, 50}}","AXUniqueId":"login-title","frame":{"y":44,"x":0,"width":390,"height":50},"role_description":"text","AXLabel":"Sign in","AXValue":null,"type":"StaticText","title":null},
  {"AXFrame":"{{20, 120}, {350, 44}}","AXUniqueId":"email-field","frame":{"y":120,"x":20,"width":350,"height":44},"role_description":"text field","AXLabel":"Email","AXValue":"","type":"TextField","title":null},
  {"AXFrame":"{{20, 320}, {350, 50}}","AXUniqueId":"submit-btn","frame":{"y":320,"x":20,"width":350,"height":50},"role_description":"button","AXLabel":"Continue","AXValue":null,"type":"Button","title":"Continue"}
]
```
- [ ] Write a failing insta test in `simulator_parsing.rs`:
```rust
use helmor_lib::preview::simulator_driver::parse_idb_describe_all;

#[test]
fn parse_idb_describe_all_snapshot() {
    let json = include_str!("fixtures/simulator/idb-describe-all.json");
    let parsed = parse_idb_describe_all(json).unwrap();
    insta::assert_json_snapshot!(parsed);
}
```
(`parsed` is `IdbParse { a11y_tree: serde_json::Value, interactive_elements: Vec<InteractiveElement>, visible_text: String, rects: Vec<ElementRect> }` where `ElementRect { selector, x, y, width, height }` — `rects` feeds click target resolution; serialize it for the snapshot too.)
- [ ] Run `cd src-tauri && cargo test --test simulator_parsing parse_idb_describe_all` → expect FAIL.
- [ ] Implement `parse_idb_describe_all(&str) -> PreviewResult<IdbParse>`:
  - `a11y_tree` = the parsed JSON value verbatim.
  - For each node, derive `selector` = `AXUniqueId` (fallback `#<index>`), `role` = `type`, `name` = `AXLabel`/`title`. Push to `interactive_elements` when `type` ∈ {`Button`,`TextField`,`Link`,`Switch`,`Cell`} (tappables).
  - `rects` from each node's `frame` (center = x+width/2, y+height/2 computed at click time).
  - `visible_text` = space-joined non-empty `AXLabel`/`AXValue`/`title`.
- [ ] Run test → expect FAIL (no snapshot); `INSTA_UPDATE=always cargo test --test simulator_parsing`, review the `.snap`, confirm shape is intended, then re-run → PASS.
- [ ] Commit: `feat(preview): parse idb describe-all into snapshot pieces`.

## Task 6 — Parse `uiautomator dump` XML → snapshot pieces (insta)

**Files:** `src-tauri/src/preview/simulator_driver.rs`, `src-tauri/tests/simulator_parsing.rs`, `src-tauri/tests/fixtures/simulator/uiautomator-dump.xml`

- [ ] Create the REAL fixture `uiautomator-dump.xml`:
```xml
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" clickable="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Sign in" resource-id="com.example.app:id/title" class="android.widget.TextView" package="com.example.app" content-desc="" clickable="false" bounds="[48,132][1032,210]" />
    <node index="1" text="" resource-id="com.example.app:id/email" class="android.widget.EditText" package="com.example.app" content-desc="Email" clickable="true" bounds="[48,360][1032,492]" />
    <node index="2" text="Continue" resource-id="com.example.app:id/submit" class="android.widget.Button" package="com.example.app" content-desc="" clickable="true" bounds="[48,960][1032,1092]" />
  </node>
</hierarchy>
```
- [ ] Write a failing insta test:
```rust
use helmor_lib::preview::simulator_driver::parse_uiautomator_dump;

#[test]
fn parse_uiautomator_dump_snapshot() {
    let xml = include_str!("fixtures/simulator/uiautomator-dump.xml");
    let parsed = parse_uiautomator_dump(xml).unwrap();
    insta::assert_json_snapshot!(parsed);
}
```
(Returns the same `IdbParse`-shaped struct — reuse one `SnapshotParse` type for both parsers.)
- [ ] Run `cd src-tauri && cargo test --test simulator_parsing parse_uiautomator_dump` → expect FAIL.
- [ ] Implement `parse_uiautomator_dump(&str) -> PreviewResult<SnapshotParse>` (parse with `quick-xml` — already a transitive dep; if absent, add to `Cargo.toml`):
  - `selector` = `resource-id` (fallback `content-desc`, then `#<index-path>`), `role` = last `.`-segment of `class`, `name` = `text`/`content-desc`.
  - `interactive_elements` = nodes with `clickable="true"`.
  - `bounds="[x1,y1][x2,y2]"` → `ElementRect { x: x1, y: y1, width: x2-x1, height: y2-y1 }`.
  - `a11y_tree` = a nested JSON object mirroring the node hierarchy. `visible_text` = space-joined non-empty `text`.
- [ ] Run → FAIL (no snapshot); `INSTA_UPDATE=always`, review, re-run → PASS.
- [ ] Commit: `feat(preview): parse uiautomator dump into snapshot pieces`.

## Task 7 — `SimulatorDriver` implements `PreviewDriver` (over the fake executor)

**Files:** `src-tauri/src/preview/simulator_driver.rs`

- [ ] Write a failing test `driver_snapshot_and_click_and_evaluate` (uses `FakeExecutor`, never shells out):
```rust
#[tokio::test]
async fn driver_snapshot_and_click_and_evaluate() {
    let json = include_str!("../../tests/fixtures/simulator/idb-describe-all.json");
    let fake = FakeExecutor::new()
        .with_response("idb ui describe-all", json.as_bytes().to_vec());
    let driver = SimulatorDriver::new(PreviewSurfaceKind::SimulatorIos, "UDID-1".into(), Arc::new(fake));

    // snapshot maps describe-all → PreviewSnapshot.
    let snap = driver.snapshot().await.unwrap();
    assert!(snap.interactive_elements.iter().any(|e| e.selector == "submit-btn"));

    // click by Role → resolves rect from last snapshot → taps center.
    driver.click(PreviewTarget::Role { role: "Button".into(), name: "Continue".into() }).await.unwrap();
    let calls = driver.executor_calls();
    // center of [20,320]+[350,50] => (195, 345)
    assert!(calls.iter().any(|c| c == &vec!["idb","ui","tap","195","345"]));

    // Coords tap directly.
    driver.click(PreviewTarget::Coords { x: 5.0, y: 7.0 }).await.unwrap();
    assert!(driver.executor_calls().iter().any(|c| c == &vec!["idb","ui","tap","5","7"]));

    // evaluate is unsupported on simulators.
    let err = driver.evaluate("1+1".into()).await.unwrap_err();
    assert!(matches!(err, PreviewError::Unsupported(_)));
}
```
- [ ] Run `cd src-tauri && cargo test driver_snapshot_and_click_and_evaluate` → expect FAIL.
- [ ] Implement `SimulatorDriver { kind: PreviewSurfaceKind, udid: String, executor: Arc<dyn CommandExecutor>, last_rects: Mutex<Vec<ElementRect>> }`:
  - `snapshot()`: iOS runs `idb_describe_all` → `parse_idb_describe_all`; Android runs `adb_uiautomator_dump` → `parse_uiautomator_dump`. Cache `rects` in `last_rects`. Take a screenshot (Task 8) and set `screenshot_path`. `diagnostics` = empty (`console: []`, `network: []`).
  - `click(target)`: `Coords` → tap directly; `Role`/`Selector` → resolve `ElementRect` from `last_rects` (match selector, or role+name), tap rect center; missing → `PreviewError::Driver("element not found")`. iOS `idb_tap`, Android `adb_tap`.
  - `type_text`: tap target first (if not Coords), then `idb_text`/`adb_text`.
  - `press(key)`: `idb_key`/`adb_keyevent`.
  - `scroll`: synthesize via `idb` swipe / `adb shell input swipe` from a center anchor by `(dx,dy)` (add `SimCommand::idb_swipe`/`adb_swipe` constructors in this task with a small argv test).
  - `navigate(url)`/`open(target)`: `ios_open_url`/`adb_openurl` (deep-link / launch).
  - `evaluate`: `Err(PreviewError::Unsupported("evaluate is browser-only".into()))`.
  - `wait_for`: poll `snapshot()` up to `timeout_ms` (50ms cadence): `Selector`/`Text` matched against snapshot; `Ready` returns immediately; timeout → `PreviewError::Timeout`.
  - `status()`: `PreviewStatus { surface_kind: self.kind, present: true, url: None, title: None }`.
  - Add `#[cfg(test)] fn executor_calls(&self)` proxying the fake.
- [ ] Run `cd src-tauri && cargo test driver_snapshot_and_click_and_evaluate` → expect PASS.
- [ ] Commit: `feat(preview): SimulatorDriver implements PreviewDriver`.

## Task 8 — Persist simulator screenshots into the paste-cache

**Files:** `src-tauri/src/browser/capture.rs`

- [ ] Write a failing test `save_simulator_png_writes_into_cache`:
```rust
#[test]
fn save_simulator_png_writes_into_cache() {
    let tmp = tempfile::tempdir().unwrap();
    let png = decode_base64_png(/* a tiny valid base64 PNG constant */ TINY_PNG_B64).unwrap();
    let path = save_simulator_to_cache(tmp.path(), "sess-1", &png).unwrap();
    assert!(path.ends_with(".png"));
    assert!(std::path::Path::new(&path).exists());
}
```
- [ ] Run `cd src-tauri && cargo test save_simulator_png_writes_into_cache` → expect FAIL.
- [ ] Implement `save_simulator_to_cache(paste_root, session_id, png_bytes: &[u8]) -> Result<String>` mirroring `save_stitched_png` (filename `simulator-<uuid>.png`) + a thin `save_simulator_png(session_id, png_bytes)` resolving `paste_cache_dir()`. `SimulatorDriver::snapshot` (Task 7) calls the iOS `simctl io booted screenshot <tmp>` → read bytes, or Android `adb exec-out screencap -p` stdout bytes → `save_simulator_png`.
- [ ] Run → expect PASS.
- [ ] Commit: `feat(preview): persist simulator screenshots to paste-cache`.

## Task 9 — Simulator surface slot + lifecycle (mirror `browser/mod.rs`)

**Files:** `src-tauri/src/simulator/mod.rs`, `src-tauri/src/lib.rs` (add `mod simulator;`)

- [ ] Write a failing test `slot_open_close_round_trips`:
```rust
#[test]
fn slot_open_close_round_trips() {
    open_surface("ws-1", PreviewSurfaceKind::SimulatorIos, "UDID-1").unwrap();
    let state = current().unwrap();
    assert_eq!(state.workspace_id, "ws-1");
    assert_eq!(state.udid, "UDID-1");
    close_surface("ws-1").unwrap();
    assert!(current().is_none());
}
```
- [ ] Run `cd src-tauri && cargo test slot_open_close_round_trips` → expect FAIL.
- [ ] Implement a process-global `fn slot() -> &'static Mutex<Option<SimulatorSurfaceState>>` (OnceLock, exactly like `browser/mod.rs`). `SimulatorSurfaceState { workspace_id: String, kind: PreviewSurfaceKind, udid: String }`. `open_surface`, `close_surface(workspace_id)` (no-op if mismatched/absent), `current() -> Option<SimulatorSurfaceState>`, and a `with(f)` accessor. Broker resolution (Task 11) reads `current()` to build a `SimulatorDriver`.
- [ ] Run → expect PASS.
- [ ] Commit: `feat(simulator): surface slot + lifecycle`.

## Task 10 — Tauri commands

**Files:** `src-tauri/src/commands/simulator_commands.rs`, `src-tauri/src/lib.rs`

- [ ] Write a failing test `list_devices_parses_ios_json` (pure inner fn over the fake executor):
```rust
#[test]
fn list_devices_parses_ios_json() {
    let json = r#"{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-17-0":[
      {"udid":"UDID-1","name":"iPhone 15","state":"Booted"},
      {"udid":"UDID-2","name":"iPhone SE","state":"Shutdown"}]}}"#;
    let fake = FakeExecutor::new().with_response("xcrun simctl list devices --json", json.as_bytes().to_vec());
    let devices = list_devices_inner(PreviewSurfaceKind::SimulatorIos, &fake).unwrap();
    assert_eq!(devices.iter().filter(|d| d.booted).count(), 1);
    assert_eq!(devices[0].udid, "UDID-1");
}
```
(Add an Android variant parsing `adb devices` table lines → `SimDevice { udid, name, booted }`.)
- [ ] Run `cd src-tauri && cargo test list_devices_parses_ios_json` → expect FAIL.
- [ ] Implement `list_devices_inner(kind, executor) -> Result<Vec<SimDevice>>` (serde camelCase) + commands (mirror `browser_commands.rs` shape — `#[tauri::command] async fn -> CmdResult<T>`, `run_blocking` for the pure/blocking parts, direct for slot lifecycle):
  - `simulator_list_devices(kind) -> CmdResult<Vec<SimDevice>>`
  - `simulator_boot(udid) -> CmdResult<()>`
  - `simulator_screenshot() -> CmdResult<String>` (path; reads `current()` udid+kind, captures via Task 8, returns path)
  - `simulator_open_surface(workspace_id, kind, udid) -> CmdResult<()>` (calls `simulator::open_surface`)
  - `simulator_close_surface(workspace_id) -> CmdResult<()>`
- [ ] Run → expect PASS.
- [ ] Register all five in `lib.rs` `generate_handler![...]` (after the `browser_*` block at ~line 582).
- [ ] Run `cd src-tauri && cargo build` → expect PASS.
- [ ] Commit: `feat(simulator): Tauri commands + handler registration`.

## Task 11 — Wire `SimulatorDriver` into broker surface resolution

**Files:** `src-tauri/src/preview/broker.rs`

- [ ] Write a failing test `broker_resolves_simulator_surface` (using `simulator::open_surface` + a test-injected `ProcessExecutor` substitute, or assert resolution returns a driver whose `status().surface_kind` is `SimulatorIos`):
```rust
#[tokio::test]
async fn broker_resolves_simulator_surface() {
    crate::simulator::open_surface("ws-1", PreviewSurfaceKind::SimulatorIos, "UDID-1").unwrap();
    let driver = resolve_surface("ws-1").unwrap();   // returns Box<dyn PreviewDriver>
    let status = driver.status().await.unwrap();
    assert_eq!(status.surface_kind, PreviewSurfaceKind::SimulatorIos);
    crate::simulator::close_surface("ws-1").unwrap();
}
```
- [ ] Run `cd src-tauri && cargo test broker_resolves_simulator_surface` → expect FAIL.
- [ ] Extend `resolve_surface` (the Phase 2 helper inside `dispatch`): if `simulator::current()` matches `workspace_id`, return `Box::new(SimulatorDriver::new(kind, udid, Arc::new(ProcessExecutor)))`; else fall through to the existing browser-surface resolution. Unchanged: `NoSurface` when neither is present, and the active-control `Mutex<HashSet>` plumbing (trust banner + kill switch apply identically).
- [ ] Run → expect PASS.
- [ ] Commit: `feat(preview): broker resolves simulator surface`.

## Task 12 — Frontend: API wrappers + types

**Files:** `src/lib/api.ts`

- [ ] Add typed wrappers + types (camelCase, matching the Rust serde):
```ts
export type SimSurfaceKind = "simulatorIos" | "simulatorAndroid";
export type SimDevice = { udid: string; name: string; booted: boolean };

export const simulatorListDevices = (kind: SimSurfaceKind) =>
  invoke<SimDevice[]>("simulator_list_devices", { kind });
export const simulatorBoot = (udid: string) => invoke<void>("simulator_boot", { udid });
export const simulatorScreenshot = () => invoke<string>("simulator_screenshot");
export const simulatorOpenSurface = (workspaceId: string, kind: SimSurfaceKind, udid: string) =>
  invoke<void>("simulator_open_surface", { workspaceId, kind, udid });
export const simulatorCloseSurface = (workspaceId: string) =>
  invoke<void>("simulator_close_surface", { workspaceId });
```
(No new test file — covered indirectly by Task 13/14 via `vi.mock("@/lib/api", ...)`.)
- [ ] Run `bun run typecheck` → expect PASS.
- [ ] Commit: `feat(simulator): frontend API wrappers`.

## Task 13 — Frontend: screenshot host (polls + renders `<img>`)

**Files:** `src/features/simulator/screenshot-host.tsx`, `src/features/simulator/screenshot-host.test.ts`

- [ ] Write a failing vitest `screenshot-host.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { nextScreenshotSrc } from "./screenshot-host";

describe("nextScreenshotSrc", () => {
  it("converts a cache path to a cache-busted asset src", () => {
    const a = nextScreenshotSrc("/cache/simulator-1.png", 100);
    const b = nextScreenshotSrc("/cache/simulator-1.png", 200);
    expect(a).not.toEqual(b); // cache-busted by poll tick
    expect(a).toContain("simulator-1.png");
  });
});
```
- [ ] Run `bun x vitest run src/features/simulator/screenshot-host.test.ts` → expect FAIL.
- [ ] Implement `ScreenshotHost` (mirrors `content-host.tsx` lifecycle but renders an `<img>`): on an interval (~500ms) call `simulatorScreenshot()`, then set `src = nextScreenshotSrc(path, Date.now())` (path → `convertFileSrc(path) + "?t=" + tick`, the cache-buster). All IPC guarded so it no-ops under jsdom. Export pure `nextScreenshotSrc(path, tick)` for the test.
- [ ] Run → expect PASS.
- [ ] Commit: `feat(simulator): polled screenshot host`.

## Task 14 — Frontend: device picker

**Files:** `src/features/simulator/device-picker.tsx`, `src/features/simulator/device-picker.test.tsx`

- [ ] Write a failing vitest `device-picker.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/lib/api", () => ({
  simulatorListDevices: vi.fn().mockResolvedValue([
    { udid: "U1", name: "iPhone 15", booted: true },
    { udid: "U2", name: "iPhone SE", booted: false },
  ]),
}));
import { DevicePicker } from "./device-picker";

it("lists booted devices first and labels shutdown ones", async () => {
  render(<DevicePicker kind="simulatorIos" selectedUdid={null} onSelect={() => {}} />);
  expect(await screen.findByText(/iPhone 15/)).toBeInTheDocument();
});
```
- [ ] Run `bun x vitest run src/features/simulator/device-picker.test.tsx` → expect FAIL.
- [ ] Implement `DevicePicker` (a `Select` of devices from `simulatorListDevices(kind)`; booted devices selectable, shutdown ones show a "boot" affordance calling `simulatorBoot`). All clickable elements get `cursor-pointer`.
- [ ] Run → expect PASS.
- [ ] Commit: `feat(simulator): device picker`.

## Task 15 — Frontend: `WorkspaceSimulatorSurface` + shell wiring

**Files:** `src/features/simulator/index.tsx`, `src/shell/components/workspace-pane-surface.tsx`

- [ ] Write a failing vitest `index.test.tsx` asserting the surface renders the device picker, the screenshot host, and the reused `AgentControlBanner` when control is active:
```tsx
// renders WorkspaceSimulatorSurface with workspaceId + kind; asserts
// getByLabelText("Workspace simulator surface") and the device picker present.
```
- [ ] Run `bun x vitest run src/features/simulator/index.test.tsx` → expect FAIL.
- [ ] Implement `WorkspaceSimulatorSurface` mirroring `browser/index.tsx` structure: a chrome bar (`TrafficLightSpacer` + `DevicePicker` + Close), the `ScreenshotHost`, and `<AgentControlBanner workspaceId={...} surfaceKind={kind} />` (reused from Phase 2). On mount call `simulatorOpenSurface(workspaceId, kind, udid)`; on unmount `simulatorCloseSurface(workspaceId)`. Guard all IPC for jsdom.
- [ ] Run → expect PASS.
- [ ] In `workspace-pane-surface.tsx`, add a `workspaceViewMode === "browser"`-style branch (the Split Mode shell from Phase 1 selects between browser/simulator by the active preview surface kind — read it from `browserSession.state` / the Phase 1 layout controller). Render `<WorkspaceSimulatorSurface ... />` and add the kind to the `hidden`-class guard for the chat scope.
- [ ] Run `bun run typecheck && bun x vitest run src/features/simulator` → expect PASS.
- [ ] Commit: `feat(simulator): WorkspaceSimulatorSurface + shell wiring`.

## Task 16 — End-to-end broker dispatch smoke (unsupported evaluate)

**Files:** `src-tauri/tests/simulator_parsing.rs` (add a dispatch arm) or a new `src-tauri/tests/simulator_broker.rs`

- [ ] Write a failing test `evaluate_returns_unsupported_via_broker` opening a simulator surface and dispatching the `evaluate` preview call → asserts the result is `PreviewError::Unsupported` with message `"evaluate is browser-only"`. (Exercises broker → SimulatorDriver for the one structured-unsupported path; the other verbs are covered by Task 7 over the fake.)
- [ ] Run `cd src-tauri && cargo test evaluate_returns_unsupported_via_broker` → expect FAIL.
- [ ] No new impl needed if Tasks 7+11 are correct — this is a wiring assertion. If it fails, fix the broker arm.
- [ ] Run → expect PASS.
- [ ] Run full suite: `bun run test && bun run lint` → expect PASS.
- [ ] Commit: `test(simulator): broker evaluate-unsupported smoke`.

---

## Self-review notes

| Acceptance criterion | Task(s) |
| --- | --- |
| Open a simulator surface in Split Mode, pick a booted iOS/Android device, see its screen | 9, 10, 13, 14, 15 |
| `preview_snapshot` returns a11y/view hierarchy + interactive elements + screenshot via broker → SimulatorDriver | 5, 6, 7, 8, 11 |
| Agent can `preview_navigate` (deep-link/launch), `preview_click`, `preview_type`, `preview_press`, `preview_scroll`, `preview_wait_for` via the same broker | 1, 2, 7, 11 |
| `preview_evaluate` returns structured "unsupported on this surface" | 7, 16 |
| Trust indicator + kill switch + per-workspace routing identical to browser (reuse Phase 2 plumbing) | 11 (broker active-control), 15 (reused `AgentControlBanner`) |
| Missing idb/adb/Xcode tooling degrades to a clear documented surface state (no crash) | 3 (`Unsupported` on `NotFound`), 4 (`check_tooling`/`ToolingReport`) |
| No test shells out | 3 (`CommandExecutor` + `FakeExecutor`), all driver tests inject the fake; parsers take `&str`/`&[u8]` |

## Tooling assumptions

- **idb** (`fb-idb`, Facebook iOS Device Bridge) installed and on `PATH`; provides `idb ui describe-all|tap|text|key`. Absence → `PreviewError::Unsupported("tool not installed: idb")`, surfaced via `ToolingReport.missing`.
- **Xcode Command Line Tools** providing `xcrun simctl` (`list devices --json`, `boot`, `io booted screenshot`, `openurl booted`). macOS-only; the iOS path is unsupported off macOS (already desktop-only, consistent with `browser/mod.rs`).
- **Android platform-tools** providing `adb` (`devices`, `shell input tap/text/keyevent/swipe`, `exec-out screencap -p`, `exec-out uiautomator dump /dev/tty`). Absence → structured unsupported state, no panic.
- `quick-xml` for `uiautomator dump` parsing — add to `src-tauri/Cargo.toml` if not already present (Task 6).
- Coordinates passed to `idb`/`adb` are integer device pixels (`fmt_coord` rounds); the parsers carry rects in the same pixel space so click-center math needs no DPI scaling.
- Codex MCP wiring for the new preview tools is inherited from Phase 2 (no Phase 4 work); these tools are surface-agnostic at the broker, so a simulator surface needs no new MCP plumbing.
