//! Resolve the GitHub login used for integration calls. We reuse Helmor's
//! existing bundled-`gh` auth (the same accounts that power the inbox) rather
//! than a separate token — "connecting" GitHub for tasks is just picking a repo.

use anyhow::{Context, Result};

/// The login the integration should act as. Errors with a connect hint if the
/// user has not authenticated `gh` yet.
pub fn default_login() -> Result<String> {
    crate::forge::github::accounts::default_login()?
        .context("GitHub is not signed in — sign in to GitHub first, then pick a repository")
}
