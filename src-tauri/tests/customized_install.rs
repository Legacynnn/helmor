//! Unit tests for the Customized hub's config writers (Claude `~/.claude.json`
//! and Codex `~/.codex/config.toml`). These exercise the pure string transforms
//! so they are deterministic and parallel-safe (no env or filesystem mutation).

use helmor_lib::codex_config;
use helmor_lib::provider::claude_config_writer as claude;
use serde_json::{json, Value};

// --- Claude (`~/.claude.json`, top-level `mcpServers`) ----------------------

#[test]
fn claude_inserts_into_empty_config() {
    let out = claude::upsert_mcp_server_in(
        "",
        "github",
        &json!({ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }),
    )
    .unwrap();
    let value: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(value["mcpServers"]["github"]["command"], "npx");
    assert_eq!(value["mcpServers"]["github"]["args"][0], "-y");
}

#[test]
fn claude_preserves_unknown_fields() {
    let existing = r#"{"numStartups":42,"projects":{"/repo":{"allowedTools":[]}}}"#;
    let out =
        claude::upsert_mcp_server_in(existing, "fetch", &json!({ "command": "fetch" })).unwrap();
    let value: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(value["numStartups"], 42);
    assert_eq!(value["projects"]["/repo"]["allowedTools"], json!([]));
    assert_eq!(value["mcpServers"]["fetch"]["command"], "fetch");
}

#[test]
fn claude_reinsert_is_idempotent() {
    let cfg = json!({ "command": "fetch" });
    let first = claude::upsert_mcp_server_in("", "fetch", &cfg).unwrap();
    let second = claude::upsert_mcp_server_in(&first, "fetch", &cfg).unwrap();
    assert_eq!(first, second);
}

#[test]
fn claude_remove_drops_only_target() {
    let existing = r#"{"mcpServers":{"a":{"command":"a"},"b":{"command":"b"}}}"#;
    let out = claude::remove_mcp_server_in(existing, "a").unwrap();
    let value: Value = serde_json::from_str(&out).unwrap();
    assert!(value["mcpServers"].get("a").is_none());
    assert_eq!(value["mcpServers"]["b"]["command"], "b");
}

// --- Codex (`~/.codex/config.toml`, `[mcp_servers]`) ------------------------

#[test]
fn codex_inserts_into_empty_config() {
    let out = codex_config::upsert_mcp_server_in(
        "",
        "playwright",
        &json!({ "command": "npx", "args": ["-y", "@playwright/mcp"] }),
    )
    .unwrap();
    let value: toml::Value = toml::from_str(&out).unwrap();
    let server = &value["mcp_servers"]["playwright"];
    assert_eq!(server["command"].as_str(), Some("npx"));
    assert_eq!(server["args"][0].as_str(), Some("-y"));
}

#[test]
fn codex_preserves_comments_and_unknown_keys() {
    let existing = r#"# my codex config
model = "gpt-5.5"
model_provider = "azure"

[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
"#;
    let out = codex_config::upsert_mcp_server_in(
        existing,
        "context7",
        &json!({ "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }),
    )
    .unwrap();
    // Comment and pre-existing keys survive the round-trip.
    assert!(out.contains("# my codex config"));
    assert!(out.contains("model_provider = \"azure\""));
    let value: toml::Value = toml::from_str(&out).unwrap();
    assert_eq!(value["model"].as_str(), Some("gpt-5.5"));
    assert_eq!(
        value["mcp_servers"]["context7"]["command"].as_str(),
        Some("npx")
    );
}

#[test]
fn codex_reinsert_is_idempotent() {
    let cfg = json!({ "command": "npx", "args": ["-y", "@upstash/context7-mcp"] });
    let first = codex_config::upsert_mcp_server_in("", "context7", &cfg).unwrap();
    let second = codex_config::upsert_mcp_server_in(&first, "context7", &cfg).unwrap();
    assert_eq!(first, second);
}

#[test]
fn codex_remove_drops_only_target() {
    let existing = r#"[mcp_servers.a]
command = "a"

[mcp_servers.b]
command = "b"
"#;
    let out = codex_config::remove_mcp_server_in(existing, "a").unwrap();
    let value: toml::Value = toml::from_str(&out).unwrap();
    assert!(value["mcp_servers"].get("a").is_none());
    assert_eq!(value["mcp_servers"]["b"]["command"].as_str(), Some("b"));
}

#[test]
fn codex_env_object_becomes_table() {
    let out = codex_config::upsert_mcp_server_in(
        "",
        "github",
        &json!({ "command": "gh", "env": { "GITHUB_TOKEN": "x" } }),
    )
    .unwrap();
    let value: toml::Value = toml::from_str(&out).unwrap();
    assert_eq!(
        value["mcp_servers"]["github"]["env"]["GITHUB_TOKEN"].as_str(),
        Some("x")
    );
}
