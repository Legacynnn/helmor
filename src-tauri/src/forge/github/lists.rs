//! Per-repo PR/Issue list helpers for the Tasks screen.
//!
//! Lighter weight than `inbox.rs`: takes a single repo, returns up to 50
//! open items via the `gh` CLI with the bound forge login.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::accounts::run_cli_with_login;
use super::api::{run_graphql, GraphqlOutcome};

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
pub struct GhIssueType {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
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
    #[serde(default)]
    pub issue_type: Option<GhIssueType>,
}

const PR_JSON_FIELDS: &str = "number,title,url,state,isDraft,updatedAt,author,assignees,labels";

// Issues use GraphQL (below) because gh's `--json` flag does NOT expose
// `issueType` even in 2.91. We fetch the same shape + the type so the
// Tasks screen can render a separate "Type" badge.
const ISSUES_GRAPHQL_QUERY: &str = r#"
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, states: [OPEN], orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number
        title
        url
        state
        updatedAt
        author { login }
        assignees(first: 10) { nodes { login } }
        labels(first: 20) { nodes { name color } }
        issueType { name color }
      }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct GqlIssuesResponse {
    data: GqlIssuesData,
}

#[derive(Debug, Deserialize)]
struct GqlIssuesData {
    repository: Option<GqlIssuesRepository>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlIssuesRepository {
    issues: GqlIssueConnection,
}

#[derive(Debug, Deserialize)]
struct GqlIssueConnection {
    nodes: Vec<GqlIssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlIssueNode {
    number: i64,
    title: String,
    url: String,
    state: String,
    updated_at: String,
    author: Option<GqlUserNode>,
    assignees: GqlUserConnection,
    labels: GqlLabelConnection,
    issue_type: Option<GqlIssueTypeNode>,
}

#[derive(Debug, Deserialize)]
struct GqlUserNode {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GqlUserConnection {
    nodes: Vec<GqlUserNode>,
}

#[derive(Debug, Deserialize)]
struct GqlLabelConnection {
    nodes: Vec<GqlLabelNode>,
}

#[derive(Debug, Deserialize)]
struct GqlLabelNode {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct GqlIssueTypeNode {
    name: String,
    /// GitHub's `IssueTypeColor` enum: GRAY, BLUE, GREEN, YELLOW,
    /// ORANGE, RED, PINK, PURPLE. Mapped to hex below.
    color: Option<String>,
}

/// Map GitHub's `IssueTypeColor` enum to a 6-char hex string (no '#'),
/// matching the shape of `GhLabel::color`.
fn issue_type_color_hex(value: &str) -> String {
    match value.to_ascii_uppercase().as_str() {
        "GRAY" => "6e7681",
        "BLUE" => "0969da",
        "GREEN" => "3fb950",
        "YELLOW" => "d4a72c",
        "ORANGE" => "fb8500",
        "RED" => "cf222e",
        "PINK" => "d63384",
        "PURPLE" => "8957e5",
        _ => "6e7681",
    }
    .to_string()
}

fn split_owner_repo(owner_slash_repo: &str) -> Result<(&str, &str)> {
    owner_slash_repo
        .split_once('/')
        .filter(|(o, n)| !o.is_empty() && !n.is_empty() && !n.contains('/'))
        .ok_or_else(|| anyhow!("Invalid owner/repo: {owner_slash_repo}"))
}

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
    let (owner, name) = split_owner_repo(owner_slash_repo)?;
    let outcome: GraphqlOutcome<GqlIssuesResponse> = run_graphql(
        login,
        ISSUES_GRAPHQL_QUERY,
        &[("owner", owner), ("name", name)],
    )
    .with_context(|| format!("GraphQL issue list failed for {owner_slash_repo}"))?;

    let response = match outcome {
        GraphqlOutcome::Ok(r) => r,
        GraphqlOutcome::Auth => return Ok(Vec::new()),
    };

    let nodes = response
        .data
        .repository
        .map(|r| r.issues.nodes)
        .unwrap_or_default();

    Ok(nodes
        .into_iter()
        .map(|n| GhIssue {
            number: n.number,
            title: n.title,
            url: n.url,
            state: n.state,
            updated_at: n.updated_at,
            author: n.author.map(|a| GhUser {
                login: a.login,
                name: None,
            }),
            assignees: n
                .assignees
                .nodes
                .into_iter()
                .map(|a| GhUser {
                    login: a.login,
                    name: None,
                })
                .collect(),
            labels: n
                .labels
                .nodes
                .into_iter()
                .map(|l| GhLabel {
                    name: l.name,
                    // GraphQL returns hex without '#'; gh CLI does the same. Keep
                    // both paths uniform so the frontend adapter can prepend '#'.
                    color: l.color,
                })
                .collect(),
            issue_type: n.issue_type.map(|t| GhIssueType {
                name: t.name,
                color: t.color.as_deref().map(issue_type_color_hex),
            }),
        })
        .collect())
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
