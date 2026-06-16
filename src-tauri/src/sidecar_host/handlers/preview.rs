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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_navigate_params() {
        let params = serde_json::json!({ "workspaceId": "ws1", "url": "http://localhost:3000" });
        let parsed = parse_call("navigate", params).expect("parse");
        assert_eq!(parsed.0, "ws1");
        assert!(matches!(parsed.1, PreviewCall::Navigate { .. }));
    }

    #[test]
    fn missing_workspace_id_errors() {
        let params = serde_json::json!({ "url": "x" });
        assert!(parse_call("navigate", params).is_err());
    }
}
