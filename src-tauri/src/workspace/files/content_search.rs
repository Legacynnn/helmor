use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use grep_matcher::{Match, Matcher};
use grep_regex::RegexMatcherBuilder;
use grep_searcher::SearcherBuilder;
use serde::Serialize;

use super::walker::build_walker;

pub const MAX_TOTAL_MATCHES: usize = 1000;
pub const MAX_FILES: usize = 50;
pub const MAX_MATCHES_PER_FILE: usize = 8;
pub const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_LINE_CHARS: usize = 500;
pub const MIN_QUERY_LEN: usize = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMatch {
    /// 1-based line number in the source file.
    pub line_number: u32,
    /// The matched line, trimmed to at most `MAX_LINE_CHARS` characters
    /// (centred on the first match when truncation is required).
    pub line: String,
    /// Highlight ranges as **UTF-16 code-unit offsets** within `line`.
    /// JS strings are UTF-16, so `String.prototype.slice` consumes these
    /// directly — byte offsets would corrupt the highlight on any
    /// non-ASCII line.
    pub match_ranges: Vec<(u32, u32)>,
    /// Up to one line of context before the match (raw, untrimmed except
    /// for the line-length cap).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_after: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchHit {
    pub absolute_path: String,
    pub relative_path: String,
    pub file_name: String,
    pub matches: Vec<ContentMatch>,
    /// Total matches the file actually contained (before per-file cap),
    /// so the UI can render "+N more" affordances.
    pub total_matches_in_file: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchResult {
    pub hits: Vec<ContentSearchHit>,
    /// Files with at least one match (before file-count cap). Drives the
    /// "Showing N of M files" banner.
    pub total_files_matched: u32,
    pub truncated: bool,
}

pub fn search_content(workspace_root_path: &str, query: &str) -> Result<ContentSearchResult> {
    let trimmed = query.trim();
    if trimmed.chars().count() < MIN_QUERY_LEN {
        return Ok(ContentSearchResult {
            hits: Vec::new(),
            total_files_matched: 0,
            truncated: false,
        });
    }

    let root = PathBuf::from(workspace_root_path);
    if !root.exists() || !root.is_dir() {
        return Err(anyhow!("workspace not found"));
    }
    let canonical_root = fs::canonicalize(&root).context("canonicalize root")?;

    let pattern = escape_regex_meta(trimmed);
    let has_uppercase = trimmed.chars().any(|c| c.is_uppercase());
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(!has_uppercase)
        .build(&pattern)
        .context("build regex matcher")?;

    let mut searcher = SearcherBuilder::new()
        .before_context(1)
        .after_context(1)
        .build();

    let mut hits: Vec<ContentSearchHit> = Vec::new();
    let mut total_matches = 0usize;
    let mut total_files_matched = 0u32;
    let mut truncated = false;

    for dir_entry in build_walker(&canonical_root).build() {
        let entry = match dir_entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let absolute = entry.path().to_path_buf();
        if looks_binary(&absolute) {
            continue;
        }
        let relative = absolute
            .strip_prefix(&canonical_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| absolute.to_string_lossy().to_string());
        let file_name = absolute
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let mut collector = FileMatchCollector::new(&matcher);
        let search_outcome = searcher.search_path(&matcher, &absolute, &mut collector);
        if search_outcome.is_err() {
            // Binary or invalid UTF-8 — `grep-searcher` returns an error
            // we treat as "skip this file" rather than aborting the run.
            continue;
        }

        let FileMatchCollector {
            matches,
            total_in_file,
            ..
        } = collector;

        if total_in_file == 0 {
            continue;
        }

        total_files_matched += 1;

        if hits.len() >= MAX_FILES || total_matches >= MAX_TOTAL_MATCHES {
            truncated = true;
            continue;
        }

        let remaining = MAX_TOTAL_MATCHES.saturating_sub(total_matches);
        let take = matches.len().min(remaining);
        if take == 0 {
            truncated = true;
            continue;
        }
        let mut bounded = matches;
        bounded.truncate(take);
        total_matches += bounded.len();
        if (total_in_file as usize) > bounded.len() {
            truncated = true;
        }

        hits.push(ContentSearchHit {
            absolute_path: absolute.to_string_lossy().to_string(),
            relative_path: relative,
            file_name,
            matches: bounded,
            total_matches_in_file: total_in_file,
        });
    }

    hits.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(ContentSearchResult {
        hits,
        total_files_matched,
        truncated,
    })
}

struct FileMatchCollector<'m, M: Matcher> {
    matcher: &'m M,
    matches: Vec<ContentMatch>,
    total_in_file: u32,
    pending_before: Option<String>,
    last_match_idx: Option<usize>,
}

impl<'m, M: Matcher> FileMatchCollector<'m, M> {
    fn new(matcher: &'m M) -> Self {
        Self {
            matcher,
            matches: Vec::new(),
            total_in_file: 0,
            pending_before: None,
            last_match_idx: None,
        }
    }
}

impl<'m, M: Matcher> grep_searcher::Sink for FileMatchCollector<'m, M> {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &grep_searcher::Searcher,
        mat: &grep_searcher::SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        self.total_in_file = self.total_in_file.saturating_add(1);
        if self.matches.len() >= MAX_MATCHES_PER_FILE {
            self.pending_before = None;
            return Ok(true);
        }

