//! GraphQL-backed GitHub issue detail. Replaces the REST
//! `/repos/.../issues/:number` lookup so the tasks detail screen can
//! render assignees, labels, issue type, milestone, participants, and
//! linked pull requests in a single round-trip.
//!
//! The REST path is still used by `issue_edit::update_issue` for the
//! PATCH itself; that module then calls back into [`fetch_issue_detail`]
//! to surface the enriched payload after the mutation.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::detail::{
    GithubIssueDetail, GithubIssueType, GithubLabelRef, GithubLinkedPullRequest, GithubMilestone,
    GithubUserRef,
};
use super::inbox::parse_external_reference;
use crate::forge::command::command_detail;

const ISSUE_DETAIL_QUERY: &str = r#"
query IssueDetail($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id
      number
      title
      body
      url
      state
      stateReason
      createdAt
      updatedAt
      closedAt
      author { login avatarUrl ... on User { name url } }
      assignees(first: 20) {
        nodes { login name avatarUrl url }
      }
      labels(first: 50) {
        nodes { name color description }
      }
      issueType { id name color description }
      milestone { id title dueOn state }
      participants(first: 20) {
        nodes { login avatarUrl url }
      }
      closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
        nodes {
          number
          title
          state
          isDraft
          url
          repository { nameWithOwner }
        }
      }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct Envelope {
    data: Option<EnvelopeData>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Debug, Deserialize)]
