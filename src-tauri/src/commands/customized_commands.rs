//! Write commands powering the Settings → Customized hub.
//!
//! All installs are **global** (user-scope): MCP servers land in the top-level
//! `mcpServers` of `~/.claude.json` and the `[mcp_servers]` table of
//! `~/.codex/config.toml`; skills install with `-g` into the global skills dir.
//! There is no per-repo scoping.
//!
//! The read side (`inspect_provider_configs` / `get_agent_cli_status`) is reused
//! as-is; this module only adds the write path.

use anyhow::Context;
use serde::Deserialize;

use super::common::{run_blocking, CmdResult};
use crate::commands::system_commands::{global_skills_dir, run_skills_add};

const PROVIDER_CLAUDE: &str = "claude";
const PROVIDER_CODEX: &str = "codex";

const THERMO_NUCLEAR_SKILL_ID: &str = "thermo-nuclear-code-quality-review";
// Helmor-vendored, provider-adapted copies of the thermo-nuclear skill. Embedded
// at compile time so install works identically in dev and release with no bundle
// resource resolution.
const THERMO_NUCLEAR_CLAUDE: &str =
    include_str!("../../../sidecar/skills/thermo-nuclear-code-quality-review/claude/SKILL.md");
const THERMO_NUCLEAR_CODEX: &str =
    include_str!("../../../sidecar/skills/thermo-nuclear-code-quality-review/codex/SKILL.md");

/// Map a Customized-hub provider id (`claude` / `codex`) to the `skills`-CLI
/// agent name (`claude-code` / `codex`).
fn provider_to_skill_agent(provider: &str) -> anyhow::Result<&'static str> {
    match provider {
        PROVIDER_CLAUDE => Ok("claude-code"),
        PROVIDER_CODEX => Ok("codex"),
        other => anyhow::bail!("Unsupported provider: {other}"),
    }
}

/// Install (or replace) a curated MCP server for a provider, globally.
#[tauri::command]
pub async fn install_mcp_server(
    provider: String,
    server_id: String,
    server_config: serde_json::Value,
) -> CmdResult<()> {
    run_blocking(move || {
        let _guard = crate::provider::lock_writes();
        match provider.as_str() {
            PROVIDER_CLAUDE => {
                crate::provider::claude_config_writer::upsert_mcp_server(&server_id, &server_config)
            }
            PROVIDER_CODEX => crate::codex_config::upsert_mcp_server(&server_id, &server_config),
            other => anyhow::bail!("Unsupported provider for MCP install: {other}"),
        }
    })
    .await
}

/// Remove a curated MCP server for a provider.
#[tauri::command]
pub async fn uninstall_mcp_server(provider: String, server_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _guard = crate::provider::lock_writes();
        match provider.as_str() {
            PROVIDER_CLAUDE => crate::provider::claude_config_writer::remove_mcp_server(&server_id),
            PROVIDER_CODEX => crate::codex_config::remove_mcp_server(&server_id),
            other => anyhow::bail!("Unsupported provider for MCP uninstall: {other}"),
        }
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillRequest {
    /// Catalog id; doubles as the installed skill's directory name.
    pub skill_id: String,
    /// Provider ids to target (`claude` / `codex`).
    pub providers: Vec<String>,
    /// `skills` slug for remotely-installed skills. Absent ⇒ a Helmor-vendored
    /// skill installed from embedded content.
    #[serde(default)]
    pub remote_source: Option<String>,
}

/// Install a curated skill globally for the selected providers. Routes to either
/// `npx skills add <source>` (remote) or the embedded vendored copy.
#[tauri::command]
pub async fn install_catalog_skill(request: InstallSkillRequest) -> CmdResult<()> {
    run_blocking(move || {
        if request.providers.is_empty() {
            anyhow::bail!("Select at least one provider to install into");
        }
        match request.remote_source.as_deref() {
            Some(source) => {
                let agents = request
                    .providers
                    .iter()
                    .map(|p| provider_to_skill_agent(p))
                    .collect::<anyhow::Result<Vec<_>>>()?;
                run_skills_add(source, &request.skill_id, &agents)
            }
            None => install_vendored_skill(&request.skill_id, &request.providers),
        }
    })
    .await
}

/// Remove a vendored skill's directory for the selected providers. Remote
/// skills are removed via the `skills` CLI; this only handles Helmor-vendored
/// copies it wrote itself.
#[tauri::command]
pub async fn uninstall_catalog_skill(skill_id: String, providers: Vec<String>) -> CmdResult<()> {
    run_blocking(move || {
        for provider in &providers {
            let agent = provider_to_skill_agent(provider)?;
            let Some(base) = global_skills_dir(agent) else {
                continue;
            };
            let dir = base.join(&skill_id);
            if dir.is_dir() {
                std::fs::remove_dir_all(&dir)
                    .with_context(|| format!("Failed to remove {}", dir.display()))?;
            }
        }
        Ok(())
    })
    .await
}

fn install_vendored_skill(skill_id: &str, providers: &[String]) -> anyhow::Result<()> {
    if skill_id != THERMO_NUCLEAR_SKILL_ID {
        anyhow::bail!("Unknown vendored skill: {skill_id}");
    }
    for provider in providers {
        let agent = provider_to_skill_agent(provider)?;
        let body = match provider.as_str() {
            PROVIDER_CLAUDE => THERMO_NUCLEAR_CLAUDE,
            PROVIDER_CODEX => THERMO_NUCLEAR_CODEX,
            other => anyhow::bail!("Unsupported provider for vendored skill: {other}"),
        };
        let Some(base) = global_skills_dir(agent) else {
            anyhow::bail!("No global skills directory for {provider}");
        };
        let dir = base.join(skill_id);
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create {}", dir.display()))?;
        let file = dir.join("SKILL.md");
        std::fs::write(&file, body)
            .with_context(|| format!("Failed to write {}", file.display()))?;
    }
    Ok(())
}
