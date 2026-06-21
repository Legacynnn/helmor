//! Per-workspace filesystem watcher for `.helmor/plans/*.mdx`.
//!
//! The MDX plan surface refreshes on the [`PlanFileChanged`] ui-sync event,
//! but that only fires for host-initiated writes. When the agent revises a
//! plan with its own Edit/Write tools, no host command runs — so this watcher
//! observes the plans directory directly and publishes the event itself.
//!
//! Modeled on [`crate::git::watcher`]: one debounced watcher per operational
//! worktree workspace, synced with DB state via [`PlanWatcherManager::sync_from_db`].

use std::path::Path;

/// Derive a plan `slug` from a changed path, or `None` if the path is not a
/// plan document we should react to. Accepts only `*.mdx` files whose name does
/// not start with `.` (editor temp/swap files like `.foo.mdx.swp` are ignored).
// Consumed by the watcher manager in the same module (added next); the
// `#[allow]` keeps the standalone slug-helper commit clippy-clean until then.
#[allow(dead_code)]
pub(crate) fn slug_from_plan_path(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    if name.starts_with('.') {
        return None;
    }
    if path.extension()?.to_str()? != "mdx" {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    if stem.is_empty() {
        return None;
    }
    Some(stem.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn accepts_plain_mdx() {
        let p = PathBuf::from("/ws/.helmor/plans/my-plan.mdx");
        assert_eq!(slug_from_plan_path(&p).as_deref(), Some("my-plan"));
    }

    #[test]
    fn rejects_non_mdx() {
        for name in ["notes.txt", "plan.md", "plan.mdx.bak", "README"] {
            let p = PathBuf::from(format!("/ws/.helmor/plans/{name}"));
            assert_eq!(slug_from_plan_path(&p), None, "should reject {name}");
        }
    }

    #[test]
    fn rejects_editor_temp_and_dotfiles() {
        for name in [".my-plan.mdx.swp", ".my-plan.mdx", ".#my-plan.mdx"] {
            let p = PathBuf::from(format!("/ws/.helmor/plans/{name}"));
            assert_eq!(slug_from_plan_path(&p), None, "should reject {name}");
        }
    }
}
