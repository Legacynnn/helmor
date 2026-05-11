use super::common::{run_blocking, CmdResult};
use crate::forge::linear::types::{LinearAuthStatus, LinearIssue, LinearIssueDetail, LinearTeam};
use crate::forge::linear::{auth, queries};
use crate::models;

#[tauri::command]
pub async fn linear_set_api_key(key: String) -> CmdResult<()> {
    run_blocking(move || auth::set_api_key(&key)).await
}

#[tauri::command]
pub async fn linear_clear_api_key() -> CmdResult<()> {
    run_blocking(auth::clear_api_key).await
}

#[tauri::command]
pub async fn linear_get_auth_status() -> CmdResult<LinearAuthStatus> {
    auth::get_auth_status()
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}

#[tauri::command]
pub async fn linear_list_teams() -> CmdResult<Vec<LinearTeam>> {
    let key = run_blocking(auth::get_api_key)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    queries::fetch_teams(&key)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}

#[tauri::command]
pub async fn linear_set_repo_team(repo_id: String, team_id: Option<String>) -> CmdResult<()> {
    run_blocking(move || {
        models::repos::update_repository_linear_team_id(&repo_id, team_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn linear_list_tasks(team_id: String) -> CmdResult<Vec<LinearIssue>> {
    let key = run_blocking(auth::get_api_key)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    queries::fetch_tasks(&key, &team_id)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}

#[tauri::command]
pub async fn linear_get_task(id: String) -> CmdResult<LinearIssueDetail> {
    let key = run_blocking(auth::get_api_key)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    queries::fetch_task(&key, &id)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}
