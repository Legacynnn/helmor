mod changes;
mod diff_stats;
mod editor;
mod replace;
mod search;
mod support;
mod tree;
mod types;

pub use changes::{
    discard_workspace_file, list_workspace_changes, list_workspace_changes_for_workspace,
    stage_workspace_file, unstage_workspace_file,
};
pub use diff_stats::{list_workspace_diff_stats, WorkspaceDiffStat};
pub use editor::{
    list_editor_files, list_workspace_files, read_editor_file, read_file_at_ref, stat_editor_file,
    write_editor_file,
};
pub use replace::{replace_in_workspace, WorkspaceReplaceRequest, WorkspaceReplaceResponse};
pub use search::{search_workspace, WorkspaceSearchRequest, WorkspaceSearchResponse};
pub use tree::{
    list_workspace_dir, list_workspace_tree, WorkspaceTreeEntry, WorkspaceTreeResponse,
};
pub use types::{
    EditorFileListItem, EditorFileReadResponse, EditorFileStatResponse, EditorFileWriteResponse,
};

#[cfg(test)]
mod tests;
