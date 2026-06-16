//! Tauri command handlers for the integrated browser surface.
//!
//! Phase 1 covers DB-backed persistence only: list and replace the per-workspace
//! tab set. The webview-lifecycle command (`browser_navigate`) lands in a later
//! phase once the rendering architecture is settled. Mirrors
//! `session_commands.rs` (DB pass-throughs via `run_blocking`).

use serde::Deserialize;

use super::common::{run_blocking, CmdResult};
use crate::models::browser::{self, BrowserTab, NewBrowserTab};

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
    browser::replace_tabs(workspace_id, &mapped)
}

#[tauri::command]
pub async fn browser_list_tabs(workspace_id: String) -> CmdResult<Vec<BrowserTab>> {
    run_blocking(move || browser::list_tabs(&workspace_id)).await
}

#[tauri::command]
pub async fn browser_persist_tabs(workspace_id: String, tabs: Vec<TabInput>) -> CmdResult<()> {
    run_blocking(move || persist_tabs_inner(&workspace_id, tabs)).await
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
