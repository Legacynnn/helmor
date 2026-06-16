//! Simulator preview driver (iOS via `xcrun simctl`/`idb`, Android via `adb`).
//!
//! The unit-testable seam is `SimCommand` (a pure argv builder) plus the
//! `CommandExecutor` trait. The real `ProcessExecutor` is the ONLY place that
//! spawns a process; every test injects a `FakeExecutor` so no test shells out.

use serde::{Deserialize, Serialize};

use crate::preview::driver::{InteractiveElement, PreviewError, PreviewResult, PreviewSurfaceKind};

/// A single tool invocation expressed as program + args. Pure — building one
/// spawns nothing.
pub struct SimCommand {
    program: &'static str,
    args: Vec<String>,
}

impl SimCommand {
    fn new(program: &'static str, args: Vec<String>) -> Self {
        Self { program, args }
    }

    /// Full argv (`program` followed by its args), the form executors run and
    /// fakes key on.
    pub fn argv(&self) -> Vec<String> {
        let mut v = vec![self.program.to_string()];
        v.extend(self.args.iter().cloned());
        v
    }

    // --- iOS (xcrun simctl + idb) ---
    pub fn ios_list_devices() -> Self {
        Self::new(
            "xcrun",
            vec!["simctl", "list", "devices", "--json"]
                .into_iter()
                .map(String::from)
                .collect(),
        )
    }
    pub fn ios_boot(udid: &str) -> Self {
        Self::new("xcrun", vec!["simctl".into(), "boot".into(), udid.into()])
    }
    pub fn ios_screenshot(path: &str) -> Self {
        Self::new(
            "xcrun",
            vec![
                "simctl".into(),
                "io".into(),
                "booted".into(),
                "screenshot".into(),
                path.into(),
            ],
        )
    }
    pub fn ios_open_url(url: &str) -> Self {
        Self::new(
            "xcrun",
            vec![
                "simctl".into(),
                "openurl".into(),
                "booted".into(),
                url.into(),
            ],
        )
    }
    pub fn idb_describe_all() -> Self {
        Self::new("idb", vec!["ui".into(), "describe-all".into()])
    }
    pub fn idb_tap(x: f64, y: f64) -> Self {
        Self::new(
            "idb",
            vec!["ui".into(), "tap".into(), fmt_coord(x), fmt_coord(y)],
        )
    }
    pub fn idb_text(text: &str) -> Self {
        Self::new("idb", vec!["ui".into(), "text".into(), text.into()])
    }
    pub fn idb_key(code: &str) -> Self {
        Self::new("idb", vec!["ui".into(), "key".into(), code.into()])
    }

    // --- Android (adb) ---
    pub fn adb_devices() -> Self {
        Self::new("adb", vec!["devices".into()])
    }
    pub fn adb_tap(x: f64, y: f64) -> Self {
        Self::new(
            "adb",
            vec![
                "shell".into(),
                "input".into(),
                "tap".into(),
                fmt_coord(x),
                fmt_coord(y),
            ],
        )
    }
    pub fn adb_text(text: &str) -> Self {
        Self::new(
            "adb",
            vec!["shell".into(), "input".into(), "text".into(), text.into()],
        )
    }
    pub fn adb_keyevent(code: &str) -> Self {
        Self::new(
            "adb",
            vec![
                "shell".into(),
                "input".into(),
                "keyevent".into(),
                code.into(),
            ],
        )
    }
    /// Streams raw PNG bytes on stdout.
    pub fn adb_screencap() -> Self {
        Self::new(
            "adb",
            vec!["exec-out".into(), "screencap".into(), "-p".into()],
        )
    }
    /// Streams the view-hierarchy XML on stdout via `/dev/tty`.
    pub fn adb_uiautomator_dump() -> Self {
        Self::new(
            "adb",
            vec![
                "exec-out".into(),
                "uiautomator".into(),
                "dump".into(),
                "/dev/tty".into(),
            ],
        )
    }
    pub fn adb_openurl(url: &str) -> Self {
        Self::new(
            "adb",
            vec![
                "shell".into(),
                "am".into(),
                "start".into(),
                "-a".into(),
                "android.intent.action.VIEW".into(),
                "-d".into(),
                url.into(),
            ],
        )
    }

