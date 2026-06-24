//! Parsing helpers for the user's `~/.codex/config.toml`.
//!
//! Used in two places:
//!  - `commands::system_commands::get_agent_login_status` — detect whether
//!    Codex is reachable via an API-key provider (e.g. Azure) when the
//!    user hasn't run `codex login`.
//!  - `shell_env::inherit_login_shell_env` — extend the env-var
//!    inheritance whitelist with whichever `env_key` names the user has
//!    declared, so a Finder-launched Helmor.app sees the same API keys
//!    as a terminal session.

use std::path::PathBuf;

use anyhow::Context;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiKeyProvider {
    pub name: String,
    pub env_key: String,
}

/// Resolve `~/.codex/config.toml`, honouring `$CODEX_HOME` if set.
pub fn config_path() -> PathBuf {
    crate::platform::paths::codex_home_dir().join("config.toml")
}

/// Insert (or replace) an MCP server entry under the `[mcp_servers]` table of
/// `~/.codex/config.toml`, preserving the rest of the file — including
/// comments and unknown keys — by editing through `toml_edit`. Codex config is
/// inherently global.
///
/// `server_config` is the same shape the frontend sends (a JSON object with
/// `command`/`args`/`env` or `url`); it is converted into TOML in place.
pub fn upsert_mcp_server(server_id: &str, server_config: &serde_json::Value) -> anyhow::Result<()> {
    let path = config_path();
    let updated = upsert_mcp_server_in(&read_config_text(&path)?, server_id, server_config)?;
    write_config_atomic(&path, &updated)
}

/// Remove an MCP server entry from `[mcp_servers]`. No-op (Ok) if the file or
/// the key is absent.
pub fn remove_mcp_server(server_id: &str) -> anyhow::Result<()> {
    let path = config_path();
    let text = read_config_text(&path)?;
    if text.is_empty() {
        return Ok(());
    }
    let updated = remove_mcp_server_in(&text, server_id)?;
    write_config_atomic(&path, &updated)
}

fn read_config_text(path: &std::path::Path) -> anyhow::Result<String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err).with_context(|| format!("Failed to read {}", path.display())),
    }
}

fn write_config_atomic(path: &std::path::Path, contents: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, contents)
        .with_context(|| format!("Failed to stage config at {}", tmp.display()))?;
    std::fs::rename(&tmp, path)
        .with_context(|| format!("Failed to commit config to {}", path.display()))?;
    Ok(())
}

/// Pure string transform powering [`upsert_mcp_server`] — kept separate so it
/// can be unit-tested without touching the filesystem.
pub fn upsert_mcp_server_in(
    existing: &str,
    server_id: &str,
    server_config: &serde_json::Value,
) -> anyhow::Result<String> {
    let mut doc = existing
        .parse::<toml_edit::DocumentMut>()
        .with_context(|| "Could not parse ~/.codex/config.toml as TOML")?;

    let servers = doc
        .entry("mcp_servers")
        .or_insert_with(|| toml_edit::Item::Table(toml_edit::Table::new()));
    let table = servers
        .as_table_mut()
        .context("`mcp_servers` in config.toml is not a table")?;
    table.set_implicit(false);

    let entry = json_to_toml_item(server_config)
        .context("MCP server config could not be converted to TOML")?;
    table.insert(server_id, entry);
    Ok(doc.to_string())
}

/// Pure string transform powering [`remove_mcp_server`].
pub fn remove_mcp_server_in(existing: &str, server_id: &str) -> anyhow::Result<String> {
    let mut doc = existing
        .parse::<toml_edit::DocumentMut>()
        .with_context(|| "Could not parse ~/.codex/config.toml as TOML")?;
    if let Some(table) = doc.get_mut("mcp_servers").and_then(|s| s.as_table_mut()) {
        table.remove(server_id);
    }
    Ok(doc.to_string())
}

/// Convert a `serde_json::Value` into a `toml_edit::Item`. JSON objects become
/// TOML tables, so an MCP server entry renders as a proper `[mcp_servers.id]`
/// section. Returns `None` for JSON `null` (TOML has no null) so the caller can
/// skip the field.
fn json_to_toml_item(value: &serde_json::Value) -> Option<toml_edit::Item> {
    use toml_edit::{Item, Table};
    match value {
        serde_json::Value::Object(map) => {
            let mut table = Table::new();
            table.set_implicit(false);
            for (key, val) in map {
                if let Some(item) = json_to_toml_item(val) {
                    table.insert(key, item);
                }
            }
            Some(Item::Table(table))
        }
        other => json_to_toml_value(other).map(toml_edit::value),
    }
}

