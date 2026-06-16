//! Inspector bridge injection + page↔host message routing (Phase 3).
//!
//! The bridge TypeScript lives in `src/features/browser/bridge/` and is
//! compiled to `dist/bridge-bundle.js` (a single IIFE) by
//! `bun run build:bridge`. That bundle is baked into the Rust binary at compile
//! time via `include_str!` and attached to the content webview as its
//! `initialization_script` (see `browser::create`).
//!
//! Direction of flow:
//!   - host → page: [`eval_into_content`] calls
//!     `window.__helmorBridge.handleMsg(<json>)` via `Webview::eval`.
//!   - page → host: the injected runtime invokes the `browser_bridge_event`
//!     command (see `commands::browser_commands`) with a [`BridgeMessage`].

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use super::content_webview;

/// The compiled bridge IIFE. Built from `src/features/browser/bridge/` via
/// `bun run build:bridge` (wired into `dev:prepare` + `build`).
///
/// BUILD-ORDER CONTRACT: `dist/` is gitignored, so the real bundle is absent on
/// a fresh checkout. `cargo build` MUST still succeed without a prior bun build,
/// so `build.rs::ensure_bridge_bundle_placeholder` writes a minimal valid
/// placeholder IIFE here when the file is missing — `include_str!` always
/// resolves. `bun run build:bridge` then OVERWRITES that placeholder with the
/// live bridge for dev/prod, so the real runtime always ships. See
/// `build.rs::ensure_bridge_bundle_placeholder` for the full rationale.
const BRIDGE_BUNDLE: &str = include_str!("../../../dist/bridge-bundle.js");

/// The full `initialization_script` value for the content webview. The bundle
/// already self-invokes as an IIFE and installs `window.__helmorBridge`, so no
/// extra wrapper is needed.
pub fn injection_script() -> &'static str {
    BRIDGE_BUNDLE
}

/// A buffered console entry mirrored from the page-side collector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleEntry {
    pub level: String,
    pub message: String,
    pub ts: f64,
}

/// A buffered network entry mirrored from the page-side collector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEntry {
    pub url: String,
    pub method: String,
    pub status: Option<i64>,
    pub duration_ms: f64,
    pub failed: bool,
}

/// A DOM selection (selector + outerHTML + rect) captured by comment / pick.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub selector: String,
    // The page contract spells this `outerHTML` (DOM casing), which serde's
    // blanket camelCase would render as `outerHtml` — so rename explicitly.
    #[serde(rename = "outerHTML")]
    pub outer_html: String,
    #[serde(default)]
    pub computed_styles: Option<serde_json::Value>,
    pub rect: serde_json::Value,
    /// Path to a cropped screenshot of the element's rect, when one was made.
    #[serde(default)]
    pub crop_path: Option<String>,
}

/// Page → host message. Mirrors `BridgeToHostMessage` in
/// `src/features/browser/bridge/channel.ts` (`kind`-tagged union, camelCase).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum BridgeMessage {
    CommentAdded {
        id: String,
        text: String,
        selection: Selection,
    },
    ElementPicked {
        selection: Selection,
    },
    ConsoleError {
        entry: ConsoleEntry,
    },
    NetworkEvent {
        entry: NetworkEntry,
    },
    CaptureResult {
        base64: String,
    },
    /// Reply to a `driver-request` (snapshot/click/etc.). `value` is opaque JSON
    /// shaped per the verb (a PreviewSnapshot, or `{ "ok": true }`, or an error).
    DriverResult {
        id: String,
        value: serde_json::Value,
    },
}

/// Eval a host → page message into the content webview, invoking
/// `window.__helmorBridge.handleMsg(<json>)`. No-op (Ok) if the webview is not
/// embedded. `payload` is any serializable `HostToBridgeMessage` shape.
pub fn eval_into_content<T: Serialize>(payload: &T) -> Result<()> {
    let json = serde_json::to_string(payload)
        .map_err(|e| anyhow!("failed to serialize bridge message: {e}"))?;
    // `json` is valid JSON; embed it as a JS literal argument.
    let script =
        format!("if (window.__helmorBridge) {{ window.__helmorBridge.handleMsg({json}); }}");
    content_webview::with(|webview| {
        webview
            .eval(&script)
            .map_err(|e| anyhow!("failed to eval bridge message into content webview: {e}"))
    })
}

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
pub fn request_into_content(id: &str, payload: &serde_json::Value) -> Result<()> {
    let envelope = serde_json::json!({ "kind": "driver-request", "id": id, "payload": payload });
    eval_into_content(&envelope)
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_bundle_is_non_empty_and_exports_handle() {
        let script = injection_script();
        assert!(
            !script.is_empty(),
            "bridge-bundle.js must be built (bun run build:bridge) before cargo build"
        );
        assert!(
            script.contains("__helmorBridge"),
            "bridge bundle must install window.__helmorBridge"
        );
    }

    #[test]
    fn comment_added_message_deserializes_from_camel_case() {
        let json = r##"{
            "kind": "comment-added",
            "id": "c1",
            "text": "fix spacing",
            "selection": {
                "selector": "#hero",
                "outerHTML": "<div id=\"hero\"></div>",
                "rect": { "x": 1, "y": 2, "width": 3, "height": 4 }
            }
        }"##;
        let msg: BridgeMessage = serde_json::from_str(json).unwrap();
        match msg {
            BridgeMessage::CommentAdded {
                id,
                text,
                selection,
                ..
            } => {
                assert_eq!(id, "c1");
                assert_eq!(text, "fix spacing");
                assert_eq!(selection.selector, "#hero");
            }
            other => panic!("wrong variant: {other:?}"),
        }
    }

    #[test]
    fn element_picked_message_deserializes() {
        let json = r#"{
            "kind": "element-picked",
            "selection": {
                "selector": "button.cta",
                "outerHTML": "<button></button>",
                "rect": {}
            }
        }"#;
        let msg: BridgeMessage = serde_json::from_str(json).unwrap();
        assert!(matches!(msg, BridgeMessage::ElementPicked { .. }));
    }

    #[test]
    fn network_event_uses_camel_case_duration_field() {
        let json = r#"{
            "kind": "network-event",
            "entry": {
                "url": "https://x.test/api",
                "method": "GET",
                "status": 500,
                "durationMs": 42,
                "failed": true
            }
        }"#;
        let msg: BridgeMessage = serde_json::from_str(json).unwrap();
        match msg {
            BridgeMessage::NetworkEvent { entry } => {
                assert_eq!(entry.status, Some(500));
                assert!((entry.duration_ms - 42.0).abs() < f64::EPSILON);
                assert!(entry.failed);
            }
            other => panic!("wrong variant: {other:?}"),
        }
    }
}
