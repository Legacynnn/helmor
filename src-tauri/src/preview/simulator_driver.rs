//! Simulator preview driver (iOS via `xcrun simctl`/`idb`, Android via `adb`).
//!
//! The unit-testable seam is `SimCommand` (a pure argv builder) plus the
//! `CommandExecutor` trait. The real `ProcessExecutor` is the ONLY place that
//! spawns a process; every test injects a `FakeExecutor` so no test shells out.

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
}

/// Coordinates: integer pixels for idb/adb; drop trailing `.0`.
fn fmt_coord(v: f64) -> String {
    (v.round() as i64).to_string()
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
