#![allow(dead_code)]
// dead_code allowed until queries.rs / auth.rs / commands wire these up

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearViewer {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTeam {
    pub id: String,
    pub key: String,
    pub name: String,
}

/// Result of probing the stored API key. Frontend uses `connected` to
/// decide whether to show the "Connect Linear" CTA or the connected state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearAuthStatus {
    pub connected: bool,
    pub viewer: Option<LinearViewer>,
}

#[derive(Debug, Error)]
pub enum LinearError {
    #[error("Linear API key not configured")]
    NoApiKey,
    #[error("Linear API key is invalid or revoked")]
    Unauthorized,
    #[error("Linear API returned errors: {0}")]
    GraphQl(String),
    #[error("Network error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("Failed to parse Linear response: {0}")]
    Parse(String),
}
