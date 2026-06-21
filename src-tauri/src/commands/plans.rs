//! Tauri command handlers for MDX planning documents.
//!
//! Plans live on disk under a workspace's `.helmor/plans/` directory (see
//! [`crate::plans::store`]). The frontend addresses plans by `session_id`
//! (the surface a plan is opened from) + `slug`; these handlers resolve the
//! owning workspace directory from the session row and delegate to the store.
//! Mutating handlers broadcast [`UiMutationEvent::PlanFileChanged`] so any
//! frontend watching that session re-fetches.

use std::path::PathBuf;

use anyhow::Context;
use tauri::AppHandle;

use crate::models::{sessions, workspaces as workspace_models};
use crate::plans::{store, PlanDoc, PlanLifecycle, PlanSummary};

use super::common::{run_blocking, CmdResult};

/// Resolve the absolute workspace directory for `session_id`.
///
/// Chains `sessions::workspace_id_for_session` → `load_workspace_record_by_id`
/// → `workspace::helpers::workspace_path`, mirroring how the editor/git
/// commands resolve a worktree path from a workspace row. Runs synchronously
/// against the DB; call it from inside a `spawn_blocking` closure.
fn workspace_dir_for_session(session_id: &str) -> anyhow::Result<PathBuf> {
    let workspace_id = sessions::workspace_id_for_session(session_id)?
        .with_context(|| format!("No workspace bound to session {session_id}"))?;
    let record = workspace_models::load_workspace_record_by_id(&workspace_id)?
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;
    crate::workspace::helpers::workspace_path(&record)
}

#[tauri::command]
pub async fn create_plan(
    session_id: String,
    slug: String,
    title: String,
) -> CmdResult<PlanSummary> {
    run_blocking(move || {
        let workspace_dir = workspace_dir_for_session(&session_id)?;
        store::create_plan(&workspace_dir, &slug, &title)
    })
    .await
}

#[tauri::command]
pub async fn read_plan(session_id: String, slug: String) -> CmdResult<PlanDoc> {
    run_blocking(move || {
        let workspace_dir = workspace_dir_for_session(&session_id)?;
        store::read_plan(&workspace_dir, &slug)
    })
    .await
}

#[tauri::command]
pub async fn list_plans(session_id: String) -> CmdResult<Vec<PlanSummary>> {
    run_blocking(move || {
        let workspace_dir = workspace_dir_for_session(&session_id)?;
        store::list_plans(&workspace_dir)
    })
    .await
}

#[tauri::command]
pub async fn write_plan(
    app: AppHandle,
    session_id: String,
    slug: String,
    content: String,
) -> CmdResult<PlanSummary> {
    let summary = run_blocking({
        let session_id = session_id.clone();
        let slug = slug.clone();
        move || {
            let workspace_dir = workspace_dir_for_session(&session_id)?;
            store::write_plan(&workspace_dir, &slug, &content)
        }
    })
    .await?;

    let workspace_id = run_blocking({
        let session_id = session_id.clone();
        move || {
            crate::models::sessions::workspace_id_for_session(&session_id)?
                .with_context(|| format!("No workspace bound to session {session_id}"))
        }
    })
    .await?;

    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::PlanFileChanged { workspace_id, slug },
    );
    Ok(summary)
}

#[tauri::command]
pub async fn set_plan_status(
    app: AppHandle,
    session_id: String,
    slug: String,
    status: PlanLifecycle,
) -> CmdResult<PlanSummary> {
    let summary = run_blocking({
        let session_id = session_id.clone();
        let slug = slug.clone();
        move || {
            let workspace_dir = workspace_dir_for_session(&session_id)?;
            store::set_status(&workspace_dir, &slug, status)
        }
    })
    .await?;

    let workspace_id = run_blocking({
        let session_id = session_id.clone();
        move || {
            crate::models::sessions::workspace_id_for_session(&session_id)?
                .with_context(|| format!("No workspace bound to session {session_id}"))
        }
    })
    .await?;

    crate::ui_sync::publish(
        &app,
        crate::ui_sync::UiMutationEvent::PlanFileChanged { workspace_id, slug },
    );
    Ok(summary)
}
