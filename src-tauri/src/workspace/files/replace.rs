use std::{borrow::Cow, fs, path::Path};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::support::{atomic_write_file, resolve_allowed_path};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReplaceRequest {
    pub workspace_root_path: String,
    /// Used by the command layer to publish UI invalidation events.
    pub workspace_id: Option<String>,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    pub replacement: String,
    /// Explicit relative paths captured from the search preview. Matches are
    /// re-run fresh per file — the preview is never trusted.
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReplaceResponse {
    pub files_changed: u32,
    pub replacements: u32,
}

pub fn replace_in_workspace(request: &WorkspaceReplaceRequest) -> Result<WorkspaceReplaceResponse> {
    let root = resolve_allowed_path(Path::new(&request.workspace_root_path), true)?;
    if request.query.is_empty() {
        anyhow::bail!("Replace requires a non-empty search query");
    }

    let pattern = if request.regex {
        request.query.clone()
    } else {
        regex::escape(&request.query)
    };
    let pattern = if request.whole_word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern
    };
    let regex = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .build()
        .with_context(|| format!("Invalid replace pattern: {}", request.query))?;

    let mut files_changed: u32 = 0;
    let mut replacements: u32 = 0;

    for relative_path in &request.paths {
        let absolute = resolve_allowed_path(&root.join(relative_path), true)?;
        if !absolute.starts_with(&root) {
            anyhow::bail!("Replace path escapes the workspace root: {relative_path}");
        }

        let bytes = fs::read(&absolute)
            .with_context(|| format!("Failed to read file for replace: {relative_path}"))?;
        // Binary guard: same NUL probe the searcher uses.
        if bytes.contains(&0) {
            tracing::warn!(path = %relative_path, "skipping binary file during replace");
            continue;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            tracing::warn!(path = %relative_path, "skipping non-UTF-8 file during replace");
            continue;
        };

        let match_count = regex.find_iter(&content).count();
        if match_count == 0 {
            continue;
        }

        let updated: Cow<'_, str> = if request.regex {
            // Regex mode supports $1 capture references in the replacement.
            regex.replace_all(&content, request.replacement.as_str())
        } else {
            regex.replace_all(&content, regex::NoExpand(&request.replacement))
        };

        if updated != content {
            atomic_write_file(&absolute, updated.as_bytes())
                .with_context(|| format!("Failed to write replaced file: {relative_path}"))?;
            files_changed += 1;
            replacements += match_count as u32;
        }
    }

    Ok(WorkspaceReplaceResponse {
        files_changed,
        replacements,
    })
}
