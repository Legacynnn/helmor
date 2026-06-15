//! Per-repo "essential files" copying.
//!
//! New worktree workspaces start from a clean checkout of a branch, so
//! git-ignored but essential files (`.env`, API keys, local config) are
//! missing. This module detects secret-like untracked files and copies a
//! repo-configured set of files/folders into a freshly created workspace.
//!
//! Three pure-ish pieces, each independently testable:
//! - [`is_secret_like`] — pattern match on a repo-relative path.
//! - [`detect_copy_candidates`] — untracked files filtered by the pattern.
//! - [`copy_paths`] — recursive, skip-if-exists copy of files/folders.
//! - [`effective_copy_set`] — union of detection + explicit list, minus
//!   the user's exclusions.

use std::{
    collections::BTreeSet,
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result};

use crate::git_ops;

/// Glob-free match for "secret-like" untracked files worth auto-copying
/// into new workspaces. Operates on the repo-relative path string as
/// returned by `git ls-files --others` (forward-slash separated, but we
/// normalise just in case).
pub fn is_secret_like(relative_path: &str) -> bool {
    let path = relative_path.replace('\\', "/");
    let file_name = path.rsplit('/').next().unwrap_or(path.as_str());
    let lower_name = file_name.to_ascii_lowercase();
    let lower_path = path.to_ascii_lowercase();

    // Anything under a `secrets/` (or `.secrets/`) directory, at any depth.
    if lower_path
        .split('/')
        .any(|segment| segment == "secrets" || segment == ".secrets")
    {
        return true;
    }

    // `.env` and `.env.<suffix>` (`.env.local`, `.env.production`, ...).
    if lower_name == ".env" || lower_name.starts_with(".env.") {
        return true;
    }

    // Secret material by extension.
    const SECRET_EXTS: &[&str] = &["key", "pem", "p12", "pfx", "keystore", "jks"];
    if let Some((_, ext)) = lower_name.rsplit_once('.') {
        if SECRET_EXTS.contains(&ext) {
            return true;
        }
    }

    // Local config overrides: `settings.local.json`, `config.local.yaml`, ...
    if lower_name.contains(".local.") {
        return true;
    }

    // `credentials`, `credentials.json`, `credentials.yml`, ...
    if lower_name.starts_with("credentials") {
        return true;
    }

    false
}

/// List repo-relative untracked files that look secret-like. Sorted and
/// de-duplicated so the UI and the copy step see a stable order.
pub fn detect_copy_candidates(repo_root: &Path) -> Result<Vec<String>> {
    let mut candidates: Vec<String> = git_ops::list_untracked_files(repo_root)?
        .into_iter()
        .filter(|path| is_secret_like(path))
        .collect();
    candidates.sort();
    candidates.dedup();
    Ok(candidates)
}

/// Compute the final set of repo-relative paths to copy into a new
/// workspace. Auto-detected secret-like files are included when
/// `auto_copy_untracked` is on, minus anything the user excluded, unioned
/// with the explicit `copy_files` list. Returns a sorted, de-duplicated
/// list (a `BTreeSet` underneath).
pub fn effective_copy_set(
    repo_root: &Path,
    auto_copy_untracked: bool,
    copy_files: &[String],
    copy_exclude: &[String],
) -> Vec<String> {
    let mut set: BTreeSet<String> = BTreeSet::new();

    if auto_copy_untracked {
        let excluded: BTreeSet<&str> = copy_exclude.iter().map(String::as_str).collect();
        // Detection failures (e.g. not a git repo) shouldn't wipe out the
        // explicit list — just skip the auto-detected portion.
        if let Ok(detected) = detect_copy_candidates(repo_root) {
            for path in detected {
                if !excluded.contains(path.as_str()) {
                    set.insert(path);
                }
            }
        }
    }

    for path in copy_files {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            set.insert(trimmed.to_string());
        }
    }

    set.into_iter().collect()
}

/// Copy each relative path (file or directory) from `src_root` into
/// `dst_root`, preserving structure. Directories copy recursively.
/// Existing destination files are never overwritten (skip-if-exists).
/// Missing sources, symlinks, and special files are skipped silently.
/// Returns the list of destination files actually created.
pub fn copy_paths(
    src_root: &Path,
    dst_root: &Path,
    relative_paths: &[String],
) -> Result<Vec<PathBuf>> {
    let mut copied = Vec::new();
    for relative in relative_paths {
        let rel = relative.trim();
        if rel.is_empty() {
            continue;
        }
        // Refuse absolute paths or `..` escapes — these settings are
        // user-supplied and must stay inside the workspace.
        if is_unsafe_relative(rel) {
            tracing::warn!("Skipping unsafe copy path: {rel}");
            continue;
        }
        let src = src_root.join(rel);
        let dst = dst_root.join(rel);
        match fs::symlink_metadata(&src) {
            Ok(meta) if meta.is_dir() => copy_dir_recursive(&src, &dst, &mut copied)?,
            Ok(meta) if meta.is_file() => copy_one_file(&src, &dst, &mut copied)?,
            // Missing source or symlink/special — skip without erroring so
            // one stale entry can't block workspace creation.
            _ => continue,
        }
    }
    Ok(copied)
}