    /// A no-op presence probe: invokes `<program> --help`. Only the spawn
    /// outcome matters (a `NotFound` → `Unsupported`); the exit status is
    /// ignored.
    fn probe(program: &'static str) -> Self {
        Self::new(program, vec!["--help".into()])
    }
}

/// Binaries each platform's automation needs on `PATH`.
pub fn required_tools(kind: PreviewSurfaceKind) -> Vec<&'static str> {
    match kind {
        PreviewSurfaceKind::SimulatorIos => vec!["xcrun", "idb"],
        PreviewSurfaceKind::SimulatorAndroid => vec!["adb"],
        PreviewSurfaceKind::Browser => vec![],
    }
}

/// Structured tooling-presence state. Crosses IPC; a missing tool is data, not
/// an error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolingReport {
    pub ready: bool,
    pub missing: Vec<String>,
}

/// A node's bounds in device-pixel space. Feeds click-target resolution
/// (center = `x + width/2`, `y + height/2`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementRect {
    pub selector: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl ElementRect {
    #[allow(dead_code)] // used by SimulatorDriver::click in Task 7
    fn center(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }
}

/// The shared parse output of `idb ui describe-all` and `uiautomator dump`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotParse {
    pub a11y_tree: serde_json::Value,
    pub interactive_elements: Vec<InteractiveElement>,
    pub visible_text: String,
    pub rects: Vec<ElementRect>,
}

/// iOS tappable a11y types (idb `type` field).
fn ios_is_tappable(ty: &str) -> bool {
    matches!(ty, "Button" | "TextField" | "Link" | "Switch" | "Cell")
}

/// Parse `idb ui describe-all` JSON (an array of a11y nodes) into snapshot
/// pieces. The raw JSON becomes `a11y_tree` verbatim.
pub fn parse_idb_describe_all(json: &str) -> PreviewResult<SnapshotParse> {
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| PreviewError::driver(format!("idb describe-all parse: {e}")))?;
    let nodes = value
        .as_array()
        .ok_or_else(|| PreviewError::driver("idb describe-all: expected a JSON array"))?;

    let mut interactive_elements = Vec::new();
    let mut rects = Vec::new();
    let mut visible_parts: Vec<String> = Vec::new();

    for (index, node) in nodes.iter().enumerate() {
        let unique_id = node.get("AXUniqueId").and_then(|v| v.as_str());
        let selector = unique_id
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| format!("#{index}"));
        let role = node
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let label = node.get("AXLabel").and_then(|v| v.as_str());
        let title = node.get("title").and_then(|v| v.as_str());
        let name = label
            .filter(|s| !s.is_empty())
            .or(title.filter(|s| !s.is_empty()))
            .unwrap_or("")
            .to_string();

        if ios_is_tappable(&role) {
            interactive_elements.push(InteractiveElement {
                role: role.clone(),
                name: name.clone(),
                selector: selector.clone(),
            });
        }

        if let Some(frame) = node.get("frame") {
            let num = |key: &str| frame.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0);
            rects.push(ElementRect {
                selector: selector.clone(),
                x: num("x"),
                y: num("y"),
                width: num("width"),
                height: num("height"),
            });
        }

        for key in ["AXLabel", "AXValue", "title"] {
            if let Some(text) = node.get(key).and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    visible_parts.push(text.to_string());
                }
            }
        }
    }

    Ok(SnapshotParse {
        a11y_tree: value,
        interactive_elements,
        visible_text: visible_parts.join(" "),
        rects,
    })
}

