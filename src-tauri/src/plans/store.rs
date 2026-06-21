//! On-disk store for plan documents under `<workspace>/.helmor/plans/`.
//!
//! The `.helmor/` directory is git-excluded via the repo-local
//! `info/exclude` file (resolved with `git rev-parse --git-path`, so it
//! works inside linked worktrees) — mirroring
//! [`crate::workspace::agent_contexts`]. Plan metadata (title, lifecycle
//! status) lives in YAML frontmatter at the top of each `.mdx` file.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::plans::types::{PlanDoc, PlanLifecycle, PlanSummary};
use crate::workspace::agent_contexts::resolve_git_exclude_path;

/// Workspace-relative directory holding plan `.mdx` files.
const PLANS_SUBDIR: &str = ".helmor/plans";

/// The line we append to Git's local `info/exclude`. The leading slash
/// anchors to the worktree root.
const EXCLUDE_RULE: &str = "/.helmor/";

/// Comment line written above the rule, so anyone inspecting
/// `info/exclude` knows why it's there.
const EXCLUDE_COMMENT: &str = "# Helmor: local plan files (.helmor/plans).";

/// Idempotently append the `/.helmor/` rule to the repo-local git exclude
/// for `workspace_dir`. Running twice does not duplicate the rule, and any
/// user-authored content in the exclude file is preserved.
pub fn ensure_excluded(workspace_dir: &Path) -> Result<()> {
    let exclude_path = resolve_git_exclude_path(workspace_dir)?;

    let info_dir = exclude_path.parent().with_context(|| {
        format!(
            "exclude path has no parent directory: {}",
            exclude_path.display()
        )
    })?;
    std::fs::create_dir_all(info_dir).with_context(|| format!("create {}", info_dir.display()))?;

    let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == EXCLUDE_RULE) {
        return Ok(());
    }

    let mut buffer = existing;
    if !buffer.is_empty() && !buffer.ends_with('\n') {
        buffer.push('\n');
    }
    buffer.push_str(EXCLUDE_COMMENT);
    buffer.push('\n');
    buffer.push_str(EXCLUDE_RULE);
    buffer.push('\n');
    std::fs::write(&exclude_path, buffer)
        .with_context(|| format!("write {}", exclude_path.display()))?;
    Ok(())
}

