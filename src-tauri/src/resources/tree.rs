use std::collections::{HashMap, HashSet};

use super::types::ProcessKind;

/// Collect `root` plus all transitive children from (pid, parent_pid) pairs.
pub fn collect_descendants(root: u32, pairs: &[(u32, Option<u32>)]) -> HashSet<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, parent) in pairs {
        if let Some(parent) = parent {
            children.entry(*parent).or_default().push(*pid);
        }
    }
    let mut out = HashSet::new();
    let mut stack = vec![root];
    while let Some(pid) = stack.pop() {
        if out.insert(pid) {
            if let Some(kids) = children.get(&pid) {
                stack.extend(kids.iter().copied());
            }
        }
    }
    out
}

/// Classify a process by executable name. `app_pid` / `sidecar_pid`
/// override name-based rules.
pub fn classify(name: &str, pid: u32, app_pid: u32, sidecar_pid: Option<u32>) -> ProcessKind {
    if pid == app_pid {
        return ProcessKind::App;
    }
    if Some(pid) == sidecar_pid {
        return ProcessKind::Sidecar;
    }
    let lower = name.to_ascii_lowercase();
    if lower.contains("claude") || lower.contains("codex") {
        ProcessKind::Agent
    } else if ["node", "bun", "deno", "vite"]
        .iter()
        .any(|n| lower == *n || lower.starts_with(&format!("{n} ")))
    {
        ProcessKind::DevServer
    } else if ["zsh", "bash", "fish", "sh"].contains(&lower.as_str()) {
        ProcessKind::Shell
    } else {
        ProcessKind::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_root_and_transitive_children() {
        // 1 -> 2 -> 4, 1 -> 3; 99 unrelated
        let pairs = vec![(2, Some(1)), (3, Some(1)), (4, Some(2)), (99, Some(50))];
        let tree = collect_descendants(1, &pairs);
        assert_eq!(tree, HashSet::from([1, 2, 3, 4]));
    }

    #[test]
    fn handles_cycles_without_hanging() {
        let pairs = vec![(2, Some(1)), (1, Some(2))];
        let tree = collect_descendants(1, &pairs);
        assert_eq!(tree, HashSet::from([1, 2]));
    }

    #[test]
    fn classifies_by_pid_overrides_first() {
        assert_eq!(classify("node", 10, 10, None), ProcessKind::App);
        assert_eq!(classify("bun", 11, 10, Some(11)), ProcessKind::Sidecar);
    }

    #[test]
    fn classifies_by_name() {
        assert_eq!(classify("claude", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("codex", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("node", 5, 1, None), ProcessKind::DevServer);
        assert_eq!(classify("fish", 5, 1, None), ProcessKind::Shell);
        assert_eq!(classify("anything", 5, 1, None), ProcessKind::Other);
    }
}