/// Scalar/array branch — anything that fits in a `toml_edit::Value` (used for
/// array elements, which cannot be tables).
fn json_to_toml_value(value: &serde_json::Value) -> Option<toml_edit::Value> {
    use toml_edit::{Array, InlineTable, Value};
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::Bool(b) => Some(Value::from(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(Value::from(i))
            } else {
                n.as_f64().map(Value::from)
            }
        }
        serde_json::Value::String(s) => Some(Value::from(s.clone())),
        serde_json::Value::Array(arr) => {
            let mut array = Array::new();
            for element in arr {
                if let Some(v) = json_to_toml_value(element) {
                    array.push(v);
                }
            }
            Some(Value::Array(array))
        }
        serde_json::Value::Object(map) => {
            let mut table = InlineTable::new();
            for (key, val) in map {
                if let Some(v) = json_to_toml_value(val) {
                    table.insert(key, v);
                }
            }
            Some(Value::InlineTable(table))
        }
    }
}

/// The provider currently selected by `model_provider`, if it declares an
/// `env_key`. Returns `None` when no provider is active, the active
/// provider isn't an API-key flavour, or the config can't be parsed.
pub fn active_api_key_provider(config: &str) -> Option<ApiKeyProvider> {
    let value = toml::from_str::<toml::Value>(config).ok()?;
    let provider = value
        .get("model_provider")
        .and_then(toml::Value::as_str)
        .map(str::trim)
        .filter(|provider| !provider.is_empty())?;
    let env_key = value
        .get("model_providers")
        .and_then(|providers| providers.get(provider))
        .and_then(|provider_config| provider_config.get("env_key"))
        .and_then(toml::Value::as_str)
        .map(str::trim)
        .filter(|env_key| !env_key.is_empty())?;

    Some(ApiKeyProvider {
        name: provider.to_string(),
        env_key: env_key.to_string(),
    })
}

/// Every `env_key` declared under `[model_providers.*]` — regardless of
/// which provider is currently active. We surface them all so the user
/// can switch providers in `config.toml` without restarting Helmor.
///
/// Returns an empty vec on parse failure or when no providers declare an
/// `env_key`.
pub fn declared_env_keys(config: &str) -> Vec<String> {
    let Ok(value) = toml::from_str::<toml::Value>(config) else {
        return Vec::new();
    };
    let Some(providers) = value.get("model_providers").and_then(toml::Value::as_table) else {
        return Vec::new();
    };

    let mut keys = Vec::new();
    for provider in providers.values() {
        let Some(env_key) = provider
            .get("env_key")
            .and_then(toml::Value::as_str)
            .map(str::trim)
            .filter(|key| !key.is_empty())
        else {
            continue;
        };
        let env_key = env_key.to_string();
        if !keys.contains(&env_key) {
            keys.push(env_key);
        }
    }
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_provider_reads_azure_env_key() {
        let provider = active_api_key_provider(
            r#"
model = "gpt-5.5"
model_provider = "azure"

[model_providers.azure]
name = "Azure"
base_url = "https://example.openai.azure.com/openai/v1"
env_key = "AZURE_OPENAI_API_KEY"
wire_api = "responses"
"#,
        );

        assert_eq!(
            provider,
            Some(ApiKeyProvider {
                name: "azure".to_string(),
                env_key: "AZURE_OPENAI_API_KEY".to_string(),
            })
        );
    }

    #[test]
    fn active_provider_returns_none_when_section_missing() {
        let provider = active_api_key_provider(
            r#"
model_provider = "azure"

[model_providers.openai]
env_key = "OPENAI_API_KEY"
"#,
        );

        assert_eq!(provider, None);
    }

    #[test]
    fn active_provider_returns_none_without_env_key() {
        let provider = active_api_key_provider(
            r#"
model_provider = "azure"

[model_providers.azure]
base_url = "https://example.openai.azure.com/openai/v1"
"#,
        );

        assert_eq!(provider, None);
    }

    #[test]
    fn declared_env_keys_collects_every_provider() {
        let keys = declared_env_keys(
            r#"
model_provider = "azure"

[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"

[model_providers.openai]
env_key = "OPENAI_API_KEY"

[model_providers.no_key]
base_url = "https://example.com"
"#,
        );

        assert_eq!(keys, vec!["AZURE_OPENAI_API_KEY", "OPENAI_API_KEY"]);
    }

    #[test]
    fn declared_env_keys_deduplicates() {
        let keys = declared_env_keys(
            r#"
[model_providers.a]
env_key = "SHARED_KEY"

[model_providers.b]
env_key = "SHARED_KEY"
"#,
        );

        assert_eq!(keys, vec!["SHARED_KEY"]);
    }

    #[test]
    fn declared_env_keys_handles_empty_config() {
        assert!(declared_env_keys("").is_empty());
        assert!(declared_env_keys("not valid toml = [").is_empty());
        assert!(declared_env_keys("[other]\nfoo = 1").is_empty());
    }
}
