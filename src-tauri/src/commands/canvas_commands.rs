//! Tauri IPC surface for Infinite Canvas mode (epic #61).
//!
//! Thin glue over `models::canvas`: every mutation persists then broadcasts a
//! `UiMutationEvent::CanvasChanged` so other windows (and, in Phase 6, the
//! `helmor canvas` CLI) stay in sync. The originating renderer marks its
//! `canvasState` query stale without refetching (echo-free local edits); a
//! re-entry or external mutation pulls fresh state.

use anyhow::Context;
use uuid::Uuid;

use crate::models::canvas::{self, CanvasConnection, CanvasPanel, CanvasState, CanvasViewState};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

fn notify(app: &tauri::AppHandle, workspace_id: String) {
    ui_sync::publish(app, UiMutationEvent::CanvasChanged { workspace_id });
}

/// Full canvas snapshot for a workspace — what the renderer loads on entry and
/// after restart. Returns defaults (empty panels, default view) for a
/// workspace that has never entered canvas mode.
#[tauri::command]
pub async fn load_canvas_state(workspace_id: String) -> CmdResult<CanvasState> {
    run_blocking(move || canvas::load_state(&workspace_id)).await
}

/// Insert-or-update a panel keyed by its UUID. Called on create and on every
/// (debounced) move/resize/restyle.
#[tauri::command]
pub async fn save_canvas_panel(app: tauri::AppHandle, panel: CanvasPanel) -> CmdResult<()> {
    let workspace_id = panel.workspace_id.clone();
    run_blocking(move || {
        crate::models::db::write_transaction(|tx| canvas::upsert_panel(tx, &panel))?;
        notify(&app, workspace_id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_canvas_panel(
    app: tauri::AppHandle,
    workspace_id: String,
    panel_id: String,
) -> CmdResult<()> {
    run_blocking(move || {
        crate::models::db::write_transaction(|tx| canvas::delete_panel(tx, &panel_id))?;
        notify(&app, workspace_id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn save_canvas_view_state(app: tauri::AppHandle, view: CanvasViewState) -> CmdResult<()> {
    let workspace_id = view.workspace_id.clone();
    run_blocking(move || {
        crate::models::db::write_transaction(|tx| canvas::upsert_view_state(tx, &view))?;
        notify(&app, workspace_id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn save_canvas_connection(
    app: tauri::AppHandle,
    connection: CanvasConnection,
) -> CmdResult<()> {
    let workspace_id = connection.workspace_id.clone();
    run_blocking(move || {
        crate::models::db::write_transaction(|tx| canvas::upsert_connection(tx, &connection))?;
        notify(&app, workspace_id);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_canvas_connection(
    app: tauri::AppHandle,
    workspace_id: String,
    connection_id: String,
) -> CmdResult<()> {
    run_blocking(move || {
        crate::models::db::write_transaction(|tx| canvas::delete_connection(tx, &connection_id))?;
        notify(&app, workspace_id);
        Ok(())
    })
    .await
}

/// Persist an uploaded background image to `{data_dir}/canvas-backgrounds/` and
/// return its absolute path. Used by the canvas chrome's "set background" flow,
/// which then stores the returned path in the view state.
#[tauri::command]
pub async fn save_canvas_background(
    workspace_id: String,
    bytes: Vec<u8>,
    ext: String,
) -> CmdResult<String> {
    run_blocking(move || {
        // `workspace_id` arrives as a raw IPC string and is interpolated into a
        // filesystem path below; validate it is a real UUID so a crafted value
        // (e.g. "../../etc") can't escape the backgrounds directory.
        let workspace_id = Uuid::parse_str(&workspace_id)
            .with_context(|| format!("Invalid workspace_id: {workspace_id}"))?
            .to_string();

        let ext = match ext.to_lowercase().as_str() {
            "png" | "jpg" | "jpeg" | "webp" | "gif" => ext.to_lowercase(),
            _ => "png".to_string(),
        };

        let dir = crate::data_dir::data_dir()?.join("canvas-backgrounds");
        std::fs::create_dir_all(&dir).with_context(|| {
            format!(
                "Failed to create canvas backgrounds directory {}",
                dir.display()
            )
        })?;

        let path = dir.join(format!("{workspace_id}-{}.{ext}", Uuid::new_v4()));
        std::fs::write(&path, &bytes)
            .with_context(|| format!("Failed to write canvas background {}", path.display()))?;

        Ok(path.to_string_lossy().into_owned())
    })
    .await
}
