use std::fs;
use std::path::Path;

use anyhow::Result;

use super::types::{StorageBreakdown, WorkspaceStorage};

/// Recursive dir size; symlinks not followed. Errors on individual
/// entries are skipped (size degrades, never fails the scan).
pub fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let Ok(meta) = entry.metadata() else { return 0 };
            if meta.is_dir() {
                dir_size(&entry.path())
            } else if meta.is_file() {
                meta.len()
            } else {
                0
            }
        })
        .sum()
}

/// Row from the workspaces table the breakdown needs.
pub struct WorkspaceRow {
    pub id: String,
    pub directory_name: String,
    pub state: String,
    pub branch: Option<String>,
}

/// Pure assembly: takes pre-fetched DB rows + on-disk roots so tests
/// run against a tempdir with no DB.
pub fn build_breakdown(
    rows: &[WorkspaceRow],
    workspaces_dir: &Path,
    db_path: &Path,
    logs_dir: &Path,
    chats_dir: &Path,
) -> StorageBreakdown {
    let workspaces: Vec<WorkspaceStorage> = rows
        .iter()
        .map(|row| {
            let dir = workspaces_dir.join(&row.directory_name);
            let dir_present = dir.is_dir();
            let size_bytes = dir_present.then(|| dir_size(&dir));
            let archived = row.state == "archived";
            WorkspaceStorage {
                id: row.id.clone(),
                name: row.directory_name.clone(),
                branch: row.branch.clone(),
                state: if dir_present {
                    row.state.clone()
                } else {
                    "dead".into()
                },
                size_bytes,
                dir_present,
                reclaimable: dir_present && archived,
            }
        })
        .collect();

    let db_bytes = fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    let logs_bytes = dir_size(logs_dir);
    let chats_bytes = dir_size(chats_dir);
    let workspace_bytes: u64 = workspaces.iter().filter_map(|w| w.size_bytes).sum();

    StorageBreakdown {
        total_bytes: db_bytes + logs_bytes + chats_bytes + workspace_bytes,
        db_bytes,
        logs_bytes,
        chats_bytes,
        workspaces,
    }
}

/// Full scan against the live data dir + DB. Wrap in `spawn_blocking`
/// at the command layer — this walks the disk.
pub fn storage_breakdown() -> Result<StorageBreakdown> {
    let connection = crate::models::db::read_conn()?;
    let mut statement =
        connection.prepare("SELECT id, directory_name, state, branch FROM workspaces")?;
    let rows: Vec<WorkspaceRow> = statement
        .query_map([], |row| {
            Ok(WorkspaceRow {
                id: row.get(0)?,
                directory_name: row.get(1)?,
                state: row.get(2)?,
                branch: row.get(3)?,
            })
        })?
        .flatten()
        .collect();
    Ok(build_breakdown(
        &rows,
        &crate::data_dir::workspaces_dir()?,
        &crate::data_dir::db_path()?,
        &crate::data_dir::logs_dir()?,
        &crate::data_dir::data_dir()?.join("chats"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    #[test]
    fn breakdown_sums_components_and_flags_states() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("workspaces/alive/file.txt"), 100);
        write(&root.join("workspaces/old/file.txt"), 50);
        write(&root.join("helmor.db"), 10);
        write(&root.join("logs/a.jsonl"), 5);
        write(&root.join("chats/c.json"), 3);

        let rows = vec![
            WorkspaceRow {
                id: "w1".into(),
                directory_name: "alive".into(),
                state: "ready".into(),
                branch: Some("main".into()),
            },
            WorkspaceRow {
                id: "w2".into(),
                directory_name: "old".into(),
                state: "archived".into(),
                branch: None,
            },
            WorkspaceRow {
                id: "w3".into(),
                directory_name: "gone".into(),
                state: "ready".into(),
                branch: None,
            },
        ];
        let b = build_breakdown(
            &rows,
            &root.join("workspaces"),
            &root.join("helmor.db"),
            &root.join("logs"),
            &root.join("chats"),
        );
        assert_eq!(b.db_bytes, 10);
        assert_eq!(b.logs_bytes, 5);
        assert_eq!(b.chats_bytes, 3);
        assert_eq!(b.total_bytes, 10 + 5 + 3 + 150);

        let w1 = b.workspaces.iter().find(|w| w.id == "w1").unwrap();
        assert!(!w1.reclaimable);
        assert_eq!(w1.size_bytes, Some(100));

        let w2 = b.workspaces.iter().find(|w| w.id == "w2").unwrap();
        assert!(w2.reclaimable); // archived + dir present

        let w3 = b.workspaces.iter().find(|w| w.id == "w3").unwrap();
        assert_eq!(w3.state, "dead"); // dir missing
        assert_eq!(w3.size_bytes, None);
        assert!(!w3.reclaimable);
    }

    #[test]
    fn dir_size_missing_dir_is_zero() {
        assert_eq!(dir_size(Path::new("/nonexistent/helmor-test")), 0);
    }
}
