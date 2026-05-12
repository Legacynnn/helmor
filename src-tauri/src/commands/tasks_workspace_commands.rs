use super::common::{run_blocking, CmdResult};
use crate::models::workspaces;

#[tauri::command]
pub async fn tasks_find_workspace_for_linear_task(task_id: String) -> CmdResult<Option<String>> {
    run_blocking(move || workspaces::find_workspace_for_linear_task_id(&task_id)).await
}

#[tauri::command]
pub async fn tasks_find_workspace_for_pr_url(pr_url: String) -> CmdResult<Option<String>> {
    run_blocking(move || workspaces::find_workspace_for_pr_url(&pr_url)).await
}

#[tauri::command]
pub async fn tasks_set_workspace_linear_task(
    workspace_id: String,
    task_id: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || {
        workspaces::set_workspace_linear_task_id(&workspace_id, task_id.as_deref())
    })
    .await
}
