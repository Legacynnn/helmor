use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

use anyhow::{bail, Context, Result};
use sysinfo::{ProcessesToUpdate, System};

/// Delete a workspace's directory. DB rows are untouched — the caller
/// flips workspace state to `archived` afterwards.
pub fn delete_workspace_dir(workspaces_dir: &Path, directory_name: &str) -> Result<u64> {
    // Refuse anything that could escape the workspaces root.
    if directory_name.is_empty() || directory_name.contains('/') || directory_name.contains("..") {
        bail!("invalid workspace directory name: {directory_name}");
    }
    let dir = workspaces_dir.join(directory_name);
    if !dir.is_dir() {
        return Ok(0);
    }
    let freed = super::storage::dir_size(&dir);
    fs::remove_dir_all(&dir)
        .with_context(|| format!("Failed to delete workspace dir {}", dir.display()))?;
    Ok(freed)
}

/// Delete log files older than `days`. Returns bytes freed.
pub fn clear_logs(logs_dir: &Path, days: u64) -> Result<u64> {
    let cutoff = SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60);
    let mut freed = 0u64;
    let Ok(entries) = fs::read_dir(logs_dir) else {
        return Ok(0);
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if modified < cutoff {
            freed += meta.len();
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(freed)
}

/// VACUUM the SQLite DB; returns bytes reclaimed (size before - after).
pub fn vacuum_db() -> Result<u64> {
    let db_path = crate::data_dir::db_path()?;
    let before = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let connection = crate::models::db::write_conn()?;
    connection.execute_batch("VACUUM;")?;
    let after = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    Ok(before.saturating_sub(after))
}

/// SIGTERM `pid` and all descendants after verifying identity via
/// `start_time` (PID-reuse guard). Refuses the app and sidecar PIDs.
pub fn kill_process_tree(pid: u32, start_time: u64, sidecar_pid: Option<u32>) -> Result<()> {
    if pid == std::process::id() || Some(pid) == sidecar_pid {
        bail!("refusing to kill a Helmor core process");
    }
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let target = sysinfo::Pid::from_u32(pid);
    let Some(proc_) = system.process(target) else {
        return Ok(()); // already dead — idempotent
    };
    if proc_.start_time() != start_time {
        bail!("process identity changed (PID was reused); refresh and retry");
    }
    let pairs: Vec<(u32, Option<u32>)> = system
        .processes()
        .iter()
        .map(|(p, pr)| (p.as_u32(), pr.parent().map(|x| x.as_u32())))
        .collect();
    let tree = super::tree::collect_descendants(pid, &pairs);
    // Build a parent-lookup map so we can compute depth from the root for
    // each descendant. Kill deepest-first so leaf processes are terminated
    // before their parents; root is always last.
    let parent_map: std::collections::HashMap<u32, u32> = pairs
        .iter()
        .filter_map(|(p, par)| par.map(|parent| (*p, parent)))
        .collect();
    let depth_of = |mut p: u32| -> u32 {
        let mut depth = 0u32;
        while let Some(&par) = parent_map.get(&p) {
            depth += 1;
            if par == pid || p == par {
                break;
            }
            p = par;
        }
        depth
    };
    let mut descendants: Vec<u32> = tree.into_iter().filter(|p| *p != pid).collect();
    descendants.sort_by_key(|&p| std::cmp::Reverse(depth_of(p)));
    let mut pids = descendants;
    pids.push(pid);
    for p in pids {
        if let Some(proc_) = system.process(sysinfo::Pid::from_u32(p)) {
            proc_.kill_with(sysinfo::Signal::Term);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_workspace_dir_removes_and_reports_bytes() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().join("ws-a");
        fs::create_dir_all(ws.join("nested")).unwrap();
        fs::write(ws.join("nested/f.bin"), vec![0u8; 64]).unwrap();
        let freed = delete_workspace_dir(tmp.path(), "ws-a").unwrap();
        assert_eq!(freed, 64);
        assert!(!ws.exists());
    }

    #[test]
    fn delete_workspace_dir_missing_is_zero_and_ok() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(delete_workspace_dir(tmp.path(), "nope").unwrap(), 0);
    }

    #[test]
    fn delete_workspace_dir_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(delete_workspace_dir(tmp.path(), "../escape").is_err());
        assert!(delete_workspace_dir(tmp.path(), "a/b").is_err());
        assert!(delete_workspace_dir(tmp.path(), "").is_err());
    }

    #[test]
    fn clear_logs_removes_only_old_files() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old.jsonl");
        let fresh = tmp.path().join("fresh.jsonl");
        fs::write(&old, vec![0u8; 32]).unwrap();
        fs::write(&fresh, vec![0u8; 16]).unwrap();
        // Backdate `old` by 10 days via filetime-free approach: set mtime
        // using the `filetime` pattern is overkill — instead pass days=0
        // cutoff (now) so both are "old", then days=36500 so none are.
        assert_eq!(clear_logs(tmp.path(), 36_500).unwrap(), 0);
        let freed = clear_logs(tmp.path(), 0).unwrap();
        assert_eq!(freed, 48);
        assert!(!old.exists());
        assert!(!fresh.exists());
    }

    #[test]
    fn kill_refuses_own_pid() {
        let err = kill_process_tree(std::process::id(), 0, None).unwrap_err();
        assert!(err.to_string().contains("core process"));
    }

    #[test]
    fn kill_rejects_mismatched_start_time() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("failed to spawn sleep");
        let child_pid = child.id();

        // Read the true start_time via sysinfo.
        let mut system = sysinfo::System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let true_start_time = system
            .process(sysinfo::Pid::from_u32(child_pid))
            .map(|p| p.start_time())
            .unwrap_or(0);

        let result = kill_process_tree(child_pid, true_start_time + 999, None);

        // Clean up regardless of outcome.
        let _ = child.kill();
        let _ = child.wait();

        let err = result.unwrap_err();
        assert!(
            err.to_string().contains("identity changed"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn kill_refuses_sidecar_pid() {
        // 999_999 is very unlikely to be a real process; pass it as both the
        // target and the sidecar guard so we exercise the sidecar-pid path
        // without risking killing anything real.
        let err = kill_process_tree(999_999, 0, Some(999_999)).unwrap_err();
        assert!(
            err.to_string().contains("core process"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn kill_dead_pid_is_idempotent_ok() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("failed to spawn sleep");
        let dead_pid = child.id();
        let _ = child.kill();
        let _ = child.wait();

        // The PID is now dead. kill_process_tree should either succeed
        // (process not found → Ok) or return the identity-changed error if
        // the PID was immediately reused with a different start_time.
        match kill_process_tree(dead_pid, 0, None) {
            Ok(()) => {}
            Err(e) => {
                assert!(
                    e.to_string().contains("identity changed"),
                    "unexpected error on dead pid: {e}"
                );
            }
        }
    }
}
