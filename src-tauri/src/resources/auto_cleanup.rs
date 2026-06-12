//! Daily auto-cleanup task driven by user policy (Settings → Storage →
//! Auto-cleanup). Two independent knobs, both off by default:
//! `app.auto_clean_logs_days` (log retention in days, 0 = off) and
//! `app.auto_delete_dead_workspace_files` (remove on-disk files left by
//! archived workspaces).

use std::time::Duration;

use crate::models::settings::load_setting_value;

/// One cleanup pass driven by the persisted policy. Safe to call any
/// time; no-ops when both policies are off.
pub fn run_once() {
    let days: u64 = load_setting_value("app.auto_clean_logs_days")
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    if days > 0 {
        if let Ok(logs_dir) = crate::data_dir::logs_dir() {
            if let Err(error) = super::cleanup::clear_logs(&logs_dir, days) {
                tracing::warn!("Auto-cleanup: log pruning failed: {error:#}");
            }
        }
    }

    let delete_dead = load_setting_value("app.auto_delete_dead_workspace_files")
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(false);
    if delete_dead {
        if let Err(error) = delete_archived_workspace_dirs() {
            tracing::warn!("Auto-cleanup: workspace dir pruning failed: {error:#}");
        }
    }
}

/// Delete the on-disk directory of every `archived` workspace. DB rows
/// (and chat history) are untouched. Per-dir failures are skipped so one
/// locked folder can't abort the whole pass.
fn delete_archived_workspace_dirs() -> anyhow::Result<()> {
    let root = crate::data_dir::workspaces_dir()?;
    let connection = crate::models::db::read_conn()?;
    let mut statement =
        connection.prepare("SELECT directory_name FROM workspaces WHERE state = 'archived'")?;
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))?
        .flatten()
        .collect();
    for name in names {
        let _ = super::cleanup::delete_workspace_dir(&root, &name);
    }
    Ok(())
}

/// Spawn the daily loop. First pass runs 5 minutes after startup so it
/// never competes with app boot.
pub fn spawn(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5 * 60)).await;
        loop {
            run_once();
            crate::ui_sync::publish(&app, crate::ui_sync::UiMutationEvent::StorageChanged);
            tokio::time::sleep(Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}
