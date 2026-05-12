//! GitHub issue comments — list + create. Used by the tasks detail
//! screen so the user can reply to issues without leaving Helmor.
//!
//! REST is used over GraphQL here because the `addComment` GraphQL
//! mutation needs the issue's node ID (extra round-trip), while
//! `POST /repos/:owner/:repo/issues/:number/comments` accepts the
//! human number directly and returns the created comment.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::parse_external_reference;
use crate::forge::command::command_detail;
use crate::forge::types::{PrCommentInfo, PrCommentKind};

#[derive(Debug, Deserialize)]
struct IssueCommentRestResponse {
    id: i64,
    html_url: String,
    body: Option<String>,
    created_at: String,
    user: Option<UserNode>,
}

#[derive(Debug, Deserialize)]
struct UserNode {
    login: String,
    avatar_url: Option<String>,
}

impl From<IssueCommentRestResponse> for PrCommentInfo {
    fn from(value: IssueCommentRestResponse) -> Self {
        PrCommentInfo {
            id: value.id.to_string(),
            kind: PrCommentKind::Issue,
            author_login: value
                .user
                .as_ref()
                .map(|u| u.login.clone())
                .unwrap_or_else(|| "ghost".to_string()),
            author_avatar_url: value.user.and_then(|u| u.avatar_url),
            body: value.body.unwrap_or_default(),
            created_at: value.created_at,
            url: value.html_url,
            review_state: None,
        }
    }
}

/// List issue comments oldest-first. Matches GitHub's default ordering,
/// which is what readers expect when threading through a conversation.
pub fn list_issue_comments(login: &str, external_id: &str) -> Result<Vec<PrCommentInfo>> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/comments?per_page=100");

    let args = [
        "api",
        "--hostname",
        GITHUB_HOST,
        "-H",
        "Accept: application/vnd.github+json",
        &path,
    ];

    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &args) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Ok(Vec::new());
            }
            return Err(error.context("Failed to spawn `gh api` for GitHub issue comments"));
        }
    };

    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Ok(Vec::new());
        }
        return Err(anyhow!(
            "`gh api` failed for GitHub issue comments: {detail}"
        ));
    }

    let parsed: Vec<IssueCommentRestResponse> = serde_json::from_str(&output.stdout)
        .with_context(|| "Failed to decode GitHub issue comments response".to_string())?;
    Ok(parsed.into_iter().map(PrCommentInfo::from).collect())
}

/// Post a new comment on a GitHub issue. Returns the created comment so
/// the caller can append it to the local cache in one round-trip.
pub fn create_issue_comment(login: &str, external_id: &str, body: &str) -> Result<PrCommentInfo> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("Comment body cannot be empty"));
    }
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/comments");
    let body_field = format!("body={trimmed}");

    let args = [
        "api",
        "--hostname",
        GITHUB_HOST,
        "-H",
        "Accept: application/vnd.github+json",
        "-X",
        "POST",
        &path,
        "-f",
        body_field.as_str(),
    ];

    let output = gh_accounts::run_cli_with_login(GITHUB_HOST, login, &args)
        .context("Failed to spawn `gh api` for create issue comment")?;

    if !output.success {
        let detail = command_detail(&output);
        return Err(anyhow!(
            "`gh api` failed creating GitHub issue comment: {detail}"
        ));
    }

    let parsed: IssueCommentRestResponse = serde_json::from_str(&output.stdout)
        .with_context(|| "Failed to decode created GitHub issue comment".to_string())?;
    Ok(parsed.into())
}