struct GraphqlError {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvelopeData {
    repository: Option<RepositoryNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryNode {
    issue: Option<IssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueNode {
    id: String,
    title: String,
    body: Option<String>,
    url: String,
    state: String,
    state_reason: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    closed_at: Option<String>,
    author: Option<AuthorNode>,
    assignees: NodeList<UserNode>,
    labels: NodeList<LabelNode>,
    issue_type: Option<IssueTypeNode>,
    milestone: Option<MilestoneNode>,
    participants: NodeList<UserNode>,
    closed_by_pull_requests_references: NodeList<LinkedPrNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthorNode {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NodeList<T> {
    nodes: Vec<T>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserNode {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LabelNode {
    name: String,
    color: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IssueTypeNode {
    id: String,
    name: String,
    color: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MilestoneNode {
    id: String,
    title: String,
    due_on: Option<String>,
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedPrNode {
    number: i64,
    title: String,
    state: String,
    is_draft: bool,
    url: String,
    repository: LinkedPrRepository,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedPrRepository {
    name_with_owner: String,
}

/// Run `IssueDetail` against `owner/repo#number`. Returns `Ok(None)` for
/// auth failure (caller renders the "Connect" CTA) or when the issue
/// can't be resolved (deleted / wrong number / private repo without
/// access).
pub fn fetch_issue_detail(login: &str, external_id: &str) -> Result<Option<GithubIssueDetail>> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let args = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={ISSUE_DETAIL_QUERY}"),
        "-f".to_string(),
        format!("owner={owner}"),
        "-f".to_string(),
        format!("name={repo}"),
        "-F".to_string(),
        format!("number={number}"),
    ];
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Ok(None);
            }
            return Err(error.context("Failed to spawn `gh api graphql` for GitHub issue detail"));
        }
    };

    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Ok(None);
        }
        return Err(anyhow!(
            "`gh api graphql` failed for GitHub issue detail: {detail}"
        ));
    }

    let envelope = serde_json::from_str::<Envelope>(&output.stdout)
        .with_context(|| "Failed to decode GitHub issue detail GraphQL response".to_string())?;

    if let Some(errors) = envelope.errors {
        if !errors.is_empty() {
            let is_not_found = errors.iter().any(|e| {
                e.message.contains("Could not resolve to a Repository")
                    || e.message.contains("Could not resolve to an Issue")
                    || e.message.contains("NOT_FOUND")
            });
            if is_not_found {
                return Ok(None);
            }
            return Err(anyhow!(
                "GitHub GraphQL errors: {}",
                errors
                    .iter()
                    .map(|e| e.message.as_str())
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
    }

    let Some(issue) = envelope.data.and_then(|d| d.repository?.issue) else {
        return Ok(None);
    };

    Ok(Some(issue_node_to_detail(issue, external_id)))
}

fn issue_node_to_detail(node: IssueNode, external_id: &str) -> GithubIssueDetail {
    let (author_login, author_avatar_url) = match node.author {
        Some(author) => (Some(author.login), author.avatar_url),
        None => (None, None),
    };
    GithubIssueDetail {
        external_id: external_id.to_string(),
        title: node.title,
        body: node.body,
        url: node.url,
        // Match the existing REST shape: lowercased state for the frontend
        // status mapper (`open` / `closed`).
        state: node.state.to_ascii_lowercase(),
        state_reason: node.state_reason.map(|s| s.to_ascii_lowercase()),
        author_login,
        author_avatar_url,
        created_at: node.created_at,
        updated_at: node.updated_at,
        closed_at: node.closed_at,
        node_id: Some(node.id),
        assignees: node
            .assignees
            .nodes
            .into_iter()
            .map(user_node_to_ref)
            .collect(),
        labels: node
            .labels
            .nodes
            .into_iter()
            .map(|label| GithubLabelRef {
                name: label.name,
                color: label.color,
                description: label.description,
            })
            .collect(),
        issue_type: node.issue_type.map(|t| GithubIssueType {
            id: t.id,
            name: t.name,
            color: t.color,
            description: t.description,
        }),
        milestone: node.milestone.map(|m| GithubMilestone {
            id: m.id,
            title: m.title,
            due_on: m.due_on,
            state: m.state.map(|s| s.to_ascii_lowercase()),
        }),
        participants: node
            .participants
            .nodes
            .into_iter()
            .map(user_node_to_ref)
            .collect(),
        linked_pull_requests: node
            .closed_by_pull_requests_references
            .nodes
            .into_iter()
            .map(|pr| GithubLinkedPullRequest {
                number: pr.number,
                title: pr.title,
                state: pr.state,
                is_draft: pr.is_draft,
                url: pr.url,
                repo_with_owner: pr.repository.name_with_owner,
            })
            .collect(),
    }
}

fn user_node_to_ref(user: UserNode) -> GithubUserRef {
    GithubUserRef {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        url: user.url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_envelope() -> &'static str {
        r#"{
  "data": {
    "repository": {
      "issue": {
        "id": "I_kwDOABCD123",
        "number": 42,
        "title": "Something broke",
        "body": "Steps to repro:\n\n1. ...",
        "url": "https://github.com/octo/repo/issues/42",
        "state": "OPEN",
        "stateReason": null,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-02T00:00:00Z",
        "closedAt": null,
        "author": {
          "login": "alice",
          "avatarUrl": "https://avatars.example/alice.png",
          "name": "Alice A",
          "url": "https://github.com/alice"
        },
        "assignees": {
          "nodes": [
            {
              "login": "bob",
              "name": "Bob B",
              "avatarUrl": "https://avatars.example/bob.png",
              "url": "https://github.com/bob"
            }
          ]
        },
        "labels": {
          "nodes": [
            { "name": "bug", "color": "d73a4a", "description": "Something isn't working" }
          ]
        },
        "issueType": { "id": "IT_1", "name": "Bug", "color": "RED", "description": null },
        "milestone": { "id": "MI_1", "title": "v1.0", "dueOn": "2026-06-01T00:00:00Z", "state": "OPEN" },
        "participants": {
          "nodes": [
            { "login": "alice", "name": "Alice A", "avatarUrl": null, "url": null },
            { "login": "bob", "name": null, "avatarUrl": null, "url": null }
          ]
        },
        "closedByPullRequestsReferences": {
          "nodes": [
            {
              "number": 100,
              "title": "Fix the thing",
              "state": "OPEN",
              "isDraft": false,
              "url": "https://github.com/octo/repo/pull/100",
              "repository": { "nameWithOwner": "octo/repo" }
            }
          ]
        }
      }
    }
  }
}"#
    }

    #[test]
    fn parses_full_issue_response() {
        let env: Envelope = serde_json::from_str(sample_envelope()).expect("decode");
        let issue = env.data.unwrap().repository.unwrap().issue.unwrap();
        let detail = issue_node_to_detail(issue, "octo/repo#42");

        assert_eq!(detail.external_id, "octo/repo#42");
        assert_eq!(detail.title, "Something broke");
        // state is lowercased so the existing frontend mapper keeps working.
        assert_eq!(detail.state, "open");
        assert_eq!(detail.node_id.as_deref(), Some("I_kwDOABCD123"));
        assert_eq!(detail.author_login.as_deref(), Some("alice"));
        assert_eq!(detail.assignees.len(), 1);
        assert_eq!(detail.assignees[0].login, "bob");
        assert_eq!(detail.labels.len(), 1);
        assert_eq!(detail.labels[0].color.as_deref(), Some("d73a4a"));
        assert_eq!(detail.issue_type.as_ref().unwrap().name, "Bug");
        assert_eq!(detail.milestone.as_ref().unwrap().title, "v1.0");
        // Milestone state is also lowercased for frontend symmetry.
        assert_eq!(
            detail.milestone.as_ref().unwrap().state.as_deref(),
            Some("open")
        );
        assert_eq!(detail.participants.len(), 2);
        assert_eq!(detail.linked_pull_requests.len(), 1);
        assert_eq!(detail.linked_pull_requests[0].number, 100);
        assert_eq!(detail.linked_pull_requests[0].repo_with_owner, "octo/repo");
    }

    #[test]
    fn handles_missing_optional_blocks() {
        let raw = r#"{
            "data": {
              "repository": {
                "issue": {
                  "id": "I_x",
                  "number": 1,
                  "title": "t",
                  "body": null,
                  "url": "https://github.com/o/r/issues/1",
                  "state": "CLOSED",
                  "stateReason": "COMPLETED",
                  "createdAt": null,
                  "updatedAt": null,
                  "closedAt": null,
                  "author": null,
                  "assignees": { "nodes": [] },
                  "labels": { "nodes": [] },
                  "issueType": null,
                  "milestone": null,
                  "participants": { "nodes": [] },
                  "closedByPullRequestsReferences": { "nodes": [] }
                }
              }
            }
          }"#;
        let env: Envelope = serde_json::from_str(raw).expect("decode");
        let issue = env.data.unwrap().repository.unwrap().issue.unwrap();
        let detail = issue_node_to_detail(issue, "o/r#1");
        assert_eq!(detail.state, "closed");
        assert_eq!(detail.state_reason.as_deref(), Some("completed"));
        assert!(detail.assignees.is_empty());
        assert!(detail.labels.is_empty());
        assert!(detail.issue_type.is_none());
        assert!(detail.milestone.is_none());
        assert!(detail.linked_pull_requests.is_empty());
    }

    #[test]
    fn surfaces_graphql_not_found_as_none() {
        let raw = r#"{
            "data": null,
            "errors": [{"message": "Could not resolve to an Issue with the number of 999."}]
          }"#;
        let env: Envelope = serde_json::from_str(raw).expect("decode");
        let errors = env.errors.unwrap();
        assert!(errors
            .iter()
            .any(|e| e.message.contains("Could not resolve to an Issue")));
    }
}
