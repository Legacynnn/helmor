use std::path::Path;

use ignore::{DirEntry, WalkBuilder};

/// Directories we always skip even if not in `.gitignore`. Mirrors the
/// old hand-rolled walker's denylist so behaviour stays predictable for
/// repos without (or with a permissive) gitignore.
pub const SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "target",
    ".turbo",
    ".cache",
    ".vercel",
    ".parcel-cache",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
];

/// Shared `ignore::WalkBuilder` config used by path search and content
/// search. Both surfaces must see the same file universe — keeping the
/// config here means one place to audit.
///
/// - `.hidden(false)`: surface dotfiles (`.github/`, `.env.example`, …)
///   that developers actually want to find. The `.git/` directory is
///   still excluded via `filter_entry` below.
/// - `.git_ignore(true)`: honour the repo's `.gitignore` so generated
///   output (built JS, target/) doesn't pollute results.
/// - `filter_entry`: layered denylist for directories that should never
///   appear even if a user accidentally untracks them.
pub fn build_walker(root: &Path) -> WalkBuilder {
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .parents(true)
        .follow_links(false);
    builder.filter_entry(|entry: &DirEntry| {
        if entry.depth() == 0 {
            return true;
        }
        let Some(name) = entry.file_name().to_str() else {
            return true;
        };
        !SKIP_DIR_NAMES.contains(&name)
    });
    builder
}
