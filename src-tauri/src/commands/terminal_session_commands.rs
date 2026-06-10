//! Tauri commands for terminal sessions: agent detection (registry-driven)
//! and terminal-session row creation. PTY spawn/lifecycle lives in
//! `terminal_sessions::spawn`.

use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::models::{sessions::CreateSessionResponse, terminal_sessions};
use crate::terminal_agents::{self, agent_by_id, TerminalAgentDetails, TerminalAgentInfo};
use crate::workspace::scripts::{ScriptEvent, ScriptProcessManager};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn list_terminal_agents() -> CmdResult<Vec<TerminalAgentInfo>> {
    run_blocking(|| Ok(terminal_agents::detect_all_agents())).await
}

#[tauri::command]
pub async fn get_terminal_agent_details(agent_id: String) -> CmdResult<TerminalAgentDetails> {
    run_blocking(move || {
        terminal_agents::detect_agent_details(&agent_id)
            .ok_or_else(|| anyhow::anyhow!("Unknown terminal agent: {agent_id}"))
    })
    .await
}

#[tauri::command]
pub async fn create_terminal_session(
    app: AppHandle,
    workspace_id: String,
    agent_id: String,
) -> CmdResult<CreateSessionResponse> {
    let response = run_blocking({
        let workspace_id = workspace_id.clone();
        move || {
            let spec = agent_by_id(&agent_id)
                .ok_or_else(|| anyhow::anyhow!("Unknown terminal agent: {agent_id}"))?;
            terminal_sessions::create_terminal_session(&workspace_id, spec.id, spec.display_name)
        }
    })
    .await?;
    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::SessionListChanged { workspace_id },
    );
    Ok(response)
}

/// Spawn (or no-op if already running) the agent CLI for a terminal
/// session. Output streams to `channel` as `ScriptEvent`s; stdin/resize
/// reuse the inspector terminal commands with `instanceId = sessionId`.
#[tauri::command]
pub async fn spawn_terminal_session(
    app: AppHandle,
    manager: State<'_, ScriptProcessManager>,
    session_id: String,
    channel: Channel<ScriptEvent>,
) -> CmdResult<()> {
    crate::terminal_sessions::spawn::spawn_for_session(
        app,
        manager.inner().clone(),
        session_id,
        channel,
    )
    .await?;
    Ok(())
}