/// Backfill the `/.helmor/` git-exclude rule for existing operational
/// worktree workspaces. New workspace creation reaches `ensure_excluded`
/// via [`create_plan`]/[`write_plan`]; this startup repair path covers
/// workspaces created before plan storage shipped, so a pre-existing
/// `.helmor/` never leaks into the user's tracked tree. Mirrors
/// [`crate::workspace::agent_contexts::ensure_existing_worktree_contexts`].
/// Best-effort: per-workspace failures are logged and skipped.
pub fn ensure_existing_worktree_plans_excluded() -> Result<usize> {
    let connection = crate::db::read_conn()?;
    let mut stmt = connection.prepare(&format!(
        "SELECT w.id, r.name, w.directory_name
         FROM workspaces w
         JOIN repos r ON r.id = w.repository_id
         WHERE w.state {} AND COALESCE(w.mode, 'worktree') = 'worktree'",
        crate::workspace_state::OPERATIONAL_FILTER
    ))?;
    let workspaces: Vec<(String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .filter_map(|row| row.ok())
        .collect();
    drop(stmt);
    drop(connection);

    let mut ensured = 0;
    for (workspace_id, repo_name, directory_name) in workspaces {
        let workspace_dir = match crate::data_dir::workspace_dir(&repo_name, &directory_name) {
            Ok(path) => path,
            Err(error) => {
                tracing::warn!(
                    workspace_id = %workspace_id,
                    error = %format!("{error:#}"),
                    "Failed to resolve workspace dir while backfilling .helmor/ exclude"
                );
                continue;
            }
        };
        if !workspace_dir.is_dir() {
            continue;
        }
        match ensure_excluded(&workspace_dir) {
            Ok(()) => ensured += 1,
            Err(error) => {
                tracing::warn!(
                    workspace_id = %workspace_id,
                    path = %workspace_dir.display(),
                    error = %format!("{error:#}"),
                    "Failed to backfill .helmor/ exclude — workspace still usable"
                );
            }
        }
    }
    Ok(ensured)
}

/// Absolute path to the plans directory for `workspace_dir`.
pub(crate) fn plans_dir(workspace_dir: &Path) -> PathBuf {
    workspace_dir.join(PLANS_SUBDIR)
}

/// Absolute path to a plan's `.mdx` file.
fn plan_path(workspace_dir: &Path, slug: &str) -> PathBuf {
    plans_dir(workspace_dir).join(format!("{slug}.mdx"))
}

/// Parse `title` and `status` out of a leading `---` YAML frontmatter
/// block. Tolerant of quoted/unquoted values. Defaults: status `Draft`,
/// title `None` (caller falls back to the slug).
fn parse_frontmatter(content: &str) -> (Option<String>, PlanLifecycle) {
    let mut title = None;
    let mut status = PlanLifecycle::Draft;

    if let Some(rest) = content.strip_prefix("---\n") {
        if let Some(end) = find_closing_fence(rest) {
            for line in rest[..end].lines() {
                let line = line.trim();
                if let Some(value) = line.strip_prefix("title:") {
                    let value = value.trim().trim_matches('"').trim_matches('\'');
                    if !value.is_empty() {
                        title = Some(value.to_string());
                    }
                } else if let Some(value) = line.strip_prefix("status:") {
                    let value = value.trim().trim_matches('"').trim_matches('\'');
                    status = match value {
                        "approved" => PlanLifecycle::Approved,
                        "handed-off" => PlanLifecycle::HandedOff,
                        _ => PlanLifecycle::Draft,
                    };
                }
            }
        }
    }

    (title, status)
}

/// Find the byte offset of the closing `---` frontmatter fence within
/// `rest` (the content *after* the opening `---\n`).
///
/// Only a `\n---` that is itself followed by a line break (`\n`/`\r`) or
/// end-of-string counts as the fence. A `\n---` followed by other text on
/// the same line is a Markdown horizontal rule or a `---`-prefixed value,
/// not a fence, so we skip past it and keep scanning. Returns the offset of
/// the leading `\n` (so `rest[..end]` is the frontmatter body).
fn find_closing_fence(rest: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(rel) = rest[from..].find("\n---") {
        let at = from + rel;
        // Char immediately after the `\n---`.
        let after = at + "\n---".len();
        let is_fence = match rest[after..].chars().next() {
            None => true,                    // end-of-string
            Some('\n') | Some('\r') => true, // line break -> real fence
            _ => false,                      // trailing text -> HR/value
        };
        if is_fence {
            return Some(at);
        }
        // Advance past this `\n` so the next search can find a later fence.
        from = at + 1;
    }
    None
}

/// Build a [`PlanSummary`] from on-disk content for `slug`.
fn summary_for(slug: &str, content: &str) -> PlanSummary {
    let (title, status) = parse_frontmatter(content);
    PlanSummary {
        slug: slug.to_string(),
        title: title.unwrap_or_else(|| slug.to_string()),
        status,
        path: format!("{PLANS_SUBDIR}/{slug}.mdx"),
    }
}

/// Create `<slug>.mdx` with default frontmatter if it does not already
/// exist, ensuring `.helmor/` is git-excluded and the plans directory
/// exists. Returns the summary parsed from the on-disk content.
pub fn create_plan(workspace_dir: &Path, slug: &str, title: &str) -> Result<PlanSummary> {
    ensure_excluded(workspace_dir)?;

    let dir = plans_dir(workspace_dir);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

    let path = plan_path(workspace_dir, slug);
    if !path.exists() {
        let content = format!(
            "---\ntitle: \"{title}\"\nstatus: {}\nsummary: \"\"\n---\n\n# {title}\n\n",
            PlanLifecycle::Draft.as_str()
        );
        std::fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    }

    let on_disk =
        std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    Ok(summary_for(slug, &on_disk))
}

/// Read a plan's summary and full content.
pub fn read_plan(workspace_dir: &Path, slug: &str) -> Result<PlanDoc> {
    let path = plan_path(workspace_dir, slug);
    let content =
        std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let summary = summary_for(slug, &content);
    Ok(PlanDoc { summary, content })
}

/// Overwrite a plan's `.mdx` content, returning the summary parsed from
/// the new content.
pub fn write_plan(workspace_dir: &Path, slug: &str, content: &str) -> Result<PlanSummary> {
    ensure_excluded(workspace_dir)?;

    let dir = plans_dir(workspace_dir);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

    let path = plan_path(workspace_dir, slug);
    std::fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
    Ok(summary_for(slug, content))
}

/// Delete a plan's `.mdx` file. Idempotent: a missing file is treated as
/// already deleted. The `.helmor/plans/` directory is left in place.
pub fn delete_plan(workspace_dir: &Path, slug: &str) -> Result<()> {
    let path = plan_path(workspace_dir, slug);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err).with_context(|| format!("delete {}", path.display())),
    }
}

/// List all `*.mdx` plans in `.helmor/plans/`, sorted by slug. A missing
/// or empty directory yields an empty vec.
pub fn list_plans(workspace_dir: &Path) -> Result<Vec<PlanSummary>> {
    let dir = plans_dir(workspace_dir);
    let mut out = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("mdx") {
                continue;
            }
            let Some(slug) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(error) => {
                    tracing::warn!(
                        path = %path.display(),
                        error = %error,
                        "Failed to read plan file while listing — skipping"
                    );
                    continue;
                }
            };
            out.push(summary_for(slug, &content));
        }
    }

    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

/// Set a plan's lifecycle status. Replaces the existing `status:` line in
/// frontmatter, or prepends a fresh frontmatter block if the file has none.
pub fn set_status(workspace_dir: &Path, slug: &str, status: PlanLifecycle) -> Result<PlanSummary> {
    let doc = read_plan(workspace_dir, slug)?;

    let updated = if doc.content.starts_with("---\n") {
        replace_status_line(&doc.content, status)
    } else {
        format!(
            "---\ntitle: \"{}\"\nstatus: {}\n---\n\n{}",
            doc.summary.title,
            status.as_str(),
            doc.content
        )
    };

    write_plan(workspace_dir, slug, &updated)
}

/// Replace the first `status:` frontmatter line with the given status,
/// preserving the rest of the document (including a trailing newline).
fn replace_status_line(content: &str, status: PlanLifecycle) -> String {
    let mut replaced = false;
    let lines: Vec<String> = content
        .lines()
        .map(|line| {
            if !replaced && line.trim_start().starts_with("status:") {
                replaced = true;
                format!("status: {}", status.as_str())
            } else {
                line.to_string()
            }
        })
        .collect();

    let mut out = lines.join("\n");
    if content.ends_with('\n') {
        out.push('\n');
    }
    out
}
