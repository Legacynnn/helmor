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
use crate::browser;
use crate::models::browser::{self as browser_model, BrowserTab, NewBrowserTab};

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
