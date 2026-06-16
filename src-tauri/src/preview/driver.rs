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
        PreviewError::Unsupported {
            message: msg.into(),
        }
    }
    pub fn driver(msg: impl Into<String>) -> Self {
        PreviewError::Driver {
            message: msg.into(),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_error_serializes_camel_tagged() {
        let err = PreviewError::Unsupported {
            message: "evaluate is browser-only".into(),
        };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "unsupported");
        assert_eq!(json["message"], "evaluate is browser-only");
    }

    #[test]
    fn preview_target_role_round_trips() {
        let t = PreviewTarget::Role {
            role: "button".into(),
            name: "Save".into(),
        };
        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["by"], "role");
        let back: PreviewTarget = serde_json::from_value(json).unwrap();
        assert_eq!(back, t);
    }
}
