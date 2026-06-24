//! Writer for the user-scope (global) `~/.claude.json`.
//!
//! Helmor installs MCP servers under the **top-level** `mcpServers` map. The
//! Claude Agent SDK auto-loads that user-scope set on every session (see the
//! note in `sidecar/src/claude-project-mcp.ts`), so a global install is picked
//! up with no sidecar change — unlike *project*-scope MCPs which live under
//! `projects[repoPath].mcpServers` and would be missed because Helmor runs
//! sessions from a worktree whose cwd never matches the registered project.
//!
//! `~/.claude.json` is user-owned and may contain fields Helmor doesn't model,
//! so every write round-trips through `serde_json::Value` and only touches the
//! targeted key.

use std::path::{Path, PathBuf};

use anyhow::Context;
use serde_json::{Map, Value};

/// Resolve `~/.claude.json`, honouring `$CLAUDE_CONFIG_DIR` if set (Claude
/// reads its main config from `$CLAUDE_CONFIG_DIR/.claude.json` when that env
/// var points at a config home, else `~/.claude.json`).
pub fn config_path() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        return PathBuf::from(dir).join(".claude.json");
    }
    home_dir().join(".claude.json")
}

fn home_dir() -> PathBuf {
    crate::platform::paths::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Insert (or replace) `mcpServers[server_id]` at the top level of
/// `~/.claude.json`, preserving every other field.
pub fn upsert_mcp_server(server_id: &str, server_config: &Value) -> anyhow::Result<()> {
    let path = config_path();
    let updated = upsert_mcp_server_in(&read_config_text(&path)?, server_id, server_config)?;
    write_config_atomic(&path, &updated)
}

/// Remove `mcpServers[server_id]`. No-op (Ok) if the file or key is absent.
pub fn remove_mcp_server(server_id: &str) -> anyhow::Result<()> {
    let path = config_path();
    let text = read_config_text(&path)?;
    if text.trim().is_empty() {
        return Ok(());
    }
    let updated = remove_mcp_server_in(&text, server_id)?;
    write_config_atomic(&path, &updated)
}

fn read_config_text(path: &Path) -> anyhow::Result<String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err).with_context(|| format!("Failed to read {}", path.display())),
    }
}

fn write_config_atomic(path: &Path, contents: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, contents)
        .with_context(|| format!("Failed to stage config at {}", tmp.display()))?;
    std::fs::rename(&tmp, path)
        .with_context(|| format!("Failed to commit config to {}", path.display()))?;
    Ok(())
}

/// Pure string transform powering [`upsert_mcp_server`] — unit-testable without
/// the filesystem.
pub fn upsert_mcp_server_in(
    existing: &str,
    server_id: &str,
    server_config: &Value,
) -> anyhow::Result<String> {
    let mut root = parse_root(existing)?;
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    let table = servers
        .as_object_mut()
        .context("`mcpServers` in ~/.claude.json is not an object")?;
    table.insert(server_id.to_string(), server_config.clone());
    serialize_root(&root)
}

/// Pure string transform powering [`remove_mcp_server`].
pub fn remove_mcp_server_in(existing: &str, server_id: &str) -> anyhow::Result<String> {
    let mut root = parse_root(existing)?;
    if let Some(table) = root.get_mut("mcpServers").and_then(Value::as_object_mut) {
        table.remove(server_id);
    }
    serialize_root(&root)
}

fn parse_root(existing: &str) -> anyhow::Result<Map<String, Value>> {
    if existing.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(existing)
        .context("Could not parse ~/.claude.json as JSON")?
    {
        Value::Object(map) => Ok(map),
        _ => anyhow::bail!("~/.claude.json is not a JSON object"),
    }
}

fn serialize_root(root: &Map<String, Value>) -> anyhow::Result<String> {
    let mut text = serde_json::to_string_pretty(&Value::Object(root.clone()))
        .context("Failed to serialize ~/.claude.json")?;
    text.push('\n');
    Ok(text)
}
