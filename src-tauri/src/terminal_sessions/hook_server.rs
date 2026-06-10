//! Loopback HTTP server receiving hook pings from spawned agent CLIs.
//! Lazily started on first terminal-session spawn; port + token are
//! injected into the PTY env (`HELMOR_HOOK_PORT` / `HELMOR_HOOK_TOKEN`).

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::post,
    Router,
};
use base64::Engine;
use tauri::{AppHandle, Runtime};

/// Called for every authenticated hook ping: `(session_id, event, body)`.
pub type HookCallback = Arc<dyn Fn(String, String, serde_json::Value) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct HookEndpoint {
    pub port: u16,
    pub token: String,
}

/// Managed Tauri state. One server per app process, started on demand.
#[derive(Default)]
pub struct TerminalHookServer {
    endpoint: tokio::sync::OnceCell<HookEndpoint>,
}

impl TerminalHookServer {
    pub async fn ensure_started<R: Runtime>(&self, app: AppHandle<R>) -> Result<HookEndpoint> {
        self.endpoint
            .get_or_try_init(|| async move {
                let callback: HookCallback = Arc::new(move |session_id, event, body| {
                    handle_hook_ping(&app, &session_id, &event, &body);
                });
                start_server(callback).await
            })
            .await
            .cloned()
    }
}

/// Status side effects for one authenticated ping. Claude's `SessionStart`
/// body carries the agent's own `session_id`, captured for `--resume`.
fn handle_hook_ping<R: Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    event: &str,
    body: &serde_json::Value,
) {
    if event == "SessionStart" {
        if let Some(provider_id) = body.get("session_id").and_then(|v| v.as_str()) {
            if let Err(error) = crate::models::terminal_sessions::set_terminal_provider_session_id(
                session_id,
                provider_id,
            ) {
                tracing::warn!(%error, session_id, "Failed to store provider session id");
            }
        }
    }
    super::status::apply_hook_event(app, session_id, event);
}

#[derive(Clone)]
struct HookState {
    token: Arc<String>,
    callback: HookCallback,
}

fn router(state: HookState) -> Router {
    Router::new()
        .route("/terminal-hooks/{session_id}", post(hook_handler))
        .with_state(state)
}

async fn hook_handler(
    State(state): State<HookState>,
    Path(session_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: String,
) -> StatusCode {
    let presented = headers
        .get("x-helmor-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if presented != state.token.as_str() {
        return StatusCode::UNAUTHORIZED;
    }
    let Some(event) = query.get("event").filter(|e| !e.is_empty()) else {
        return StatusCode::BAD_REQUEST;
    };
    // Claude pipes its hook stdin JSON through; pi sends `{}`. Tolerate
    // empty / non-JSON bodies — the event name alone is enough for status.
    let parsed =
        serde_json::from_str::<serde_json::Value>(&body).unwrap_or(serde_json::Value::Null);
    (state.callback)(session_id, event.clone(), parsed);
    StatusCode::NO_CONTENT
}

async fn start_server(callback: HookCallback) -> Result<HookEndpoint> {
    let token = generate_token();
    let state = HookState {
        token: Arc::new(token.clone()),
        callback,
    };
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .context("Failed to bind terminal hook server")?;
    let port = listener
        .local_addr()
        .context("Failed to read hook server addr")?
        .port();
    let app_router = router(state);
    tokio::spawn(async move {
        // Lives for the process lifetime — PTYs (and their hooks) die with us.
        if let Err(error) = axum::serve(listener, app_router).await {
            tracing::error!(%error, "terminal hook server exited with error");
        }
    });
    tracing::info!(port, "terminal hook server listening on loopback");
    Ok(HookEndpoint { port, token })
}

fn generate_token() -> String {
    let bytes: [u8; 32] = rand::random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    async fn test_server() -> (
        u16,
        String,
        Arc<Mutex<Vec<(String, String, serde_json::Value)>>>,
    ) {
        let received = Arc::new(Mutex::new(Vec::new()));
        let sink = received.clone();
        let callback: HookCallback = Arc::new(move |session_id, event, body| {
            sink.lock().unwrap().push((session_id, event, body));
        });
        let endpoint = start_server(callback).await.unwrap();
        (endpoint.port, endpoint.token, received)
    }

    #[tokio::test]
    async fn rejects_pings_without_token() {
        let (port, _token, received) = test_server().await;
        let client = reqwest::Client::new();
        let response = client
            .post(format!(
                "http://127.0.0.1:{port}/terminal-hooks/s1?event=Stop"
            ))
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 401);
        assert!(received.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn accepts_authenticated_ping_with_body() {
        let (port, token, received) = test_server().await;
        let client = reqwest::Client::new();
        let response = client
            .post(format!(
                "http://127.0.0.1:{port}/terminal-hooks/s1?event=SessionStart"
            ))
            .header("x-helmor-token", &token)
            .body(r#"{"session_id":"claude-abc"}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 204);
        let pings = received.lock().unwrap();
        assert_eq!(pings.len(), 1);
        let (session_id, event, body) = &pings[0];
        assert_eq!(session_id, "s1");
        assert_eq!(event, "SessionStart");
        assert_eq!(body["session_id"], "claude-abc");
    }

    #[tokio::test]
    async fn missing_event_is_bad_request() {
        let (port, token, _received) = test_server().await;
        let client = reqwest::Client::new();
        let response = client
            .post(format!("http://127.0.0.1:{port}/terminal-hooks/s1"))
            .header("x-helmor-token", &token)
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
    }
}