/// Parse `bounds="[x1,y1][x2,y2]"` into `(x, y, width, height)`.
fn parse_bounds(bounds: &str) -> Option<(f64, f64, f64, f64)> {
    let cleaned: String = bounds
        .chars()
        .map(|c| match c {
            '[' | ']' => ' ',
            ',' => ' ',
            other => other,
        })
        .collect();
    let nums: Vec<f64> = cleaned
        .split_whitespace()
        .filter_map(|t| t.parse::<f64>().ok())
        .collect();
    if nums.len() != 4 {
        return None;
    }
    Some((nums[0], nums[1], nums[2] - nums[0], nums[3] - nums[1]))
}

/// `role` = last `.`-segment of the Android `class`.
fn android_role(class: &str) -> String {
    class.rsplit('.').next().unwrap_or(class).to_string()
}

/// Parse `uiautomator dump` XML into snapshot pieces. Builds a nested JSON tree
/// mirroring the node hierarchy plus flat interactive/rect lists.
pub fn parse_uiautomator_dump(xml: &str) -> PreviewResult<SnapshotParse> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    // Stack of in-progress node objects + their children arrays.
    struct Frame {
        node: serde_json::Map<String, serde_json::Value>,
        children: Vec<serde_json::Value>,
    }
    let mut stack: Vec<Frame> = Vec::new();
    let mut roots: Vec<serde_json::Value> = Vec::new();

    let mut interactive_elements = Vec::new();
    let mut rects = Vec::new();
    let mut visible_parts: Vec<String> = Vec::new();
    let mut index_counter = 0usize;

    // Read an attribute as an owned String.
    let attr = |e: &quick_xml::events::BytesStart, key: &str| -> Option<String> {
        e.attributes().flatten().find_map(|a| {
            if a.key.as_ref() == key.as_bytes() {
                let raw = String::from_utf8_lossy(a.value.as_ref());
                quick_xml::escape::unescape(&raw)
                    .map(|cow| cow.into_owned())
                    .ok()
            } else {
                None
            }
        })
    };

    // Turn a start/empty element into a node object + record flat pieces.
    let mut build_node =
        |e: &quick_xml::events::BytesStart| -> serde_json::Map<String, serde_json::Value> {
            let class = attr(e, "class").unwrap_or_default();
            if class.is_empty() && e.name().as_ref() == b"hierarchy" {
                // The wrapping <hierarchy> root carries no node attrs.
                let mut map = serde_json::Map::new();
                map.insert(
                    "class".into(),
                    serde_json::Value::String("hierarchy".into()),
                );
                return map;
            }
            let text = attr(e, "text").unwrap_or_default();
            let content_desc = attr(e, "content-desc").unwrap_or_default();
            let resource_id = attr(e, "resource-id").unwrap_or_default();
            let clickable = attr(e, "clickable").as_deref() == Some("true");
            let bounds = attr(e, "bounds").unwrap_or_default();

            let selector = if !resource_id.is_empty() {
                resource_id.clone()
            } else if !content_desc.is_empty() {
                content_desc.clone()
            } else {
                let s = format!("#{index_counter}");
                index_counter += 1;
                s
            };
            let role = android_role(&class);
            let name = if !text.is_empty() {
                text.clone()
            } else {
                content_desc.clone()
            };

            if clickable {
                interactive_elements.push(InteractiveElement {
                    role: role.clone(),
                    name: name.clone(),
                    selector: selector.clone(),
                });
            }
            if let Some((x, y, width, height)) = parse_bounds(&bounds) {
                rects.push(ElementRect {
                    selector: selector.clone(),
                    x,
                    y,
                    width,
                    height,
                });
            }
            if !text.is_empty() {
                visible_parts.push(text.clone());
            }

            let mut map = serde_json::Map::new();
            map.insert("selector".into(), serde_json::Value::String(selector));
            map.insert("role".into(), serde_json::Value::String(role));
            map.insert("name".into(), serde_json::Value::String(name));
            map.insert("clickable".into(), serde_json::Value::Bool(clickable));
            map.insert("bounds".into(), serde_json::Value::String(bounds));
            map
        };

    let finish_frame = |frame: Frame| -> serde_json::Value {
        let mut node = frame.node;
        if !frame.children.is_empty() {
            node.insert("children".into(), serde_json::Value::Array(frame.children));
        }
        serde_json::Value::Object(node)
    };

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let node = build_node(e);
                stack.push(Frame {
                    node,
                    children: Vec::new(),
                });
            }
            Ok(Event::Empty(ref e)) => {
                let node = build_node(e);
                let value = serde_json::Value::Object(node);
                match stack.last_mut() {
                    Some(parent) => parent.children.push(value),
                    None => roots.push(value),
                }
            }
            Ok(Event::End(_)) => {
                if let Some(frame) = stack.pop() {
                    let value = finish_frame(frame);
                    match stack.last_mut() {
                        Some(parent) => parent.children.push(value),
                        None => roots.push(value),
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(PreviewError::driver(format!("uiautomator dump parse: {e}")));
            }
            _ => {}
        }
        buf.clear();
    }

    // The single <hierarchy> root is the a11y tree.
    let a11y_tree = roots.into_iter().next().unwrap_or(serde_json::Value::Null);

    Ok(SnapshotParse {
        a11y_tree,
        interactive_elements,
        visible_text: visible_parts.join(" "),
        rects,
    })
}

