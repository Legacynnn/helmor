//! Third-party task-tracker integrations (Linear today; GitHub Issues and
//! ClickUp are designed to slot in later as sibling provider modules).
//!
//! Shape mirrors the `forge` / `slack` domains: a provider-agnostic surface
//! (`provider.rs`) plus one module per concrete provider (`linear/`). The API
//! key is held in the macOS keychain (`credentials.rs`, service
//! `io.helmor.integrations`); non-secret connection metadata lives in the
//! `integration_connections` SQLite table and the task mirror in `tasks`.

pub mod credentials;
pub mod linear;
pub mod provider;

/// Stable provider id for Linear. Used as the keychain account and the
/// `provider` column across `integration_connections` / `tasks`.
pub const LINEAR_PROVIDER: &str = "linear";
