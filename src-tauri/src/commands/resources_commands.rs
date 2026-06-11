use std::collections::HashSet;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::resources::{attribution, cleanup, ports, sampler::ResourceSampler, storage, types};
use crate::sidecar::ManagedSidecar;
use crate::ui_sync;

use super::common::{run_blocking, CmdResult};

/// Workspace dirs for attribution: (id, absolute path). Best-effort —
/// failure means processes stay unattributed, never a snapshot error.
fn workspace_dirs() -> Vec<(String, std::path::PathBuf)> {
    let Ok(root) = crate::data_dir::workspaces_dir() else {
        return Vec::new();
    };
    let Ok(connection) = crate::models::db::read_conn() else {
        return Vec::new();
    };
    let Ok(mut statement) = connection.prepare("SELECT id, directory_name FROM workspaces") else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) else {
        return Vec::new();
    };
    rows.flatten()
        .map(|(id, dir)| (id, root.join(dir)))
        .collect()
}

#[tauri::command]
pub async fn get_resource_snapshot(
    sampler: State<'_, Arc<ResourceSampler>>,
    sidecar: State<'_, ManagedSidecar>,
) -> CmdResult<types::ResourceSnapshot> {
    let sampler = Arc::clone(&sampler);
    let sidecar_pid = sidecar.current_pid();
    run_blocking(move || {
        let mut snapshot = sampler.snapshot(sidecar_pid);

        // Attribution (best-effort).
        let dirs = workspace_dirs();
        for process in &mut snapshot.processes {
            let cwd = sampler.process_cwd(process.pid);
            process.workspace_id = attribution::workspace_for_cwd(cwd.as_deref(), &dirs);
        }

        // Ports (collector failure degrades, never errors).
        match ports::list_listening_ports() {
            Ok(listened) => {
                let tree_pids: HashSet<u32> = snapshot.processes.iter().map(|p| p.pid).collect();
                let pid_names: Vec<(u32, String)> = snapshot
                    .processes
                    .iter()
                    .map(|p| (p.pid, p.name.clone()))
                    .collect();
                let pid_workspaces: Vec<(u32, Option<String>)> = snapshot
                    .processes
                    .iter()
                    .map(|p| (p.pid, p.workspace_id.clone()))
                    .collect();
                // Read-only lookup: workspaces without an allocated range simply
                // contribute no port range. This path must not allocate.
                let ranges: Vec<(String, u16, u16)> = dirs
                    .iter()
                    .filter_map(|(id, _)| {
                        crate::workspace::port_allocation::lookup_workspace_port_range(id)
                            .ok()
                            .flatten()
                            .map(|r| (id.clone(), r.base, r.count))
                    })
                    .collect();
                snapshot.ports = ports::filter_ports(
                    &listened,
                    &tree_pids,
                    &pid_names,
                    &pid_workspaces,
                    &ranges,
                );
            }
            Err(_) => snapshot.ports_unavailable = true,
        }

        Ok(snapshot)
    })
    .await
}

#[tauri::command]
pub async fn get_storage_breakdown() -> CmdResult<types::StorageBreakdown> {
    run_blocking(storage::storage_breakdown).await
}

#[tauri::command]
pub async fn kill_resource_process(
    app: AppHandle,
    sidecar: State<'_, ManagedSidecar>,
    pid: u32,
    start_time: u64,
) -> CmdResult<()> {
    let sidecar_pid = sidecar.current_pid();
    run_blocking(move || cleanup::kill_process_tree(pid, start_time, sidecar_pid)).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::StorageChanged);
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace_storage(
    app: AppHandle,
    workspace_ids: Vec<String>,
) -> CmdResult<u64> {
    let freed = run_blocking(move || {
        let root = crate::data_dir::workspaces_dir()?;
        let connection = crate::models::db::write_conn()?;
        let mut freed = 0u64;
        for id in &workspace_ids {
            let dir_name: Option<String> = connection
                .query_row(
                    "SELECT directory_name FROM workspaces WHERE id = ?1",
                    [id],
                    |row| row.get(0),
                )
                .ok();
            if let Some(dir_name) = dir_name {
                freed += cleanup::delete_workspace_dir(&root, &dir_name)?;
                connection.execute(
                    "UPDATE workspaces SET state = 'archived' WHERE id = ?1",
                    [id],
                )?;
            }
        }
        Ok(freed)
    })
    .await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::StorageChanged);
    ui_sync::publish(&app, ui_sync::UiMutationEvent::WorkspaceListChanged);
    Ok(freed)
}

#[tauri::command]
pub async fn clear_old_logs(app: AppHandle, days: u64) -> CmdResult<u64> {
    let freed =
        run_blocking(move || cleanup::clear_logs(&crate::data_dir::logs_dir()?, days)).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::StorageChanged);
    Ok(freed)
}

#[tauri::command]
pub async fn vacuum_database(app: AppHandle) -> CmdResult<u64> {
    let freed = run_blocking(cleanup::vacuum_db).await?;
    ui_sync::publish(&app, ui_sync::UiMutationEvent::StorageChanged);
    Ok(freed)
}