/// Probe each tool the platform needs; collect the ones that aren't installed.
/// Never panics — a `NotFound` spawn maps to `Unsupported`, which we treat as
/// "missing".
pub fn check_tooling(executor: &dyn CommandExecutor, kind: PreviewSurfaceKind) -> ToolingReport {
    let mut missing = Vec::new();
    for tool in required_tools(kind) {
        if let Err(PreviewError::Unsupported { .. }) = executor.run(&SimCommand::probe(tool)) {
            missing.push(tool.to_string());
        }
    }
    ToolingReport {
        ready: missing.is_empty(),
        missing,
    }
}

/// Coordinates: integer pixels for idb/adb; drop trailing `.0`.
fn fmt_coord(v: f64) -> String {
    (v.round() as i64).to_string()
}

/// The captured result of running one `SimCommand`.
pub struct CommandOutput {
    pub stdout: Vec<u8>,
    pub status_ok: bool,
    pub stderr: String,
}

/// Decouples argv from process execution so the driver is unit-testable. The
/// real impl shells out; tests inject a recording fake.
pub trait CommandExecutor: Send + Sync {
    fn run(&self, cmd: &SimCommand) -> PreviewResult<CommandOutput>;
}

/// Real executor — the ONLY place that spawns a process. A missing binary maps
/// to a structured `Unsupported` (so tooling-presence detection never panics).
pub struct ProcessExecutor;

