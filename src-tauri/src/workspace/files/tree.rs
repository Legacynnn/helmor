use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;

use super::support::resolve_allowed_path;

/// Hard cap on entries returned to the frontend. Big monorepos can exceed
/// this; the walk stops early and the response is truncated rather than
/// flooding the webview.
const MAX_TREE_ENTRIES: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeEntry {
    /// Path relative to the workspace root, forward slashes.
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    /// True when the entry is excluded by git (`.gitignore`, `.git/info/exclude`,
    /// or global excludes). Shown dimmed in the Files tab. Ignored directories
    /// are listed but not expanded, so a single `node_modules/` entry stands in
    /// for its whole subtree instead of flooding the tree.
    pub ignored: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeResponse {
    pub entries: Vec<WorkspaceTreeEntry>,
    pub truncated: bool,
}

/// Flat listing of every file and directory under the workspace root. Tracked
/// (non-ignored) entries come from a gitignore-aware walk; git-ignored entries
/// are then added as a second pass and flagged `ignored: true` so the frontend
/// can dim them. Ignored directories are listed but never descended into, so an
/// ignored `node_modules/` shows as one entry rather than thousands. The
/// frontend nests the flat list into a tree.
pub fn list_workspace_tree(workspace_root_path: &str) -> Result<WorkspaceTreeResponse> {
    let root = resolve_allowed_path(Path::new(workspace_root_path), true)?;

    let walker = ignore::WalkBuilder::new(&root)
        // Show dotfiles (.github, .changeset, ...) like VS Code does.
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    let mut entries = Vec::new();
    let mut truncated = false;
    // Relative paths the gitignore-aware walk kept — anything NOT in here that
    // sits under the root or a kept directory is git-ignored.
    let mut kept_paths: HashSet<String> = HashSet::new();
    // Absolute kept directories to rescan for ignored children in pass two.
    let mut kept_dirs: Vec<PathBuf> = Vec::new();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            // Unreadable subtree (permissions, vanished dir) must not take
            // the whole tree down.
            Err(error) => {
                tracing::warn!(error = %error, "skipping unreadable entry during tree walk");
                continue;
            }
        };
        if entry.path() == root {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .with_context(|| format!("Tree entry escaped root: {}", entry.path().display()))?;
        let is_dir = entry.file_type().is_some_and(|kind| kind.is_dir());
        let relative = relative.to_string_lossy().replace('\\', "/");

        kept_paths.insert(relative.clone());
        if is_dir {
            kept_dirs.push(entry.path().to_path_buf());
        }

        entries.push(WorkspaceTreeEntry {
            path: relative,
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir,
            ignored: false,
        });

        if entries.len() >= MAX_TREE_ENTRIES {
            truncated = true;
            break;
        }
    }

    // Pass two: surface git-ignored entries. Only scan the root and kept
    // directories one level deep — ignored directories are added but not
    // descended into, so huge ignored trees (node_modules, target, ...) cost
    // a single entry each.
    if !truncated {
        let mut scan_dirs = Vec::with_capacity(kept_dirs.len() + 1);
        scan_dirs.push(root.clone());
        scan_dirs.extend(kept_dirs);

        'scan: for dir in scan_dirs {
            let read_dir = match std::fs::read_dir(&dir) {
                Ok(read_dir) => read_dir,
                Err(error) => {
                    tracing::warn!(error = %error, dir = %dir.display(), "skipping unreadable dir during ignored-file scan");
                    continue;
                }
            };
            for child in read_dir {
                let child = match child {
                    Ok(child) => child,
                    Err(_) => continue,
                };
                let name = child.file_name().to_string_lossy().to_string();
                if name == ".git" {
                    continue;
                }
                let relative = match child.path().strip_prefix(&root) {
                    Ok(relative) => relative.to_string_lossy().replace('\\', "/"),
                    Err(_) => continue,
                };
                // Already surfaced by the gitignore-aware walk → not ignored.
                if kept_paths.contains(&relative) {
                    continue;
                }
                let is_dir = child.file_type().map(|kind| kind.is_dir()).unwrap_or(false);

                entries.push(WorkspaceTreeEntry {
                    path: relative,
                    name,
                    is_dir,
                    ignored: true,
                });

                if entries.len() >= MAX_TREE_ENTRIES {
                    truncated = true;
                    break 'scan;
                }
            }
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(WorkspaceTreeResponse { entries, truncated })
}

/// List the immediate children of `relative_dir` (relative to the workspace
/// root). Used to lazily expand git-ignored directories in the Files tab:
/// `list_workspace_tree` lists ignored directories but deliberately does not
/// descend into them (so a huge `node_modules/` costs a single entry), which
/// means their contents are only fetched on demand when the user expands them.
///
/// Every child is flagged `ignored: true` — this is only ever called for a
/// directory already known to be ignored, so everything beneath it is ignored
/// too. Skips `.git` and does not follow symlinks into directories.
pub fn list_workspace_dir(
    workspace_root_path: &str,
    relative_dir: &str,
) -> Result<Vec<WorkspaceTreeEntry>> {
    let root = resolve_allowed_path(Path::new(workspace_root_path), true)?;
    // Resolve + sandbox the target dir: `resolve_allowed_path` canonicalizes
    // (collapsing any `..`) and rejects anything outside a known workspace
    // root, so a crafted `relative_dir` can't escape the workspace.
    let target = resolve_allowed_path(&root.join(relative_dir), true)?;

    let read_dir = std::fs::read_dir(&target)
        .with_context(|| format!("Failed to read dir: {}", target.display()))?;

    let mut entries = Vec::new();
    for child in read_dir {
        let child = match child {
            Ok(child) => child,
            Err(_) => continue,
        };
        let name = child.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let relative = match child.path().strip_prefix(&root) {
            Ok(relative) => relative.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        let is_dir = child.file_type().map(|kind| kind.is_dir()).unwrap_or(false);

        entries.push(WorkspaceTreeEntry {
            path: relative,
            name,
            is_dir,
            ignored: true,
        });

        if entries.len() >= MAX_TREE_ENTRIES {
            break;
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(entries)
}
