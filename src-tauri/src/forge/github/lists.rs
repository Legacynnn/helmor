//! Per-repo PR/Issue list helpers for the Tasks screen.
//!
//! Lighter weight than `inbox.rs`: takes a single repo, returns up to 50
//! open items via the `gh` CLI with the bound forge login.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::accounts::run_cli_with_login;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhUser {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPr {
    pub number: i64,
    pub title: String,
    pub url: String,
    /// "OPEN", "CLOSED", "MERGED" (gh prints uppercase).
    pub state: String,
    pub is_draft: bool,
    pub updated_at: String,
    #[serde(default)]
    pub author: Option<GhUser>,
    #[serde(default)]
    pub assignees: Vec<GhUser>,
    #[serde(default)]
    pub labels: Vec<GhLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhIssue {
    pub number: i64,
    pub title: String,
    pub url: String,
    /// "OPEN", "CLOSED".
    pub state: String,
    pub updated_at: String,
    #[serde(default)]
    pub author: Option<GhUser>,
    #[serde(default)]
    pub assignees: Vec<GhUser>,
    #[serde(default)]
    pub labels: Vec<GhLabel>,
}

const PR_JSON_FIELDS: &str = "number,title,url,state,isDraft,updatedAt,author,assignees,labels";
const ISSUE_JSON_FIELDS: &str = "number,title,url,state,updatedAt,author,assignees,labels";

pub fn list_repo_prs(login: &str, owner_slash_repo: &str) -> Result<Vec<GhPr>> {
    let output = run_cli_with_login(
        "github.com",
        login,
        &[
            "pr",
            "list",
            "--repo",
            owner_slash_repo,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            PR_JSON_FIELDS,
        ],
    )?;
    serde_json::from_str(&output.stdout)
        .with_context(|| format!("Failed to parse `gh pr list` for {owner_slash_repo}"))
}

pub fn list_repo_issues(login: &str, owner_slash_repo: &str) -> Result<Vec<GhIssue>> {
    let output = run_cli_with_login(
        "github.com",
        login,
        &[
            "issue",
            "list",
            "--repo",
            owner_slash_repo,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            ISSUE_JSON_FIELDS,
        ],
    )?;
    serde_json::from_str(&output.stdout)
        .with_context(|| format!("Failed to parse `gh issue list` for {owner_slash_repo}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pr_list() {
        let raw = r#"[
            {
                "number": 42,
                "title": "Add feature",
                "url": "https://github.com/x/r/pull/42",
                "state": "OPEN",
                "isDraft": false,
                "updatedAt": "2026-03-23T10:00:00Z",
                "author": { "login": "dan" },
                "assignees": [{ "login": "dan" }],
                "labels": [{ "name": "feat", "color": "0e8a16" }]
            }
        ]"#;
        let prs: Vec<GhPr> = serde_json::from_str(raw).expect("parse");
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 42);
        assert!(!prs[0].is_draft);
        assert_eq!(prs[0].labels[0].name, "feat");
    }

    #[test]
    fn parses_issue_list_with_no_assignees() {
        let raw = r#"[
            {
                "number": 7,
                "title": "Bug",
                "url": "https://github.com/x/r/issues/7",
                "state": "OPEN",
                "updatedAt": "2026-03-23T10:00:00Z",
                "author": { "login": "dan" },
                "assignees": [],
                "labels": []
            }
        ]"#;
        let issues: Vec<GhIssue> = serde_json::from_str(raw).expect("parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 7);
        assert!(issues[0].assignees.is_empty());
    }
}
