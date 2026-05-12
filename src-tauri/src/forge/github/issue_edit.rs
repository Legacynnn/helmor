//! GitHub issue editing — PATCH /repos/:owner/:repo/issues/:number.
//! Used by the tasks detail screen so users can edit title, body, and
//! open/closed state inline. Only fields present in `IssueUpdate` are
//! sent to GitHub; `None` fields are omitted entirely so a body-only
//! edit can't blank the title.
//!
//! REST is used over GraphQL here because the GraphQL mutation needs
//! the issue node ID (extra round-trip) while REST accepts the human
//! number directly and returns the refreshed issue in one call.

use anyhow::{anyhow, Result};
use serde::Deserialize;

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::parse_external_reference;
use super::issue_graphql::fetch_issue_detail;
use crate::forge::command::command_detail;
use crate::forge::github::inbox::detail::GithubIssueDetail;

/// Subset of GitHub issue fields editable from the detail screen. Each
/// field is `Option<String>` so callers can patch one field at a time
/// without touching the others.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueUpdate {
    pub title: Option<String>,
    pub body: Option<String>,
    /// `"open"` or `"closed"`. Validated by GitHub.
    pub state: Option<String>,
    /// `"completed"`, `"not_planned"`, or `"reopened"`. Only meaningful
    /// when `state` is present.
    pub state_reason: Option<String>,
}

impl IssueUpdate {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.body.is_none()
            && self.state.is_none()
            && self.state_reason.is_none()
    }
}

/// Patch a GitHub issue. Returns the refreshed `GithubIssueDetail` so
/// the frontend can write it into the React Query cache without a
/// follow-up GET.
pub fn update_issue(
    login: &str,
    external_id: &str,
    update: IssueUpdate,
) -> Result<GithubIssueDetail> {
    if update.is_empty() {
        return Err(anyhow!("No fields to update"));
    }
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}");

    let mut args: Vec<String> = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "-H".to_string(),
        "Accept: application/vnd.github+json".to_string(),
        "-X".to_string(),
        "PATCH".to_string(),
        path,
    ];

    if let Some(title) = update.title.as_deref() {
        args.push("-f".to_string());
        args.push(format!("title={title}"));
    }
    if let Some(body) = update.body.as_deref() {
        args.push("-f".to_string());
        args.push(format!("body={body}"));
    }
    if let Some(state) = update.state.as_deref() {
        args.push("-f".to_string());
        args.push(format!("state={state}"));
    }
    if let Some(state_reason) = update.state_reason.as_deref() {
        args.push("-f".to_string());
        args.push(format!("state_reason={state_reason}"));
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Err(anyhow!(
                    "GitHub authentication is required to edit this issue"
                ));
            }
            return Err(error.context("Failed to spawn `gh api` for issue update"));
        }
    };

    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Err(anyhow!(
                "GitHub authentication is required to edit this issue"
            ));
        }
        return Err(anyhow!("`gh api` failed updating issue: {detail}"));
    }

    // REST PATCH already succeeded; pull the enriched view back via
    // GraphQL so the caller cache picks up assignees/labels/type/etc.
    // in one round-trip.
    fetch_issue_detail(login, external_id)?.ok_or_else(|| anyhow!("Issue not found after update"))
}
