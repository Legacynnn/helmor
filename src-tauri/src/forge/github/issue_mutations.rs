//! GitHub issue metadata mutations: assignees, labels, milestone, and
//! issue type. Each mutation issues the change then re-fetches the
//! enriched issue detail so the caller can write it straight into the
//! React Query cache.
//!
//! REST is used for assignees/labels/milestone because those endpoints
//! accept human logins/names/numbers directly. Issue type only exists
//! through GraphQL (`updateIssueIssueType`), so that one requires
//! resolving the issue node id first.

use anyhow::{anyhow, Result};

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::detail::GithubIssueDetail;
use super::inbox::parse_external_reference;
use super::issue_graphql::fetch_issue_detail;
use crate::forge::command::command_detail;

/// Replace the assignees on the issue with `logins`. Passing `[]`
/// clears all assignees. Uses two REST calls (DELETE then POST) so the
/// final state matches even when the input shrinks the list.
pub fn set_issue_assignees(
    login: &str,
    external_id: &str,
    logins: &[String],
) -> Result<GithubIssueDetail> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let detail =
        fetch_issue_detail(login, external_id)?.ok_or_else(|| anyhow!("Issue not found"))?;

    let current: std::collections::HashSet<&str> =
        detail.assignees.iter().map(|u| u.login.as_str()).collect();
    let target: std::collections::HashSet<&str> = logins.iter().map(String::as_str).collect();

    let to_add: Vec<&str> = target.difference(&current).copied().collect();
    let to_remove: Vec<&str> = current.difference(&target).copied().collect();

    if !to_remove.is_empty() {
        rest_assignee_change(login, &owner, &repo, number, &to_remove, "DELETE")?;
    }
    if !to_add.is_empty() {
        rest_assignee_change(login, &owner, &repo, number, &to_add, "POST")?;
    }

    fetch_issue_detail(login, external_id)?
        .ok_or_else(|| anyhow!("Issue not found after assignee update"))
}

fn rest_assignee_change(
    login: &str,
    owner: &str,
    repo: &str,
    number: i64,
    logins: &[&str],
    method: &str,
) -> Result<()> {
    let path = format!("/repos/{owner}/{repo}/issues/{number}/assignees");
    let mut args: Vec<String> = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "-H".to_string(),
        "Accept: application/vnd.github+json".to_string(),
        "-X".to_string(),
        method.to_string(),
        path,
    ];
    for assignee in logins {
        args.push("-f".to_string());
        args.push(format!("assignees[]={assignee}"));
    }
    run_or_bail(login, &args, "assignee mutation")
}

/// Replace the issue's labels with `names`. Empty list removes them all.
/// Uses PUT which atomically replaces the set (single round-trip).
pub fn set_issue_labels(
    login: &str,
    external_id: &str,
    names: &[String],
) -> Result<GithubIssueDetail> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/labels");
    let mut args: Vec<String> = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "-H".to_string(),
        "Accept: application/vnd.github+json".to_string(),
        "-X".to_string(),
        "PUT".to_string(),
        path,
    ];
    if names.is_empty() {
        // PUT with empty body would 404; the only way to clear via REST
        // is DELETE /labels. Branch here to keep callers symmetrical.
        let clear_path = format!("/repos/{owner}/{repo}/issues/{number}/labels");
        let clear_args = vec![
            "api".to_string(),
            "--hostname".to_string(),
            GITHUB_HOST.to_string(),
            "-H".to_string(),
            "Accept: application/vnd.github+json".to_string(),
            "-X".to_string(),
            "DELETE".to_string(),
            clear_path,
        ];
        run_or_bail(login, &clear_args, "label clear")?;
    } else {
        for name in names {
            args.push("-f".to_string());
            args.push(format!("labels[]={name}"));
        }
        run_or_bail(login, &args, "label mutation")?;
    }
    fetch_issue_detail(login, external_id)?
        .ok_or_else(|| anyhow!("Issue not found after label update"))
}

/// Set or clear the issue's milestone. Pass `None` to clear it. The
/// milestone is identified by its REST `number` (not GraphQL ID).
pub fn set_issue_milestone(
    login: &str,
    external_id: &str,
    milestone_number: Option<i64>,
) -> Result<GithubIssueDetail> {
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
    match milestone_number {
        Some(n) => {
            args.push("-F".to_string());
            args.push(format!("milestone={n}"));
        }
        None => {
            // `gh api` typed-null via the `-F field=null` shorthand.
            args.push("-F".to_string());
            args.push("milestone=null".to_string());
        }
    }
    run_or_bail(login, &args, "milestone mutation")?;
    fetch_issue_detail(login, external_id)?
        .ok_or_else(|| anyhow!("Issue not found after milestone update"))
}

const SET_ISSUE_TYPE_MUTATION: &str = r#"
mutation($issueId: ID!, $issueTypeId: ID) {
  updateIssueIssueType(input: { issueId: $issueId, issueTypeId: $issueTypeId }) {
    issue { id }
  }
}
"#;

/// Set or clear the issue type. Pass `None` to clear. Requires the
/// issue's GraphQL node id — we re-use the detail fetch for that.
pub fn set_issue_type(
    login: &str,
    external_id: &str,
    issue_type_id: Option<String>,
) -> Result<GithubIssueDetail> {
    let detail =
        fetch_issue_detail(login, external_id)?.ok_or_else(|| anyhow!("Issue not found"))?;
    let issue_node_id = detail
        .node_id
        .as_deref()
        .ok_or_else(|| anyhow!("Issue is missing a GraphQL node id"))?;

    let mut args: Vec<String> = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={SET_ISSUE_TYPE_MUTATION}"),
        "-f".to_string(),
        format!("issueId={issue_node_id}"),
    ];
    match issue_type_id.as_deref() {
        Some(id) => {
            args.push("-f".to_string());
            args.push(format!("issueTypeId={id}"));
        }
        None => {
            args.push("-F".to_string());
            args.push("issueTypeId=null".to_string());
        }
    }
    run_or_bail(login, &args, "issue type mutation")?;
    fetch_issue_detail(login, external_id)?
        .ok_or_else(|| anyhow!("Issue not found after issue type update"))
}

fn run_or_bail(login: &str, args: &[String], label: &str) -> Result<()> {
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Err(anyhow!("GitHub authentication is required for {label}"));
            }
            return Err(error.context(format!("Failed to spawn `gh api` for {label}")));
        }
    };
    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Err(anyhow!("GitHub authentication is required for {label}"));
        }
        return Err(anyhow!("`gh api` failed for {label}: {detail}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_external_reference_for_mutations() {
        // Sanity check that the shared helper still recognises the
        // owner/repo#number format every mutation path relies on.
        let (owner, repo, number) = parse_external_reference("octo/repo#42").expect("valid ref");
        assert_eq!(owner, "octo");
        assert_eq!(repo, "repo");
        assert_eq!(number, 42);
    }

    #[test]
    fn parses_external_reference_rejects_garbage() {
        assert!(parse_external_reference("not-an-id").is_err());
        assert!(parse_external_reference("octo/repo").is_err());
    }
}
