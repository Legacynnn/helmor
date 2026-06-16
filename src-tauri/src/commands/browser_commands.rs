//! Tauri command handlers for the integrated browser surface.
//!
//! Two concerns live here: DB-backed tab persistence (`browser_list_tabs` /
//! `browser_persist_tabs`, pure pass-throughs via `run_blocking`, mirroring
//! `session_commands.rs`) and the embedded content-webview lifecycle
//! (`browser_create` / `browser_navigate` / `browser_set_bounds` /
//! `browser_destroy`, delegating to `crate::browser`). The lifecycle commands
//! must run on the main thread (they touch the platform webview), so they are
//! plain `async` that call into `crate::browser` directly rather than via
//! `run_blocking`.

use serde::Deserialize;

use super::common::{run_blocking, CmdResult};
use crate::browser::{self, bridge::BridgeMessage};
use crate::models::browser::{self as browser_model, BrowserTab, NewBrowserTab};
use crate::models::browser_comments::{self, BrowserComment, NewBrowserComment};
use crate::ui_sync::{self, UiMutationEvent};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabInput {
    pub url: String,
    pub title: Option<String>,
    pub position: i64,
    pub active: bool,
}

/// Replace a workspace's persisted tab set. Extracted from the command so it is
/// directly unit-testable without a Tauri runtime.
pub(crate) fn persist_tabs_inner(workspace_id: &str, tabs: Vec<TabInput>) -> anyhow::Result<()> {
    let mapped: Vec<NewBrowserTab> = tabs
        .into_iter()
        .map(|t| NewBrowserTab {
            url: t.url,
            title: t.title,
            position: t.position,
            active: t.active,
        })
        .collect();
    browser_model::replace_tabs(workspace_id, &mapped)
}

#[tauri::command]
pub async fn browser_list_tabs(workspace_id: String) -> CmdResult<Vec<BrowserTab>> {
    run_blocking(move || browser_model::list_tabs(&workspace_id)).await
}

#[tauri::command]
pub async fn browser_persist_tabs(workspace_id: String, tabs: Vec<TabInput>) -> CmdResult<()> {
    run_blocking(move || persist_tabs_inner(&workspace_id, tabs)).await
}

