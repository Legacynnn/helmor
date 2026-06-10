//! Probes which registry agents are installed (binary on PATH + version)
//! and scans their skills / extensions / plugins. All filesystem scans take
//! an injectable home dir so tests run against a tempdir.

use std::path::{Path, PathBuf};

use serde::Serialize;

use super::registry::{all_agents, HookStrategy, TerminalAgentSpec};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalAgentInfo {
    pub id: String,
    pub display_name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub first_class: bool,
    pub icon_key: String,
    pub skill_count: u32,
    pub extension_count: u32,
    pub plugin_count: u32,
    pub docs_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedItem {
    pub name: String,
    pub path: String,
    pub kind: String, // "skill" | "extension" | "plugin"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalAgentDetails {
    #[serde(flatten)]
    pub info: TerminalAgentInfo,
    pub skills: Vec<DetectedItem>,
    pub extensions: Vec<DetectedItem>,
    pub plugins: Vec<DetectedItem>,
}

fn home_dir() -> PathBuf {
    crate::platform::paths::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Find the first registry binary on PATH. Detection runs in the Helmor
/// process, which inherits the user's login-shell PATH at startup
/// (`shell_env::inherit_login_shell_env`), so this sees nvm/homebrew bins.
fn find_binary_on_path(names: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        for name in names {
            let candidate = dir.join(name);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
            #[cfg(windows)]
            for ext in ["exe", "cmd", "bat"] {
                let with_ext = dir.join(format!("{name}.{ext}"));
                if with_ext.is_file() {
                    return Some(with_ext);
                }
            }
        }
    }
    None
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

fn binary_version(binary: &Path) -> Option<String> {
    let mut command = std::process::Command::new(binary);
    crate::platform::process::configure_background_cli(&mut command);
    let output = command.arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    crate::commands::system_commands::parse_semver(&text)
}

/// Scan one directory for installed items. Counts immediate entries:
/// directories (skill/extension folders) and known file extensions
/// (`.ts` extensions, `.md` skills). Hidden entries (`.system`, dotfiles)
/// are skipped.
fn scan_items_dir(dir: &Path, kind: &str) -> Vec<DetectedItem> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut items: Vec<DetectedItem> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            let path = entry.path();
            let keep = if path.is_dir() {
                true
            } else {
                matches!(
                    path.extension().and_then(|e| e.to_str()),
                    Some("ts" | "js" | "md")
                )
            };
            if !keep {
                return None;
            }
            let display_name = path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
                .unwrap_or(name);
            Some(DetectedItem {
                name: display_name,
                path: path.display().to_string(),
                kind: kind.to_string(),
            })
        })
        .collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

fn scan_dirs(home: &Path, dirs: &[&str], kind: &str) -> Vec<DetectedItem> {
    let mut items = Vec::new();
    for dir in dirs {
        items.extend(scan_items_dir(&home.join(dir), kind));
    }
    items
}

/// Claude Code plugins live in `~/.claude/settings.json` under
/// `enabledPlugins` (a map of plugin id -> enabled). Read-only parse.
fn claude_plugins_from_settings(home: &Path) -> Vec<DetectedItem> {
    let settings_path = home.join(".claude/settings.json");
    let Ok(raw) = std::fs::read_to_string(&settings_path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    let Some(plugins) = value.get("enabledPlugins").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut items: Vec<DetectedItem> = plugins
        .iter()
        .filter(|(_, enabled)| enabled.as_bool().unwrap_or(false))
        .map(|(name, _)| DetectedItem {
            name: name.clone(),
            path: settings_path.display().to_string(),
            kind: "plugin".to_string(),
        })
        .collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

fn detect_with_home(spec: &TerminalAgentSpec, home: &Path) -> TerminalAgentDetails {
    let binary = find_binary_on_path(spec.binary_names);
    let version = binary.as_deref().and_then(binary_version);

    let skills = scan_dirs(home, spec.skill_dirs, "skill");
    let extensions = scan_dirs(home, spec.extension_dirs, "extension");
    let mut plugins = scan_dirs(home, spec.plugin_dirs, "plugin");
    if spec.hook_strategy == HookStrategy::ClaudeSettingsFlag {
        plugins.extend(claude_plugins_from_settings(home));
    }

    TerminalAgentDetails {
        info: TerminalAgentInfo {
            id: spec.id.to_string(),
            display_name: spec.display_name.to_string(),
            installed: binary.is_some(),
            version,
            binary_path: binary.map(|p| p.display().to_string()),
            first_class: spec.first_class,
            icon_key: spec.icon_key.to_string(),
            skill_count: skills.len() as u32,
            extension_count: extensions.len() as u32,
            plugin_count: plugins.len() as u32,
            docs_url: spec.docs_url.to_string(),
        },
        skills,
        extensions,
        plugins,
    }
}

pub fn detect_all_agents() -> Vec<TerminalAgentInfo> {
    let home = home_dir();
    all_agents()
        .iter()
        .map(|spec| detect_with_home(spec, &home).info)
        .collect()
}

pub fn detect_agent_details(agent_id: &str) -> Option<TerminalAgentDetails> {
    let spec = super::registry::agent_by_id(agent_id)?;
    Some(detect_with_home(spec, &home_dir()))
}

#[cfg(test)]
mod tests {
    use super::super::registry::agent_by_id;
    use super::*;

    #[test]
    fn scans_skills_and_extensions_from_fake_home() {
        let home = tempfile::tempdir().unwrap();
        let skills = home.path().join(".claude/skills");
        std::fs::create_dir_all(skills.join("my-skill")).unwrap();
        std::fs::create_dir_all(skills.join(".hidden-skill")).unwrap();
        let pi_ext = home.path().join(".pi/agent/extensions");
        std::fs::create_dir_all(&pi_ext).unwrap();
        std::fs::write(pi_ext.join("copy-all.ts"), "export default () => {}").unwrap();
        std::fs::write(pi_ext.join("notes.txt"), "ignored").unwrap();

        let claude = detect_with_home(agent_by_id("claude-code").unwrap(), home.path());
        assert_eq!(claude.info.skill_count, 1);
        assert_eq!(claude.skills[0].name, "my-skill");

        let pi = detect_with_home(agent_by_id("pi").unwrap(), home.path());
        assert_eq!(pi.info.extension_count, 1);
        assert_eq!(pi.extensions[0].name, "copy-all");
    }

    #[test]
    fn parses_claude_plugins_from_settings_json() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join(".claude")).unwrap();
        std::fs::write(
            home.path().join(".claude/settings.json"),
            r#"{"enabledPlugins": {"superpowers@repo": true, "disabled@repo": false}}"#,
        )
        .unwrap();
        let claude = detect_with_home(agent_by_id("claude-code").unwrap(), home.path());
        assert_eq!(claude.info.plugin_count, 1);
        assert_eq!(claude.plugins[0].name, "superpowers@repo");
    }

    #[test]
    fn missing_dirs_yield_zero_counts() {
        let home = tempfile::tempdir().unwrap();
        let goose = detect_with_home(agent_by_id("goose").unwrap(), home.path());
        assert_eq!(goose.info.skill_count, 0);
        assert_eq!(goose.info.plugin_count, 0);
    }
}
