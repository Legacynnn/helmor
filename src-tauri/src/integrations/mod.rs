//! Third-party task-tracker integrations (Linear today; GitHub Issues and
//! ClickUp are designed to slot in later as sibling provider modules).
//!
//! Shape mirrors the `forge` / `slack` domains: a provider-agnostic surface
//! (`provider.rs`) plus one module per concrete provider (`linear/`). The API
//! key is held in the macOS keychain (`credentials.rs`, service
//! `io.helmor.integrations`); non-secret connection metadata lives in the
//! `integration_connections` SQLite table and the task mirror in `tasks`.

pub mod credentials;
pub mod github;
pub mod linear;
pub mod provider;

use anyhow::{bail, Context, Result};
use provider::TaskProvider;

/// Stable provider id for Linear. Used as the keychain account and the
/// `provider` column across `integration_connections` / `tasks`.
pub const LINEAR_PROVIDER: &str = "linear";
/// Stable provider id for GitHub Issues.
pub const GITHUB_PROVIDER: &str = "github";

/// Resolve a provider id into a live `TaskProvider`, loading its credentials.
pub fn resolve_provider(provider: &str) -> Result<Box<dyn TaskProvider>> {
    match provider {
        LINEAR_PROVIDER => {
            let key = credentials::load_api_key(LINEAR_PROVIDER)?.with_context(|| {
                "Linear is not connected — add an API key in Settings → Integrations".to_string()
            })?;
            Ok(Box::new(linear::LinearProvider::new(key)))
        }
        GITHUB_PROVIDER => {
            let login = github::default_login()?;
            Ok(Box::new(github::GithubProvider::new(login)))
        }
        other => bail!("Unsupported integration provider: {other}"),
    }
}