/// A logical-pixel rectangle for the embedded content webview, reported from
/// the frontend host element's `getBoundingClientRect()`.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectInput {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl From<RectInput> for browser::Rect {
    fn from(r: RectInput) -> Self {
        browser::Rect {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

/// Embed (or re-target) the content webview at `rect` navigated to `url`.
#[tauri::command]
pub async fn browser_create(app: tauri::AppHandle, url: String, rect: RectInput) -> CmdResult<()> {
    Ok(browser::create(&app, &url, rect.into())?)
}

/// Navigate the embedded content webview to `url`.
#[tauri::command]
pub async fn browser_navigate(app: tauri::AppHandle, url: String) -> CmdResult<()> {
    Ok(browser::navigate(&app, &url)?)
}

/// Reposition/resize the embedded content webview to track the pane rect.
#[tauri::command]
pub async fn browser_set_bounds(app: tauri::AppHandle, rect: RectInput) -> CmdResult<()> {
    Ok(browser::set_bounds(&app, rect.into())?)
}

/// Tear down the embedded content webview.
#[tauri::command]
pub async fn browser_destroy(app: tauri::AppHandle) -> CmdResult<()> {
    Ok(browser::destroy(&app)?)
}

/// Save a browser-captured screenshot (base64 PNG from the content-webview
/// capture bridge) into the session paste-cache and return its absolute path.
/// `session_id` must be the bound `sessions.id` or the composer's pre-allocated
/// provisional UUID, so the screenshot rides the same `images` wire as a
/// pasted image.
#[tauri::command]
pub async fn browser_capture(session_id: String, base64_png: String) -> CmdResult<String> {
    run_blocking(move || browser::capture::save_capture_png(&session_id, &base64_png)).await
}

/// Base64-encoded PNG segments to stitch into one tall full-page screenshot.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StitchInput {
    /// Segments in scroll order (top → bottom). May carry a `data:` URL prefix.
    pub segments: Vec<String>,
}

/// Stitch full-page capture segments into one tall PNG and persist it to the
/// session paste-cache, returning the absolute path. Decode + compose + encode
/// runs off the main thread via `run_blocking`. The returned path rides the same
/// `images` wire as a single `browser_capture` shot.
#[tauri::command]
pub async fn browser_stitch_captures(session_id: String, input: StitchInput) -> CmdResult<String> {
    run_blocking(move || {
        let decoded = input
            .segments
            .iter()
            .map(|b64| {
                // Tolerate `data:image/png;base64,...` prefixes from canvas exports.
                let raw = b64.rsplit(',').next().unwrap_or(b64);
                browser::capture::decode_base64_png(raw)
            })
            .collect::<anyhow::Result<Vec<_>>>()?;

        let stitched = browser::capture::stitch_segments(decoded)?;
        browser::capture::save_stitched_png(&session_id, &stitched)
    })
    .await
}

/// Send a host → page inspector-bridge message into the embedded content
/// webview (e.g. `{ "kind": "set-mode", "mode": "comment" }`). Evals
/// `window.__helmorBridge.handleMsg(<json>)`. No-op if no webview is embedded.
#[tauri::command]
pub async fn browser_send_bridge_message(message: serde_json::Value) -> CmdResult<()> {
    Ok(browser::bridge::eval_into_content(&message)?)
}

/// Receive a page → host inspector-bridge message from the embedded content
/// webview and fan it out to the frontend as a `UiMutationEvent`.
///
/// The injected runtime (`bridge/injected.ts`) invokes this with the
/// `BridgeToHostMessage` shape plus the bridge context the host seeded via a
/// `set-context` message: `workspace_id` (scopes comment / pick state) and the
/// current page `url` (anchors persisted comments per page). Both default to
/// empty when the host has not seeded context yet, so an early page event never
/// fails the command.
///
/// Comments are PERSISTED to `browser_comments` and re-published with their full
/// selection so the surface store renders them live; picks are published with
/// their selection. Console + network entries are accepted (so the collectors
/// have a sink) but only logged for now — the console/network UI lands later.
#[tauri::command]
pub async fn browser_bridge_event(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] workspaceId: Option<String>,
    url: Option<String>,
    message: BridgeMessage,
) -> CmdResult<()> {
    let workspace_id = workspaceId.unwrap_or_default();
    let url = url.unwrap_or_default();
    match message {
        BridgeMessage::CommentAdded {
            id,
            text,
            selection,
        } => {
            // Persist so the pin survives reloads + window switches.
            let ws = workspace_id.clone();
            let new_comment = NewBrowserComment {
                id: id.clone(),
                url,
                // seq is allocated host-side in the bridge; mirror it later if
                // needed. For now order by creation; default seq 0.
                seq: 0,
                selector: selection.selector.clone(),
                outer_html: selection.outer_html.clone(),
                text: text.clone(),
                rect_json: selection.rect.to_string(),
            };
            run_blocking(move || browser_comments::insert_comment(&ws, new_comment)).await?;
            ui_sync::publish(
                &app,
                UiMutationEvent::BrowserCommentPinned {
                    workspace_id,
                    comment_id: id,
                    text,
                    selector: selection.selector,
                    outer_html: selection.outer_html,
                    rect: selection.rect,
                    computed_styles: selection.computed_styles,
                    crop_path: selection.crop_path,
                },
            );
        }
        BridgeMessage::ElementPicked { selection } => {
            ui_sync::publish(
                &app,
                UiMutationEvent::BrowserElementPicked {
                    workspace_id,
                    selector: selection.selector,
                    outer_html: selection.outer_html,
                    rect: selection.rect,
                    computed_styles: selection.computed_styles,
                },
            );
        }
        BridgeMessage::ConsoleError { entry } => {
            ui_sync::publish(
                &app,
                UiMutationEvent::BrowserConsoleEntry {
                    workspace_id,
                    level: entry.level,
                    message: entry.message,
                    ts: entry.ts,
                },
            );
        }
        BridgeMessage::NetworkEvent { entry } => {
            ui_sync::publish(
                &app,
                UiMutationEvent::BrowserNetworkEvent {
                    workspace_id,
                    url: entry.url,
                    method: entry.method,
                    status: entry.status,
                    duration_ms: entry.duration_ms,
                    failed: entry.failed,
                },
            );
        }
        BridgeMessage::CaptureResult { .. } => {
            // Capture results resolve a pending capture promise host-side; the
            // dedicated capture command owns persistence, so this is a no-op.
        }
    }
    Ok(())
}

/// Persist a pinned comment directly (host-driven, e.g. re-anchored hydration).
#[tauri::command]
pub async fn browser_add_comment(
    workspace_id: String,
    url: String,
    comment: CommentInput,
) -> CmdResult<BrowserComment> {
    run_blocking(move || {
        browser_comments::insert_comment(
            &workspace_id,
            NewBrowserComment {
                id: comment.id,
                url,
                seq: comment.seq,
                selector: comment.selector,
                outer_html: comment.outer_html,
                text: comment.text,
                rect_json: comment.rect.to_string(),
            },
        )
    })
    .await
}

/// List a workspace's persisted comments, optionally narrowed to one `url`.
#[tauri::command]
pub async fn browser_list_comments(
    workspace_id: String,
    url: Option<String>,
) -> CmdResult<Vec<BrowserComment>> {
    run_blocking(move || browser_comments::list_comments(&workspace_id, url.as_deref())).await
}

/// Delete a persisted comment by id.
#[tauri::command]
pub async fn browser_delete_comment(id: String) -> CmdResult<()> {
    run_blocking(move || browser_comments::delete_comment(&id)).await
}

/// Input for `browser_add_comment`. Mirrors the page-side `CommentPin` shape;
/// `outerHTML` keeps DOM casing, `rect` is arbitrary JSON serialized on store.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentInput {
    pub id: String,
    pub seq: i64,
    pub selector: String,
    #[serde(rename = "outerHTML")]
    pub outer_html: String,
    pub text: String,
    pub rect: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persist_tabs_round_trips() {
        let _env = crate::testkit::TestEnv::new("browser-commands");
        let ws = "ws-cmd";
        persist_tabs_inner(
            ws,
            vec![TabInput {
                url: "http://localhost:5173".into(),
                title: None,
                position: 0,
                active: true,
            }],
        )
        .unwrap();
        let tabs = crate::models::browser::list_tabs(ws).unwrap();
        assert_eq!(tabs.len(), 1);
        assert_eq!(tabs[0].url, "http://localhost:5173");
    }
}
