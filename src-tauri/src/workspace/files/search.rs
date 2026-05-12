use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};

use super::types::{DirEntryKind, PathSearchHit};
use super::walker::build_walker;

pub const MAX_SEARCH_HITS: usize = 200;
const MAX_VISITED: usize = 50_000;

pub fn search_paths(workspace_root_path: &str, query: &str) -> Result<Vec<PathSearchHit>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let root = PathBuf::from(workspace_root_path);
    if !root.exists() || !root.is_dir() {
        return Err(anyhow!("workspace not found"));
    }
    let canonical_root = fs::canonicalize(&root).context("canonicalize root")?;
    let needle = trimmed.to_lowercase();

    let mut hits: Vec<(u8, PathSearchHit)> = Vec::new();
    let mut visited = 0usize;

    for dir_entry in build_walker(&canonical_root).build() {
        if hits.len() >= MAX_SEARCH_HITS * 2 || visited >= MAX_VISITED {
            break;
        }
        let entry = match dir_entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.depth() == 0 {
            continue;
        }
        visited += 1;

        let file_type = match entry.file_type() {
            Some(t) => t,
            None => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let absolute = entry.path().to_path_buf();
        let name = match absolute.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let relative = absolute
            .strip_prefix(&canonical_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| name.clone());

        let lname = name.to_lowercase();
        let lpath = relative.to_lowercase();
        let kind = if file_type.is_dir() {
            DirEntryKind::Directory
        } else {
            DirEntryKind::File
        };

        let rank = if lname == needle {
            4
        } else if lname.starts_with(&needle) {
            3
        } else if lname.contains(&needle) {
            2
        } else if lpath.contains(&needle) {
            1
        } else {
            0
        };
        if rank > 0 {
            hits.push((
                rank,
                PathSearchHit {
                    kind,
                    name,
                    path: relative,
                    absolute_path: absolute.to_string_lossy().to_string(),
                },
            ));
        }
    }

    hits.sort_by_key(|b| std::cmp::Reverse(b.0));
    Ok(hits
        .into_iter()
        .take(MAX_SEARCH_HITS)
        .map(|(_, h)| h)
        .collect())
}
