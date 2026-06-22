//! API-key storage for task integrations, backed by the macOS keychain.
//!
//! Same approach as `crate::slack::credentials`: we shell out to
//! `/usr/bin/security` rather than the `keyring` crate, because the keyring
//! crate's `set_password` silently no-ops on a tokio worker thread (the macOS
//! Security framework needs a CFRunLoop the spawn_blocking worker lacks). The
//! `security` CLI process gets its own runloop and works reliably.
//!
//! One entry per provider (account = provider id, e.g. `"linear"`), grouped
//! under the `io.helmor.integrations` service so users can audit / revoke in
//! Keychain Access. The secret travels as a small JSON blob (`{ "apiKey": … }`)
//! for parity with the Slack credential store and room to grow.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};

const KEYCHAIN_SERVICE: &str = "io.helmor.integrations";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredKey {
    api_key: String,
}

pub fn store_api_key(provider: &str, api_key: &str) -> Result<()> {
    let payload = serde_json::to_string(&StoredKey {
        api_key: api_key.to_string(),
    })
    .context("Failed to serialize integration API key")?;
    let status = Command::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            provider,
            "-w",
            &payload,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {provider}"))?;
    if !status.status.success() {
        bail!(
            "`security add-generic-password` failed (exit={:?}): {}",
            status.status.code(),
            String::from_utf8_lossy(&status.stderr).trim()
        );
    }
    Ok(())
}

pub fn load_api_key(provider: &str) -> Result<Option<String>> {
    let output = Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-w",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            provider,
        ])
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {provider}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not be found") {
            return Ok(None);
        }
        bail!(
            "`security find-generic-password` failed (exit={:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }
    let mut bytes = output.stdout;
    if bytes.last() == Some(&b'\n') {
        bytes.pop();
    }
    let payload = String::from_utf8(bytes)
        .with_context(|| format!("Stored API key for {provider} isn't UTF-8"))?;
    let stored: StoredKey = serde_json::from_str(&payload)
        .with_context(|| format!("Stored API key for {provider} is malformed JSON"))?;
    Ok(Some(stored.api_key))
}

pub fn clear_api_key(provider: &str) -> Result<()> {
    let output = Command::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            provider,
        ])
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {provider}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not be found") {
            return Ok(());
        }
        bail!(
            "`security delete-generic-password` failed (exit={:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }
    Ok(())
}
