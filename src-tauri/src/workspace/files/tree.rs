use std::path::Path;

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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeResponse {
    pub entries: Vec<WorkspaceTreeEntry>,
    pub truncated: bool,
}

/// Gitignore-aware flat listing of every file and directory under the
/// workspace root. The frontend nests the flat list into a tree.
pub fn list_workspace_tree(workspace_root_path: &str) -> Result<WorkspaceTreeResponse> {
    let root = resolve_allowed_path(Path::new(workspace_root_path), true)?;

    let walker = ignore::WalkBuilder::new(&root)
        // Show dotfiles (.github, .changeset, ...) like VS Code does; only
        // gitignored entries are hidden.
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    let mut entries = Vec::new();
    let mut truncated = false;

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

        entries.push(WorkspaceTreeEntry {
            path: relative.to_string_lossy().replace('\\', "/"),
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir,
        });

        if entries.len() >= MAX_TREE_ENTRIES {
            truncated = true;
            break;
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(WorkspaceTreeResponse { entries, truncated })
}
