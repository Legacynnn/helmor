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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueState {
    pub id: String,
    pub name: String,
    /// One of: backlog, unstarted, started, completed, canceled, triage.
    #[serde(rename = "type")]
    pub kind: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearAssignee {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearLabel {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    /// Human-readable identifier like "SUPER-187".
    pub identifier: String,
    pub title: String,
    pub url: String,
    /// 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low (Linear's scale).
    pub priority: i32,
    pub updated_at: String,
    pub state: LinearIssueState,
    pub assignee: Option<LinearAssignee>,
    pub labels: LinearLabelConnection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearLabelConnection {
    pub nodes: Vec<LinearLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueDetail {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub priority: i32,
    pub updated_at: String,
    pub state: LinearIssueState,
    pub assignee: Option<LinearAssignee>,
    pub labels: LinearLabelConnection,
    /// Markdown description. May be empty string.
    pub description: String,
}
