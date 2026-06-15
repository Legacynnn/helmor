use crate::{
    editor_files,
    ui_sync::{self, UiMutationEvent},
};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn list_workspace_tree(
    workspace_root_path: String,
) -> CmdResult<editor_files::WorkspaceTreeResponse> {
    run_blocking(move || editor_files::list_workspace_tree(&workspace_root_path)).await
}

/// Lazily list the immediate children of an (ignored) directory in the Files
/// tab. `list_workspace_tree` lists ignored dirs without descending into them;
/// this fetches a single level on demand when the user expands one.
#[tauri::command]
pub async fn list_workspace_dir(
    workspace_root_path: String,
    relative_dir: String,
) -> CmdResult<Vec<editor_files::WorkspaceTreeEntry>> {
    run_blocking(move || editor_files::list_workspace_dir(&workspace_root_path, &relative_dir))
        .await
}

#[tauri::command]
pub async fn search_workspace(
    request: editor_files::WorkspaceSearchRequest,
) -> CmdResult<editor_files::WorkspaceSearchResponse> {
    run_blocking(move || editor_files::search_workspace(&request)).await
}

#[tauri::command]
pub async fn replace_in_workspace(
    app: tauri::AppHandle,
    request: editor_files::WorkspaceReplaceRequest,
) -> CmdResult<editor_files::WorkspaceReplaceResponse> {
    let workspace_id = request.workspace_id.clone();
    let response = run_blocking(move || editor_files::replace_in_workspace(&request)).await?;

    if response.files_changed > 0 {
        if let Some(workspace_id) = workspace_id {
            ui_sync::publish(
                &app,
                UiMutationEvent::WorkspaceFilesChanged {
                    workspace_id: workspace_id.clone(),
                },
            );
            ui_sync::publish(
                &app,
                UiMutationEvent::WorkspaceGitStateChanged { workspace_id },
            );
        }
    }

    Ok(response)
}