/// Reject anything that isn't a plain forward relative path: absolute
/// paths, drive prefixes, and `..` traversal.
fn is_unsafe_relative(rel: &str) -> bool {
    let path = Path::new(rel);
    path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
    })
}

fn copy_one_file(src: &Path, dst: &Path, copied: &mut Vec<PathBuf>) -> Result<()> {
    // Never clobber a file the branch already provides or a prior copy made.
    if dst.exists() {
        return Ok(());
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }
    fs::copy(src, dst)
        .with_context(|| format!("Failed to copy {} to {}", src.display(), dst.display()))?;
    copied.push(dst.to_path_buf());
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path, copied: &mut Vec<PathBuf>) -> Result<()> {
    for entry in
        fs::read_dir(src).with_context(|| format!("Failed to read dir {}", src.display()))?
    {
        let entry = entry?;
        let entry_src = entry.path();
        let entry_dst = dst.join(entry.file_name());
        match fs::symlink_metadata(&entry_src) {
            Ok(meta) if meta.is_dir() => copy_dir_recursive(&entry_src, &entry_dst, copied)?,
            Ok(meta) if meta.is_file() => copy_one_file(&entry_src, &entry_dst, copied)?,
            _ => continue,
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_env_and_secret_files() {
        assert!(is_secret_like(".env"));
        assert!(is_secret_like(".env.local"));
        assert!(is_secret_like(".env.production"));
        assert!(is_secret_like("backend/.env"));
        assert!(is_secret_like("certs/server.key"));
        assert!(is_secret_like("certs/server.pem"));
        assert!(is_secret_like("keystore.jks"));
        assert!(is_secret_like("secrets/token.txt"));
        assert!(is_secret_like("config/secrets/anything"));
        assert!(is_secret_like("settings.local.json"));
        assert!(is_secret_like("credentials.json"));
        assert!(is_secret_like("CREDENTIALS"));
    }

    #[test]
    fn ignores_ordinary_files() {
        assert!(!is_secret_like("src/main.rs"));
        assert!(!is_secret_like("README.md"));
        assert!(!is_secret_like("package.json"));
        assert!(!is_secret_like("env.ts"));
        assert!(!is_secret_like("environment/config.ts"));
    }

    #[test]
    fn effective_set_unions_detection_with_explicit_and_applies_excludes() {
        // No git repo at this path, so detection yields nothing; the
        // explicit list still comes through.
        let tmp = tempfile::tempdir().unwrap();
        let set = effective_copy_set(
            tmp.path(),
            true,
            &["config/local.yaml".to_string(), "  ".to_string()],
            &[],
        );
        assert_eq!(set, vec!["config/local.yaml".to_string()]);
    }

    #[test]
    fn copies_files_and_folders_skipping_existing() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join(".env"), "SECRET=1").unwrap();
        fs::create_dir_all(src.path().join("config/nested")).unwrap();
        fs::write(src.path().join("config/a.json"), "{}").unwrap();
        fs::write(src.path().join("config/nested/b.json"), "{}").unwrap();

        // Pre-existing file must NOT be overwritten.
        fs::write(dst.path().join(".env"), "PRE-EXISTING").unwrap();

        let copied = copy_paths(
            src.path(),
            dst.path(),
            &[".env".to_string(), "config".to_string()],
        )
        .unwrap();

        // .env was skipped (already existed); two config files copied.
        assert_eq!(copied.len(), 2);
        assert_eq!(
            fs::read_to_string(dst.path().join(".env")).unwrap(),
            "PRE-EXISTING"
        );
        assert!(dst.path().join("config/a.json").exists());
        assert!(dst.path().join("config/nested/b.json").exists());
    }

    #[test]
    fn copy_paths_skips_unsafe_and_missing() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();
        let copied = copy_paths(
            src.path(),
            dst.path(),
            &[
                "../escape.txt".to_string(),
                "/etc/passwd".to_string(),
                "does-not-exist".to_string(),
            ],
        )
        .unwrap();
        assert!(copied.is_empty());
    }
}
