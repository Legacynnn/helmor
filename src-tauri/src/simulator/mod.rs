//! Process-global simulator-surface slot + lifecycle.
//!
//! Mirrors `browser/mod.rs`'s `OnceLock<Mutex<Option<...>>>` pattern: the app
//! hosts at most one simulator surface at a time (one booted device per
//! workspace; PRD D7). The broker reads `current()` to know which workspace's
//! simulator is focused; the Tauri commands open/close the slot and register a
//! `SimulatorDriver` into the agent-control registry.

use std::sync::{Mutex, OnceLock};

use anyhow::{anyhow, Result};

use crate::preview::driver::PreviewSurfaceKind;

/// The currently open simulator surface, if any.
#[derive(Debug, Clone)]
pub struct SimulatorSurfaceState {
    pub workspace_id: String,
    pub kind: PreviewSurfaceKind,
    pub udid: String,
}

/// Process-global slot. `None` until a surface opens (or after `close`).
fn slot() -> &'static Mutex<Option<SimulatorSurfaceState>> {
    static SLOT: OnceLock<Mutex<Option<SimulatorSurfaceState>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Open (or replace) the simulator surface for `workspace_id` on `udid`.
pub fn open_surface(workspace_id: &str, kind: PreviewSurfaceKind, udid: &str) -> Result<()> {
    let mut guard = slot()
        .lock()
        .map_err(|_| anyhow!("simulator surface lock poisoned"))?;
    *guard = Some(SimulatorSurfaceState {
        workspace_id: workspace_id.to_string(),
        kind,
        udid: udid.to_string(),
    });
    Ok(())
}

/// Close the surface for `workspace_id`. No-op if absent or owned by another
/// workspace.
pub fn close_surface(workspace_id: &str) -> Result<()> {
    let mut guard = slot()
        .lock()
        .map_err(|_| anyhow!("simulator surface lock poisoned"))?;
    if guard
        .as_ref()
        .is_some_and(|s| s.workspace_id == workspace_id)
    {
        *guard = None;
    }
    Ok(())
}

/// Snapshot the current simulator surface, if one is open.
pub fn current() -> Option<SimulatorSurfaceState> {
    slot().lock().ok().and_then(|g| g.clone())
}

/// Run `f` with the current surface state (if any), holding the slot lock.
pub fn with<F, T>(f: F) -> Option<T>
where
    F: FnOnce(&SimulatorSurfaceState) -> T,
{
    let guard = slot().lock().ok()?;
    guard.as_ref().map(f)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_open_close_round_trips() {
        open_surface("ws-1", PreviewSurfaceKind::SimulatorIos, "UDID-1").unwrap();
        let state = current().unwrap();
        assert_eq!(state.workspace_id, "ws-1");
        assert_eq!(state.udid, "UDID-1");
        close_surface("ws-1").unwrap();
        assert!(current().is_none());
    }
}