impl CommandExecutor for ProcessExecutor {
    fn run(&self, cmd: &SimCommand) -> PreviewResult<CommandOutput> {
        let argv = cmd.argv();
        let output = std::process::Command::new(&argv[0])
            .args(&argv[1..])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    PreviewError::unsupported(format!("tool not installed: {}", argv[0]))
                } else {
                    PreviewError::driver(format!("{}: {e}", argv[0]))
                }
            })?;
        Ok(CommandOutput {
            stdout: output.stdout,
            status_ok: output.status.success(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

/// Recording fake executor for tests: keyed canned stdout + a call log. Never
/// shells out.
#[cfg(test)]
pub struct FakeExecutor {
    responses: std::collections::HashMap<String, Vec<u8>>,
    missing: std::collections::HashSet<String>,
    calls: std::sync::Mutex<Vec<Vec<String>>>,
}

#[cfg(test)]
impl FakeExecutor {
    pub fn new() -> Self {
        Self {
            responses: std::collections::HashMap::new(),
            missing: std::collections::HashSet::new(),
            calls: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Key is the space-joined argv (e.g. `"idb ui describe-all"`).
    pub fn with_response(mut self, key: &str, stdout: Vec<u8>) -> Self {
        self.responses.insert(key.to_string(), stdout);
        self
    }

    /// Mark a program (argv[0]) as not installed: any call whose first token is
    /// `program` returns `Unsupported` like a real `NotFound`.
    pub fn with_missing(mut self, program: &str) -> Self {
        self.missing.insert(program.to_string());
        self
    }

    pub fn calls(&self) -> Vec<Vec<String>> {
        self.calls.lock().expect("fake calls lock").clone()
    }
}

#[cfg(test)]
impl CommandExecutor for FakeExecutor {
    fn run(&self, cmd: &SimCommand) -> PreviewResult<CommandOutput> {
        let argv = cmd.argv();
        self.calls
            .lock()
            .expect("fake calls lock")
            .push(argv.clone());
        if self.missing.contains(&argv[0]) {
            return Err(PreviewError::unsupported(format!(
                "tool not installed: {}",
                argv[0]
            )));
        }
        let key = argv.join(" ");
        match self.responses.get(&key) {
            Some(stdout) => Ok(CommandOutput {
                stdout: stdout.clone(),
                status_ok: true,
                stderr: String::new(),
            }),
            None => Err(PreviewError::driver(format!("no fake response for: {key}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            vec![
                "xcrun",
                "simctl",
                "io",
                "booted",
                "screenshot",
                "/tmp/s.png"
            ]
        );
        assert_eq!(
            SimCommand::ios_open_url("myapp://deep/link").argv(),
            vec!["xcrun", "simctl", "openurl", "booted", "myapp://deep/link"]
        );
        assert_eq!(
            SimCommand::idb_describe_all().argv(),
            vec!["idb", "ui", "describe-all"]
        );
        assert_eq!(
            SimCommand::idb_tap(10.0, 20.0).argv(),
            vec!["idb", "ui", "tap", "10", "20"]
        );
        assert_eq!(
            SimCommand::idb_text("hello world").argv(),
            vec!["idb", "ui", "text", "hello world"]
        );
        assert_eq!(
            SimCommand::idb_key("4").argv(),
            vec!["idb", "ui", "key", "4"]
        );
    }

    #[test]
    fn tooling_presence_structured() {
        assert_eq!(
            required_tools(PreviewSurfaceKind::SimulatorIos),
            vec!["xcrun", "idb"]
        );
        assert_eq!(
            required_tools(PreviewSurfaceKind::SimulatorAndroid),
            vec!["adb"]
        );

        let fake = FakeExecutor::new().with_missing("idb");
        let report = check_tooling(&fake, PreviewSurfaceKind::SimulatorIos);
        assert!(!report.ready);
        assert_eq!(report.missing, vec!["idb"]);
    }

    #[test]
    fn fake_executor_records_and_replies() {
        let fake = FakeExecutor::new().with_response("idb ui describe-all", b"[]".to_vec());
        let out = fake.run(&SimCommand::idb_describe_all()).unwrap();
        assert_eq!(out.stdout, b"[]");
        assert_eq!(fake.calls(), vec![vec!["idb", "ui", "describe-all"]]);
    }

    #[test]
    fn simcommand_android_argv() {
        assert_eq!(SimCommand::adb_devices().argv(), vec!["adb", "devices"]);
        assert_eq!(
            SimCommand::adb_tap(10.0, 20.0).argv(),
            vec!["adb", "shell", "input", "tap", "10", "20"]
        );
        assert_eq!(
            SimCommand::adb_text("hi").argv(),
            vec!["adb", "shell", "input", "text", "hi"]
        );
        assert_eq!(
            SimCommand::adb_keyevent("66").argv(),
            vec!["adb", "shell", "input", "keyevent", "66"]
        );
        assert_eq!(
            SimCommand::adb_screencap().argv(),
            vec!["adb", "exec-out", "screencap", "-p"]
        );
        assert_eq!(
            SimCommand::adb_uiautomator_dump().argv(),
            vec!["adb", "exec-out", "uiautomator", "dump", "/dev/tty"]
        );
        assert_eq!(
            SimCommand::adb_openurl("myapp://x").argv(),
            vec![
                "adb",
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                "myapp://x"
            ]
        );
    }
}
