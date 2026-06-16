//! Tauri commands for the agent-control preview broker.

use super::common::CmdResult;

/// Kill switch: revoke agent control of a workspace's preview surface.
#[tauri::command]
pub async fn preview_stop_agent_control(
    app: tauri::AppHandle,
    workspace_id: String,
) -> CmdResult<()> {
    crate::preview::broker::stop_agent_control(&app, &workspace_id);
    Ok(())
}
