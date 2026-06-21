//! Per-workspace filesystem watcher for `.helmor/plans/*.mdx`.
//!
//! The MDX plan surface refreshes on the [`PlanFileChanged`] ui-sync event,
//! but that only fires for host-initiated writes. When the agent revises a
//! plan with its own Edit/Write tools, no host command runs — so this watcher
//! observes the plans directory directly and publishes the event itself.
//!
//! Modeled on [`crate::git::watcher`]: one debounced watcher per operational
//! worktree workspace, synced with DB state via [`PlanWatcherManager::sync_from_db`].

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{Context, Result};
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, RecommendedCache};
use tauri::{AppHandle, Runtime};

use crate::models::db;
use crate::plans::store;

/// Derive a plan `slug` from a changed path, or `None` if the path is not a
/// plan document we should react to. Accepts only `*.mdx` files whose name does
/// not start with `.` (editor temp/swap files like `.foo.mdx.swp` are ignored).
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

/// A live watcher bound to one workspace's `.helmor/plans/` directory.
struct PlanWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
}

/// Minimal record needed to start a watcher: workspace id + on-disk dir.
struct WatchableWorkspace {
    id: String,
    repo_name: String,
    directory_name: String,
}

impl WatchableWorkspace {
    fn workspace_dir(&self) -> Result<PathBuf> {
        crate::data_dir::workspace_dir(&self.repo_name, &self.directory_name)
    }
}

/// One plan watcher per operational worktree workspace.
pub struct PlanWatcherManager {
    watchers: Mutex<HashMap<String, PlanWatcher>>,
}

impl Default for PlanWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PlanWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// Sync watchers with current DB state: start one per operational worktree
    /// workspace that isn't already watched, and drop watchers for workspaces
    /// that are gone. Mirrors `git::watcher::GitWatcherManager::sync_from_db`.
    pub fn sync_from_db<R: Runtime>(&self, app: AppHandle<R>) -> Result<()> {
        let workspaces = load_watchable_workspaces()?;
        let want: HashMap<&str, &WatchableWorkspace> =
            workspaces.iter().map(|w| (w.id.as_str(), w)).collect();

        let mut watchers = self
            .watchers
            .lock()
            .map_err(|_| anyhow::anyhow!("plan watcher lock poisoned"))?;

        watchers.retain(|id, _| want.contains_key(id.as_str()));

        for (id, ws) in &want {
            if watchers.contains_key(*id) {
                continue;
            }
            match start_watcher(&app, ws) {
                Ok(watcher) => {
                    tracing::info!(workspace_id = %id, "Started plan watcher");
                    watchers.insert(id.to_string(), watcher);
                }
                Err(e) => {
                    tracing::warn!(workspace_id = %id, "Failed to start plan watcher: {e:#}");
                }
            }
        }
        Ok(())
    }

    /// Stop watching a single workspace.
    pub fn unwatch(&self, workspace_id: &str) {
        if let Ok(mut watchers) = self.watchers.lock() {
            if watchers.remove(workspace_id).is_some() {
                tracing::debug!(workspace_id, "Stopped plan watcher");
            }
        }
    }

    /// Stop all watchers (app shutdown).
    pub fn shutdown(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            let count = watchers.len();
            watchers.clear();
            if count > 0 {
                tracing::info!(count, "Shut down all plan watchers");
            }
        }
    }
}

/// Start a debounced watcher on `<workspace>/.helmor/plans/`. Ensures the dir
/// exists (and is git-excluded) first, so the first plan write is observed.
fn start_watcher<R: Runtime>(app: &AppHandle<R>, ws: &WatchableWorkspace) -> Result<PlanWatcher> {
    let workspace_dir = ws.workspace_dir()?;
    if !workspace_dir.is_dir() {
        anyhow::bail!("Workspace directory missing: {}", workspace_dir.display());
    }

    // Make sure the plans dir exists and `.helmor/` stays git-excluded, so the
    // watcher has a real path to watch even before the first plan is created.
    if let Err(e) = store::ensure_excluded(&workspace_dir) {
        tracing::warn!(
            workspace_id = %ws.id,
            "Failed to write .helmor/ git-exclude rule: {e:#}"
        );
    }
    let dir = store::plans_dir(&workspace_dir);
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

    let workspace_id = ws.id.clone();
    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: notify_debouncer_full::DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(errors) => {
                    for e in errors {
                        tracing::warn!(workspace_id = %workspace_id, "plan watch error: {e}");
                    }
                    return;
                }
            };

            let mut slugs: HashSet<String> = HashSet::new();
            for event in &events {
                for path in &event.event.paths {
                    if let Some(slug) = slug_from_plan_path(path) {
                        slugs.insert(slug);
                    }
                }
            }

            for slug in slugs {
                crate::ui_sync::publish(
                    &app_handle,
                    crate::ui_sync::UiMutationEvent::PlanFileChanged {
                        workspace_id: workspace_id.clone(),
                        slug,
                    },
                );
            }
        },
    )
    .context("Failed to create plan debouncer")?;

    debouncer
        .watch(&dir, RecursiveMode::NonRecursive)
        .with_context(|| format!("Failed to watch {}", dir.display()))?;

    Ok(PlanWatcher {
        _debouncer: debouncer,
    })
}

/// Operational worktree workspaces (the only ones with a `.helmor/plans/` dir).
/// Mirrors the query in `store::ensure_existing_worktree_plans_excluded`.
fn load_watchable_workspaces() -> Result<Vec<WatchableWorkspace>> {
    let connection = db::read_conn()?;
    let mut stmt = connection.prepare(&format!(
        "SELECT w.id, r.name, w.directory_name
         FROM workspaces w
         JOIN repos r ON r.id = w.repository_id
         WHERE w.state {} AND COALESCE(w.mode, 'worktree') = 'worktree'",
        crate::workspace_state::OPERATIONAL_FILTER
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchableWorkspace {
            id: row.get(0)?,
            repo_name: row.get(1)?,
            directory_name: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
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
