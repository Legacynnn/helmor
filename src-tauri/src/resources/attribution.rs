use std::path::Path;

/// Map a process cwd to a workspace id. `workspace_dirs` =
/// (workspace_id, absolute dir). Longest-prefix match wins so nested
/// checkout dirs don't mis-attribute.
pub fn workspace_for_cwd(
    cwd: Option<&Path>,
    workspace_dirs: &[(String, std::path::PathBuf)],
) -> Option<String> {
    let cwd = cwd?;
    workspace_dirs
        .iter()
        .filter(|(_, dir)| cwd.starts_with(dir))
        .max_by_key(|(_, dir)| dir.components().count())
        .map(|(id, _)| id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dirs() -> Vec<(String, PathBuf)> {
        vec![
            ("ws1".into(), PathBuf::from("/data/workspaces/alpha")),
            ("ws2".into(), PathBuf::from("/data/workspaces/alpha-two")),
        ]
    }

    #[test]
    fn matches_cwd_inside_workspace() {
        let got = workspace_for_cwd(Some(Path::new("/data/workspaces/alpha/src")), &dirs());
        assert_eq!(got.as_deref(), Some("ws1"));
    }

    #[test]
    fn sibling_prefix_does_not_leak() {
        // `/alpha-two` must not match workspace `/alpha` (starts_with is
        // component-wise on Path, so this guards against string matching).
        let got = workspace_for_cwd(Some(Path::new("/data/workspaces/alpha-two/x")), &dirs());
        assert_eq!(got.as_deref(), Some("ws2"));
    }

    #[test]
    fn none_when_outside_all_workspaces() {
        assert_eq!(workspace_for_cwd(Some(Path::new("/tmp")), &dirs()), None);
        assert_eq!(workspace_for_cwd(None, &dirs()), None);
    }
}
