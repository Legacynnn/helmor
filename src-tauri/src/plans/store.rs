//! On-disk store for plan documents under `<workspace>/.helmor/plans/`.
//!
//! The `.helmor/` directory is git-excluded via the repo-local
//! `info/exclude` file (resolved with `git rev-parse --git-path`, so it
//! works inside linked worktrees) — mirroring
//! [`crate::workspace::agent_contexts`]. Plan metadata (title, lifecycle
//! status) lives in YAML frontmatter at the top of each `.mdx` file.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::git_ops;
use crate::plans::types::{PlanDoc, PlanLifecycle, PlanSummary};

/// Workspace-relative directory holding plan `.mdx` files.
const PLANS_SUBDIR: &str = ".helmor/plans";

/// The line we append to Git's local `info/exclude`. The leading slash
/// anchors to the worktree root.
const EXCLUDE_RULE: &str = "/.helmor/";

/// Comment line written above the rule, so anyone inspecting
/// `info/exclude` knows why it's there.
const EXCLUDE_COMMENT: &str = "# Helmor: local plan files (.helmor/plans).";

/// Resolve the exact `info/exclude` path Git reads for `workspace_dir`,
/// honouring linked worktrees.
fn resolve_git_exclude_path(workspace_dir: &Path) -> Result<PathBuf> {
    let raw = git_ops::run_git(
        [
            "rev-parse",
            "--path-format=absolute",
            "--git-path",
            "info/exclude",
        ],
        Some(workspace_dir),
    )
    .with_context(|| {
        format!(
            "run `git rev-parse --git-path info/exclude` in {}",
            workspace_dir.display()
        )
    })?;
    if raw.is_empty() {
        anyhow::bail!(
            "git returned an empty exclude path for {}",
            workspace_dir.display()
        );
    }
    Ok(PathBuf::from(raw))
}

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

/// Absolute path to the plans directory for `workspace_dir`.
fn plans_dir(workspace_dir: &Path) -> PathBuf {
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
        if let Some(end) = rest.find("\n---") {
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
        let content =
            format!("---\ntitle: \"{title}\"\nstatus: draft\nsummary: \"\"\n---\n\n# {title}\n\n");
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
    let path = plan_path(workspace_dir, slug);
    std::fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
    Ok(summary_for(slug, content))
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
            let content = std::fs::read_to_string(&path).unwrap_or_default();
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
