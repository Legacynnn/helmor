//! Process tree + memory resource collection for the sidebar pill.
//!
//! Pure data collection — no Tauri surface. The IPC command lives in
//! `commands::system_commands::get_resource_snapshot`.

pub mod resources;

pub use resources::{
    collect_snapshot, CollectorContext, HelmorRollup, ProcessKind, ProcessNode, RepoGroup,
    ResourceCollector, ResourceSnapshot, SystemTotals, WorkspaceMeta, WorkspaceUsage,
};
