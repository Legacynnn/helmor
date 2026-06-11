use std::path::Path;

use anyhow::{Context, Result};
use grep_matcher::Matcher;
use grep_searcher::{sinks::UTF8, BinaryDetection, SearcherBuilder};
use serde::{Deserialize, Serialize};

use super::support::resolve_allowed_path;

/// Server-side clamp on total matches, regardless of what the client asks
/// for. Keeps a pathological query (e.g. `.` in regex mode) from shipping
/// megabytes over IPC.
const MAX_TOTAL_MATCHES: u32 = 2_000;
/// Cap on file-name matches collected alongside content results.
const MAX_FILE_NAME_MATCHES: usize = 200;
/// Match-line previews are trimmed to this many characters on each side of
/// the match so minified bundles can't blow up the payload.
const PREVIEW_CONTEXT_CHARS: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchRequest {
    pub workspace_root_path: String,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub include_globs: Vec<String>,
    #[serde(default)]
    pub exclude_globs: Vec<String>,
    pub max_results: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatch {
    pub line_number: u64,
    /// Line text split around the match so the frontend can highlight
    /// without re-deriving byte offsets (UTF-8 vs UTF-16 mismatch).
    pub prefix: String,
    pub matched: String,
    pub suffix: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchFileResult {
    pub path: String,
    pub absolute_path: String,
    pub matches: Vec<WorkspaceSearchMatch>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResponse {
    pub files: Vec<WorkspaceSearchFileResult>,
    pub file_name_matches: Vec<String>,
    pub total_matches: u32,
    pub truncated: bool,
}

pub(super) fn build_matcher(
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    regex: bool,
) -> Result<grep_regex::RegexMatcher> {
    let pattern = if regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    grep_regex::RegexMatcherBuilder::new()
        .case_insensitive(!case_sensitive)
        .word(whole_word)
        .build(&pattern)
        .with_context(|| format!("Invalid search pattern: {query}"))
}

pub(super) fn build_walker(
    root: &Path,
    include_globs: &[String],
    exclude_globs: &[String],
) -> Result<ignore::Walk> {
    let mut overrides = ignore::overrides::OverrideBuilder::new(root);
    for glob in include_globs {
        overrides
            .add(glob)
            .with_context(|| format!("Invalid include glob: {glob}"))?;
    }
    for glob in exclude_globs {
        overrides
            .add(&format!("!{glob}"))
            .with_context(|| format!("Invalid exclude glob: {glob}"))?;
    }

    Ok(ignore::WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .overrides(
            overrides
                .build()
                .context("Failed to compile search globs")?,
        )
        .filter_entry(|entry| entry.file_name() != ".git")
        .build())
}

pub fn search_workspace(request: &WorkspaceSearchRequest) -> Result<WorkspaceSearchResponse> {
    let root = resolve_allowed_path(Path::new(&request.workspace_root_path), true)?;
    if request.query.is_empty() {
        return Ok(WorkspaceSearchResponse {
            files: Vec::new(),
            file_name_matches: Vec::new(),
            total_matches: 0,
            truncated: false,
        });
    }

    let matcher = build_matcher(
        &request.query,
        request.case_sensitive,
        request.whole_word,
        request.regex,
    )?;
    let max_results = request
        .max_results
        .unwrap_or(MAX_TOTAL_MATCHES)
        .min(MAX_TOTAL_MATCHES);

    let mut searcher = SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true)
        .build();

    let name_needle = if request.case_sensitive {
        request.query.clone()
    } else {
        request.query.to_lowercase()
    };

    let mut files = Vec::new();
    let mut file_name_matches = Vec::new();
    let mut total_matches: u32 = 0;
    let mut truncated = false;

    for entry in build_walker(&root, &request.include_globs, &request.exclude_globs)? {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let Ok(relative) = entry.path().strip_prefix(&root) else {
            continue;
        };
        let relative_path = relative.to_string_lossy().replace('\\', "/");

        if file_name_matches.len() < MAX_FILE_NAME_MATCHES {
            let file_name = entry.file_name().to_string_lossy();
            let haystack = if request.case_sensitive {
                file_name.to_string()
            } else {
                file_name.to_lowercase()
            };
            if haystack.contains(&name_needle) {
                file_name_matches.push(relative_path.clone());
            }
        }

        if total_matches >= max_results {
            truncated = true;
            // Keep walking only to finish file-name matches; bail once those
            // are capped too.
            if file_name_matches.len() >= MAX_FILE_NAME_MATCHES {
                break;
            }
            continue;
        }

        let mut matches = Vec::new();
        let remaining = max_results - total_matches;
        let search_result = searcher.search_path(
            &matcher,
            entry.path(),
            UTF8(|line_number, line| {
                collect_line_matches(&matcher, line_number, line, &mut matches);
                Ok(matches.len() < remaining as usize)
            }),
        );
        if let Err(error) = search_result {
            tracing::debug!(path = %entry.path().display(), error = %error, "skipping unsearchable file");
            continue;
        }
        if matches.is_empty() {
            continue;
        }

        total_matches += matches.len() as u32;
        if matches.len() >= remaining as usize {
            truncated = true;
        }
        files.push(WorkspaceSearchFileResult {
            path: relative_path,
            absolute_path: entry.path().to_string_lossy().to_string(),
            matches,
        });
    }

    Ok(WorkspaceSearchResponse {
        files,
        file_name_matches,
        total_matches,
        truncated,
    })
}

fn collect_line_matches(
    matcher: &grep_regex::RegexMatcher,
    line_number: u64,
    line: &str,
    matches: &mut Vec<WorkspaceSearchMatch>,
) {
    let line = line.trim_end_matches(['\n', '\r']);
    let bytes = line.as_bytes();
    let mut start = 0usize;

    while start <= bytes.len() {
        let found = match matcher.find_at(bytes, start) {
            Ok(Some(found)) => found,
            _ => break,
        };
        matches.push(WorkspaceSearchMatch {
            line_number,
            prefix: tail_chars(&line[..found.start()], PREVIEW_CONTEXT_CHARS),
            matched: line[found.start()..found.end()].to_string(),
            suffix: head_chars(&line[found.end()..], PREVIEW_CONTEXT_CHARS),
        });
        // Zero-width matches (possible in regex mode) must still advance.
        start = if found.end() > found.start() {
            found.end()
        } else {
            match line[found.end()..].char_indices().nth(1) {
                Some((offset, _)) => found.end() + offset,
                None => break,
            }
        };
    }
}

fn head_chars(text: &str, limit: usize) -> String {
    match text.char_indices().nth(limit) {
        Some((offset, _)) => text[..offset].to_string(),
        None => text.to_string(),
    }
}

fn tail_chars(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_string();
    }
    let skip = count - limit;
    match text.char_indices().nth(skip) {
        Some((offset, _)) => text[offset..].to_string(),
        None => text.to_string(),
    }
}
