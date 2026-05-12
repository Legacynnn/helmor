//! Repository-level pickers for the issue sidebar: assignable users,
//! labels (with descriptions), milestones, and issue types. Labels /
//! assignees / milestones come from REST since the mutations we use
//! also go through REST and accept human names/logins/numbers. Issue
//! types only exist on GraphQL.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use crate::forge::command::command_detail;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubAssignableUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoLabel {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoMilestone {
    /// Numeric milestone id used by REST PATCH (`/repos/.../issues/N`
    /// accepts `milestone: <number>`).
    pub number: i64,
    pub title: String,
    pub due_on: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoIssueType {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AssignableUserRest {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RepoLabelRest {
    name: String,
    color: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RepoMilestoneRest {
    number: i64,
    title: String,
    due_on: Option<String>,
    state: Option<String>,
}

pub fn list_assignable_users(
    login: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<GithubAssignableUser>> {
    let path = format!("/repos/{owner}/{repo}/assignees?per_page=100");
    let Some(stdout) = run_rest(login, &path, "GitHub assignable users")? else {
        return Ok(Vec::new());
    };
    let users: Vec<AssignableUserRest> = serde_json::from_str(&stdout)
        .with_context(|| "Failed to decode GitHub assignable users response".to_string())?;
    Ok(users
        .into_iter()
        .map(|u| GithubAssignableUser {
            login: u.login,
            name: u.name,
            avatar_url: u.avatar_url,
        })
        .collect())
}

pub fn list_repo_labels(login: &str, owner: &str, repo: &str) -> Result<Vec<GithubRepoLabel>> {
    let path = format!("/repos/{owner}/{repo}/labels?per_page=100");
    let Some(stdout) = run_rest(login, &path, "GitHub repository labels")? else {
        return Ok(Vec::new());
    };
    let labels: Vec<RepoLabelRest> = serde_json::from_str(&stdout)
        .with_context(|| "Failed to decode GitHub repository labels response".to_string())?;
    Ok(labels
        .into_iter()
        .map(|l| GithubRepoLabel {
            name: l.name,
            color: l.color,
            description: l.description,
        })
        .collect())
}

pub fn list_milestones(login: &str, owner: &str, repo: &str) -> Result<Vec<GithubRepoMilestone>> {
    let path = format!("/repos/{owner}/{repo}/milestones?state=open&per_page=100");
    let Some(stdout) = run_rest(login, &path, "GitHub milestones")? else {
        return Ok(Vec::new());
    };
    let milestones: Vec<RepoMilestoneRest> = serde_json::from_str(&stdout)
        .with_context(|| "Failed to decode GitHub milestones response".to_string())?;
    Ok(milestones
        .into_iter()
        .map(|m| GithubRepoMilestone {
            number: m.number,
            title: m.title,
            due_on: m.due_on,
            state: m.state.map(|s| s.to_ascii_lowercase()),
        })
        .collect())
}

const ISSUE_TYPES_QUERY: &str = r#"
query RepoIssueTypes($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issueTypes(first: 50) {
      nodes { id name color description }
    }
  }
}
"#;

pub fn list_issue_types(login: &str, owner: &str, repo: &str) -> Result<Vec<GithubRepoIssueType>> {
    let args = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={ISSUE_TYPES_QUERY}"),
        "-f".to_string(),
        format!("owner={owner}"),
        "-f".to_string(),
        format!("name={repo}"),
    ];
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Ok(Vec::new());
            }
            return Err(error.context("Failed to spawn `gh api graphql` for issue types"));
        }
    };
    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Ok(Vec::new());
        }
        return Err(anyhow!(
            "`gh api graphql` failed for repo issue types: {detail}"
        ));
    }
    let parsed: serde_json::Value = serde_json::from_str(&output.stdout)
        .with_context(|| "Failed to decode issue types response".to_string())?;
    let nodes = parsed
        .pointer("/data/repository/issueTypes/nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(nodes
        .into_iter()
        .filter_map(|node| {
            Some(GithubRepoIssueType {
                id: node.get("id")?.as_str()?.to_string(),
                name: node.get("name")?.as_str()?.to_string(),
                color: node
                    .get("color")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                description: node
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        })
        .collect())
}

fn run_rest(login: &str, path: &str, label: &str) -> Result<Option<String>> {
    let args = [
        "api",
        "--hostname",
        GITHUB_HOST,
        "-H",
        "Accept: application/vnd.github+json",
        path,
    ];
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &args) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Ok(None);
            }
            return Err(error.context(format!("Failed to spawn `gh api` for {label}")));
        }
    };
    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Ok(None);
        }
        return Err(anyhow!("`gh api` failed for {label}: {detail}"));
    }
    Ok(Some(output.stdout))
}
