//! Tauri IPC surface for Infinite Canvas mode (epic #61).
//!
//! Thin glue over `models::canvas`: every mutation persists then broadcasts a
//! `UiMutationEvent::CanvasChanged` so other windows (and, in Phase 6, the
//! `helmor canvas` CLI) stay in sync. The originating renderer marks its
//! `canvasState` query stale without refetching (echo-free local edits); a
//! re-entry or external mutation pulls fresh state.

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
