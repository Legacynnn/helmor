//! Aggregate per-workspace diff stats for the dashboard kanban board.
//!
//! This is deliberately cheap compared to [`super::changes::list_workspace_changes`]
//! (which runs seven git invocations per workspace to power the inspector's
//! three change groups). The board only needs one headline number per card —
//! "how much work lives in this branch vs. its base" — so we run a single
//! `git diff --numstat <target>` per workspace and sum it.
//!
//! It is intentionally NOT folded into `list_workspace_groups` (the sidebar
//! payload), which must stay a pure DB read. The board fetches this on its own
//! React Query while it is mounted.

use anyhow::Result;

use crate::{git_ops, models::workspaces as workspace_models, workspace::helpers};

/// Aggregate diff size for one workspace, relative to its target branch and
/// including uncommitted working-tree edits (`git diff <target>` semantics).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDiffStat {
    pub workspace_id: String,
    pub insertions: u32,
    pub deletions: u32,
    pub files_changed: u32,
}

/// How many workspaces we diff concurrently. Each diff spawns a short-lived
/// git process; capping the batch keeps a large board from forking hundreds of
/// processes at once.
const DIFF_CONCURRENCY: usize = 8;

/// Compute diff stats for every live workspace. Workspaces whose directory is
/// missing, or whose git diff fails, contribute a zeroed entry rather than
/// failing the whole call — the board should still render.
pub fn list_workspace_diff_stats() -> Result<Vec<WorkspaceDiffStat>> {
    let records = workspace_models::load_workspace_records()?;
    let mut out = Vec::with_capacity(records.len());
    for chunk in records.chunks(DIFF_CONCURRENCY) {
        let stats = std::thread::scope(|s| {
            let handles: Vec<_> = chunk
                .iter()
                .map(|record| s.spawn(|| diff_stat_for_record(record)))
                .collect();
            handles
                .into_iter()
                .map(|h| h.join().unwrap_or_else(|_| zeroed("")))
                .collect::<Vec<_>>()
        });
        out.extend(stats.into_iter().filter(|s| !s.workspace_id.is_empty()));
    }
    Ok(out)
}

fn zeroed(workspace_id: &str) -> WorkspaceDiffStat {
    WorkspaceDiffStat {
        workspace_id: workspace_id.to_string(),
        insertions: 0,
        deletions: 0,
        files_changed: 0,
    }
}

fn diff_stat_for_record(record: &workspace_models::WorkspaceRecord) -> WorkspaceDiffStat {
    let Ok(root) = helpers::workspace_path(record) else {
        return zeroed(&record.id);
    };
    if !root.is_dir() {
        return zeroed(&record.id);
    }
    let Ok(target_ref) = super::changes::resolve_target_ref_for_workspace(&root, Some(&record.id))
    else {
        return zeroed(&record.id);
    };
    let numstat = git_ops::run_git(["diff", "--numstat", target_ref.as_str()], Some(&root))
        .unwrap_or_default();
    let (insertions, deletions, files_changed) = parse_numstat_totals(&numstat);
    WorkspaceDiffStat {
        workspace_id: record.id.clone(),
        insertions,
        deletions,
        files_changed,
    }
}

/// Sum a `git diff --numstat` payload into `(insertions, deletions, files)`.
///
/// Each line is `<added>\t<deleted>\t<path>`. Binary files render as `-\t-\t…`
/// — we still count them as a changed file but contribute no line counts.
fn parse_numstat_totals(numstat: &str) -> (u32, u32, u32) {
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    let mut files = 0u32;
    for line in numstat.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut cols = line.splitn(3, '\t');
        let added = cols.next().unwrap_or("");
        let removed = cols.next().unwrap_or("");
        // A path column must exist for this to be a real numstat row.
        if cols.next().is_none() {
            continue;
        }
        files += 1;
        insertions = insertions.saturating_add(added.parse::<u32>().unwrap_or(0));
        deletions = deletions.saturating_add(removed.parse::<u32>().unwrap_or(0));
    }
    (insertions, deletions, files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_added_and_removed_across_files() {
        let numstat = "3\t1\tsrc/a.rs\n10\t0\tsrc/b.rs\n0\t5\tsrc/c.rs\n";
        assert_eq!(parse_numstat_totals(numstat), (13, 6, 3));
    }

    #[test]
    fn counts_binary_files_without_line_stats() {
        let numstat = "-\t-\tassets/logo.png\n4\t2\tsrc/a.rs\n";
        assert_eq!(parse_numstat_totals(numstat), (4, 2, 2));
    }

    #[test]
    fn ignores_blank_and_malformed_lines() {
        let numstat = "\n  \n5\t5\nnot-a-row\n2\t2\tsrc/ok.rs\n";
        // Lines without a path column are skipped; only the last is a real row.
        assert_eq!(parse_numstat_totals(numstat), (2, 2, 1));
    }

    #[test]
    fn empty_input_is_all_zero() {
        assert_eq!(parse_numstat_totals(""), (0, 0, 0));
    }
}