        let line_number = mat.line_number().unwrap_or(0) as u32;
        let raw = String::from_utf8_lossy(mat.bytes()).to_string();
        let stripped = raw.trim_end_matches(['\n', '\r']);

        let mut byte_ranges: Vec<Match> = Vec::new();
        let _ = self.matcher.find_iter(stripped.as_bytes(), |m| {
            byte_ranges.push(m);
            true
        });

        let (line, adjusted_byte_ranges) = trim_line_around(stripped, &byte_ranges);
        let match_ranges = byte_ranges_to_utf16(&line, &adjusted_byte_ranges);

        let context_before = self.pending_before.take();
        self.matches.push(ContentMatch {
            line_number,
            line,
            match_ranges,
            context_before,
            context_after: None,
        });
        self.last_match_idx = Some(self.matches.len() - 1);
        Ok(true)
    }

    fn context(
        &mut self,
        _searcher: &grep_searcher::Searcher,
        ctx: &grep_searcher::SinkContext<'_>,
    ) -> Result<bool, Self::Error> {
        let raw = String::from_utf8_lossy(ctx.bytes()).to_string();
        let stripped = raw.trim_end_matches(['\n', '\r']).to_string();
        let capped = cap_line(&stripped);

        match ctx.kind() {
            grep_searcher::SinkContextKind::Before => {
                self.pending_before = Some(capped);
            }
            grep_searcher::SinkContextKind::After => {
                if let Some(idx) = self.last_match_idx {
                    if let Some(m) = self.matches.get_mut(idx) {
                        if m.context_after.is_none() {
                            m.context_after = Some(capped);
                        }
                    }
                }
            }
            grep_searcher::SinkContextKind::Other => {}
        }
        Ok(true)
    }

    fn context_break(&mut self, _searcher: &grep_searcher::Searcher) -> Result<bool, Self::Error> {
        self.pending_before = None;
        self.last_match_idx = None;
        Ok(true)
    }
}

/// Trim a line to at most `MAX_LINE_CHARS` characters, attempting to
/// keep the first match centred. Returns the new line plus byte-range
/// matches translated to the trimmed line's coordinates. Lines shorter
/// than the cap pass through untouched.
fn trim_line_around(line: &str, matches: &[Match]) -> (String, Vec<Match>) {
    if line.chars().count() <= MAX_LINE_CHARS {
        return (line.to_string(), matches.to_vec());
    }

    let first = matches.first().map(|m| m.start()).unwrap_or(0);
    let approx_window_bytes = MAX_LINE_CHARS * 4; // generous upper bound for UTF-8
    let start_byte = first.saturating_sub(approx_window_bytes / 3);
    let start_byte = floor_char_boundary(line, start_byte);
    let end_byte = (start_byte + approx_window_bytes).min(line.len());
    let end_byte = floor_char_boundary(line, end_byte);
    let mut slice = &line[start_byte..end_byte];

    // Tighten to exactly MAX_LINE_CHARS by char count.
    let char_count = slice.chars().count();
    if char_count > MAX_LINE_CHARS {
        let mut indices = slice.char_indices();
        let cut = indices
            .nth(MAX_LINE_CHARS)
            .map(|(i, _)| i)
            .unwrap_or(slice.len());
        slice = &slice[..cut];
    }

    let trimmed = slice.to_string();
    let adjusted: Vec<Match> = matches
        .iter()
        .filter_map(|m| {
            let s = m.start().checked_sub(start_byte)?;
            let e = m.end().checked_sub(start_byte)?;
            if e > trimmed.len() {
                return None;
            }
            Some(Match::new(s, e))
        })
        .collect();
    (trimmed, adjusted)
}

fn cap_line(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        return line.to_string();
    }
    line.chars().take(MAX_LINE_CHARS).collect()
}

fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
    if idx >= s.len() {
        return s.len();
    }
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

/// Sniff the first 8 KB of a file for a NUL byte. Mirrors how ripgrep and
/// other grep tools decide a file is binary. Cheap (one short read) and
/// predictable — `grep-searcher`'s built-in `BinaryDetection::quit` would
/// still emit matches found before the NUL, which is not what we want.
fn looks_binary(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return true;
    };
    let mut buf = [0u8; 8192];
    let read = file.read(&mut buf).unwrap_or(0);
    buf[..read].contains(&0)
}

/// Escape regex metacharacters so the user's query is treated as a literal.
/// Mirrors `regex::escape`'s set; we hand-roll this to avoid pulling the
/// `regex` crate as a direct dep (it's already transitively present via
/// `grep-regex`, but a direct path-dep would expose API surface we don't use).
fn escape_regex_meta(input: &str) -> String {
    const META: &[char] = &[
        '\\', '.', '+', '*', '?', '(', ')', '|', '[', ']', '{', '}', '^', '$', '#', '&', '-', '~',
    ];
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if META.contains(&ch) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn byte_ranges_to_utf16(line: &str, byte_ranges: &[Match]) -> Vec<(u32, u32)> {
    if byte_ranges.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(byte_ranges.len());
    for r in byte_ranges {
        let start = r.start().min(line.len());
        let end = r.end().min(line.len());
        if end <= start {
            continue;
        }
        let prefix_u16 = line[..start].encode_utf16().count() as u32;
        let span_u16 = line[start..end].encode_utf16().count() as u32;
        out.push((prefix_u16, prefix_u16 + span_u16));
    }
    out
}
