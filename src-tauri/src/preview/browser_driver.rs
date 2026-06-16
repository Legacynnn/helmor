//! `PreviewDriver` over the embedded browser content webview. Read/act verbs go
//! through the correlated bridge request/response path; navigate/open reuse the
//! existing browser commands.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::AppHandle;
use uuid::Uuid;

use crate::browser::{self, bridge};
use crate::preview::driver::{
    PreviewDriver, PreviewError, PreviewResult, PreviewSnapshot, PreviewStatus, PreviewSurfaceKind,
    PreviewTarget, WaitCondition,
};

pub struct BrowserDriver {
    app: AppHandle,
}

impl BrowserDriver {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self { app })
    }

    async fn driver_request(&self, payload: Value) -> PreviewResult<Value> {
        let id = Uuid::new_v4().to_string();
        let rx = bridge::register_pending(id.clone());
        bridge::request_into_content(&id, &payload)
            .map_err(|e| PreviewError::driver(e.to_string()))?;
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
impl PreviewDriver for BrowserDriver {
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
        let value = self
            .driver_request(serde_json::json!({ "op": "snapshot" }))
            .await?;
        parse_snapshot(value)
    }

    async fn click(&self, target: PreviewTarget) -> PreviewResult<()> {
        self.driver_request(click_payload(&target))
            .await
            .map(|_| ())
    }

    async fn type_text(&self, target: PreviewTarget, text: String) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "type", "target": target, "text": text }))
            .await
            .map(|_| ())
    }

    async fn press(&self, key: String) -> PreviewResult<()> {
        self.driver_request(serde_json::json!({ "op": "press", "key": key }))
            .await
            .map(|_| ())
    }

    async fn scroll(&self, target: Option<PreviewTarget>, dx: f64, dy: f64) -> PreviewResult<()> {
        self.driver_request(
            serde_json::json!({ "op": "scroll", "target": target, "dx": dx, "dy": dy }),
        )
        .await
        .map(|_| ())
    }

    async fn evaluate(&self, script: String) -> PreviewResult<Value> {
        self.driver_request(serde_json::json!({ "op": "evaluate", "script": script }))
            .await
    }

    async fn wait_for(&self, condition: WaitCondition, timeout_ms: u64) -> PreviewResult<()> {
        self.driver_request(
            serde_json::json!({ "op": "waitFor", "condition": condition, "timeoutMs": timeout_ms }),
        )
        .await
        .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preview::driver::PreviewTarget;

    #[test]
    fn click_envelope_targets_selector() {
        let payload = click_payload(&PreviewTarget::Selector {
            selector: "#save".into(),
        });
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
