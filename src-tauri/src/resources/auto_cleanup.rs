//! Daily auto-cleanup task driven by user policy (Settings → Storage →
//! Auto-cleanup). Two independent knobs, both off by default:
//! `app.auto_clean_logs_days` (log retention in days, 0 = off) and
//! `app.auto_delete_dead_workspace_files` (remove on-disk files left by
//! archived workspaces).

use std::time::Duration;

use crate::models::settings::load_setting_value;

/// One cleanup pass driven by the persisted policy. Safe to call any
/// time; no-ops when both policies are off. Returns `true` only when
/// something was actually deleted, so callers can skip the (expensive)
/// storage refetch on no-op days.
pub fn run_once() -> bool {
    let mut changed = false;

    let days: u64 = load_setting_value("app.auto_clean_logs_days")
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    if days > 0 {
        if let Ok(logs_dir) = crate::data_dir::logs_dir() {
            match super::cleanup::clear_logs(&logs_dir, days) {
                Ok(freed) => changed |= freed > 0,
                Err(error) => {
                    tracing::warn!("Auto-cleanup: log pruning failed: {error:#}");
                }
            }
        }
    }

    let delete_dead = load_setting_value("app.auto_delete_dead_workspace_files")
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(false);
    if delete_dead {
        match delete_archived_workspace_dirs() {
            Ok(removed) => changed |= removed > 0,
            Err(error) => {
                tracing::warn!("Auto-cleanup: workspace dir pruning failed: {error:#}");
            }
        }
    }

    changed
}

/// Delete the on-disk directory of every `archived` workspace. DB rows
/// (and chat history) are untouched. Per-dir failures are skipped so one
/// locked folder can't abort the whole pass. Returns how many directories
/// were actually removed (already-gone dirs don't count).
fn delete_archived_workspace_dirs() -> anyhow::Result<usize> {
    let root = crate::data_dir::workspaces_dir()?;
    let connection = crate::models::db::read_conn()?;
    let mut statement =
        connection.prepare("SELECT directory_name FROM workspaces WHERE state = 'archived'")?;
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))?
        .flatten()
        .collect();
    let mut removed = 0usize;
    for name in names {
        // `delete_workspace_dir` reports Ok(0) for already-missing dirs, so
        // freed bytes alone can't distinguish "deleted an empty dir" from
        // "nothing to do" — check existence up front.
        let existed = root.join(&name).is_dir();
        if super::cleanup::delete_workspace_dir(&root, &name).is_ok() && existed {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Spawn the daily loop. First pass runs 5 minutes after startup so it
/// never competes with app boot.
pub fn spawn(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5 * 60)).await;
        loop {
            let changed = tauri::async_runtime::spawn_blocking(run_once)
                .await
                .unwrap_or(false);
            if changed {
                crate::ui_sync::publish(&app, crate::ui_sync::UiMutationEvent::StorageChanged);
            }
            tokio::time::sleep(Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}
