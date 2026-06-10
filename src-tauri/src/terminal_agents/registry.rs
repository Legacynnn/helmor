//! Static registry of terminal agent CLIs Helmor can thread as terminal
//! sessions. Adding support for a new agent means adding one entry here —
//! detection, the new-session picker, and the settings panel all derive
//! from this table.

use serde::Serialize;

/// How Helmor learns when an agent is working / idle / needs attention.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HookStrategy {
    /// First-class: pass `--settings <generated json>` whose hooks ping the
    /// local hook server. The user's `~/.claude/settings.json` is untouched.
    ClaudeSettingsFlag,
    /// First-class: pass `--extension <generated ts>` that subscribes to
    /// agent lifecycle events. The user's `~/.pi` is untouched.
    PiExtension,
    /// Fallback: PTY output activity + process exit only.
    Heuristic,
}

pub struct TerminalAgentSpec {
    /// Stable id, stored in `sessions.agent_type` for terminal rows.
    pub id: &'static str,
    pub display_name: &'static str,
    /// Candidate binary names, first found on PATH wins.
    pub binary_names: &'static [&'static str],
    /// Extra args appended after the binary on every launch.
    pub launch_args: &'static [&'static str],
    /// Args used when relaunching an exited session to resume it.
    pub resume_args: &'static [&'static str],
    /// Whether `resume_args` must be followed by the stored provider
    /// session id (e.g. `claude --resume <id>`).
    pub resume_requires_provider_id: bool,
    pub hook_strategy: HookStrategy,
    /// Home-relative directories scanned for installed skills.
    pub skill_dirs: &'static [&'static str],
    /// Home-relative directories scanned for installed extensions.
    pub extension_dirs: &'static [&'static str],
    /// Home-relative directories scanned for installed plugins.
    pub plugin_dirs: &'static [&'static str],
    /// First-class agents get live status via hooks; the rest are
    /// heuristic-only.
    pub first_class: bool,
    /// Frontend icon registry key.
    pub icon_key: &'static str,
    pub docs_url: &'static str,
}

static AGENTS: &[TerminalAgentSpec] = &[
    TerminalAgentSpec {
        id: "claude-code",
        display_name: "Claude Code",
        binary_names: &["claude"],
        launch_args: &[],
        resume_args: &["--resume"],
        resume_requires_provider_id: true,
        hook_strategy: HookStrategy::ClaudeSettingsFlag,
        skill_dirs: &[".claude/skills"],
        extension_dirs: &[],
        // Plugins come from `~/.claude/settings.json` `enabledPlugins`
        // (parsed separately in detection), not a directory scan.
        plugin_dirs: &[],
        first_class: true,
        icon_key: "claude",
        docs_url: "https://code.claude.com/docs",
    },
    TerminalAgentSpec {
        id: "pi",
        display_name: "pi",
        binary_names: &["pi"],
        launch_args: &[],
        resume_args: &["--continue"],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::PiExtension,
        skill_dirs: &[".pi/agent/skills"],
        extension_dirs: &[".pi/agent/extensions"],
        plugin_dirs: &[],
        first_class: true,
        icon_key: "pi",
        docs_url: "https://pi.dev",
    },
    TerminalAgentSpec {
        id: "codex",
        display_name: "Codex CLI",
        binary_names: &["codex"],
        launch_args: &[],
        resume_args: &["resume", "--last"],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[".codex/skills"],
        extension_dirs: &[],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "openai",
        docs_url: "https://developers.openai.com/codex/cli",
    },
    TerminalAgentSpec {
        id: "amp",
        display_name: "Amp",
        binary_names: &["amp"],
        launch_args: &[],
        resume_args: &[],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[],
        extension_dirs: &[],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "amp",
        docs_url: "https://ampcode.com",
    },
    TerminalAgentSpec {
        id: "opencode",
        display_name: "OpenCode",
        binary_names: &["opencode"],
        launch_args: &[],
        resume_args: &["--continue"],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[".config/opencode/skills"],
        extension_dirs: &[],
        plugin_dirs: &[".config/opencode/plugins"],
        first_class: false,
        icon_key: "opencode",
        docs_url: "https://opencode.ai/docs",
    },
    TerminalAgentSpec {
        id: "gemini",
        display_name: "Gemini CLI",
        binary_names: &["gemini"],
        launch_args: &[],
        resume_args: &[],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[],
        extension_dirs: &[".gemini/extensions"],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "gemini",
        docs_url: "https://geminicli.com",
    },
    TerminalAgentSpec {
        id: "cursor-agent",
        display_name: "Cursor Agent",
        binary_names: &["cursor-agent"],
        launch_args: &[],
        resume_args: &["--resume"],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[".cursor/skills-cursor"],
        extension_dirs: &[],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "cursor",
        docs_url: "https://cursor.com/cli",
    },
    TerminalAgentSpec {
        id: "copilot",
        display_name: "Copilot CLI",
        binary_names: &["copilot"],
        launch_args: &[],
        resume_args: &["--resume"],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[],
        extension_dirs: &[],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "copilot",
        docs_url: "https://github.com/github/copilot-cli",
    },
    TerminalAgentSpec {
        id: "aider",
        display_name: "Aider",
        binary_names: &["aider"],
        launch_args: &[],
        resume_args: &[],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[],
        extension_dirs: &[],
        plugin_dirs: &[],
        first_class: false,
        icon_key: "aider",
        docs_url: "https://aider.chat",
    },
    TerminalAgentSpec {
        id: "goose",
        display_name: "Goose",
        binary_names: &["goose"],
        launch_args: &[],
        resume_args: &[],
        resume_requires_provider_id: false,
        hook_strategy: HookStrategy::Heuristic,
        skill_dirs: &[],
        extension_dirs: &[],
        plugin_dirs: &[".agents/plugins"],
        first_class: false,
        icon_key: "goose",
        docs_url: "https://block.github.io/goose",
    },
];

pub fn all_agents() -> &'static [TerminalAgentSpec] {
    AGENTS
}

pub fn agent_by_id(id: &str) -> Option<&'static TerminalAgentSpec> {
    AGENTS.iter().find(|agent| agent.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn agent_ids_are_unique() {
        let ids: HashSet<&str> = all_agents().iter().map(|a| a.id).collect();
        assert_eq!(ids.len(), all_agents().len());
    }

    #[test]
    fn first_class_agents_have_hook_strategies() {
        for agent in all_agents().iter().filter(|a| a.first_class) {
            assert_ne!(
                agent.hook_strategy,
                HookStrategy::Heuristic,
                "first-class agent {} must have a hook strategy",
                agent.id
            );
        }
    }

    #[test]
    fn resume_provider_id_only_with_resume_args() {
        for agent in all_agents() {
            if agent.resume_requires_provider_id {
                assert!(!agent.resume_args.is_empty(), "{} inconsistent", agent.id);
            }
        }
    }

    #[test]
    fn lookup_by_id() {
        assert!(agent_by_id("claude-code").is_some());
        assert!(agent_by_id("pi").is_some());
        assert!(agent_by_id("nonexistent").is_none());
    }
}
