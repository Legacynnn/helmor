//! GitHub issue timeline — interleaved comments + events, used by the
//! tasks detail screen's activity feed (mirrors github.com's right
//! column on an issue page).
//!
//! Pagination: this fetches up to 250 most-recent items in a single
//! call. Issues with deeper history will surface the most recent 250
//! events for now; we can grow this into a cursor-paginated stream
//! later if real usage justifies it.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::accounts as gh_accounts;
use super::api::{looks_like_auth_rejection, GITHUB_HOST};
use super::inbox::parse_external_reference;
use crate::forge::command::command_detail;

const TIMELINE_QUERY: &str = r#"
query IssueTimeline($owner: String!, $name: String!, $number: Int!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      timelineItems(
        first: $first
        itemTypes: [
          ASSIGNED_EVENT
          UNASSIGNED_EVENT
          LABELED_EVENT
          UNLABELED_EVENT
          CLOSED_EVENT
          REOPENED_EVENT
          RENAMED_TITLE_EVENT
          MILESTONED_EVENT
          DEMILESTONED_EVENT
          CROSS_REFERENCED_EVENT
          REFERENCED_EVENT
          ISSUE_COMMENT
          LOCKED_EVENT
          UNLOCKED_EVENT
          PINNED_EVENT
          UNPINNED_EVENT
          TRANSFERRED_EVENT
          MARKED_AS_DUPLICATE_EVENT
          UNMARKED_AS_DUPLICATE_EVENT
          CONNECTED_EVENT
          DISCONNECTED_EVENT
        ]
      ) {
        nodes {
          __typename
          ... on AssignedEvent {
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login name avatarUrl } }
          }
          ... on UnassignedEvent {
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login name avatarUrl } }
          }
          ... on LabeledEvent {
            createdAt
            actor { login avatarUrl }
            label { name color }
          }
          ... on UnlabeledEvent {
            createdAt
            actor { login avatarUrl }
            label { name color }
          }
          ... on ClosedEvent {
            createdAt
            stateReason
            actor { login avatarUrl }
          }
          ... on ReopenedEvent {
            createdAt
            actor { login avatarUrl }
          }
          ... on RenamedTitleEvent {
            createdAt
            previousTitle
            currentTitle
            actor { login avatarUrl }
          }
          ... on MilestonedEvent {
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on DemilestonedEvent {
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on CrossReferencedEvent {
            createdAt
            actor { login avatarUrl }
            source {
              __typename
              ... on Issue {
                number
                title
                state
                url
                repository { nameWithOwner }
              }
              ... on PullRequest {
                number
                title
                state
                isDraft
                url
                repository { nameWithOwner }
              }
            }
          }
          ... on ReferencedEvent {
            createdAt
            actor { login avatarUrl }
            subject {
              __typename
              ... on Issue { number title state url repository { nameWithOwner } }
              ... on PullRequest {
                number title state isDraft url repository { nameWithOwner }
              }
            }
          }
          ... on IssueComment {
            id
            createdAt
            url
            body
            author { login avatarUrl }
          }
          ... on LockedEvent {
            createdAt
            lockReason
            actor { login avatarUrl }
          }
          ... on UnlockedEvent {
            createdAt
            actor { login avatarUrl }
          }
          ... on PinnedEvent {
            createdAt
            actor { login avatarUrl }
          }
          ... on UnpinnedEvent {
            createdAt
            actor { login avatarUrl }
          }
          ... on TransferredEvent {
            createdAt
            actor { login avatarUrl }
            fromRepository { nameWithOwner }
          }
          ... on MarkedAsDuplicateEvent {
            createdAt
            actor { login avatarUrl }
            duplicate {
              __typename
              ... on Issue { number title url repository { nameWithOwner } }
              ... on PullRequest { number title url repository { nameWithOwner } }
            }
          }
          ... on UnmarkedAsDuplicateEvent {
            createdAt
            actor { login avatarUrl }
          }
          ... on ConnectedEvent {
            createdAt
            actor { login avatarUrl }
            subject {
              __typename
              ... on Issue { number title state url repository { nameWithOwner } }
              ... on PullRequest {
                number title state isDraft url repository { nameWithOwner }
              }
            }
          }
          ... on DisconnectedEvent {
            createdAt
            actor { login avatarUrl }
            subject {
              __typename
              ... on Issue { number title state url repository { nameWithOwner } }
              ... on PullRequest {
                number title state isDraft url repository { nameWithOwner }
              }
            }
          }
        }
      }
    }
  }
}
"#;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GithubTimelineEvent {
    Assigned {
        actor: Option<Actor>,
        created_at: String,
        assignee_login: String,
        assignee_name: Option<String>,
        assignee_avatar_url: Option<String>,
    },
    Unassigned {
        actor: Option<Actor>,
        created_at: String,
        assignee_login: String,
        assignee_name: Option<String>,
        assignee_avatar_url: Option<String>,
    },
    Labeled {
        actor: Option<Actor>,
        created_at: String,
        label_name: String,
        label_color: Option<String>,
    },
    Unlabeled {
        actor: Option<Actor>,
        created_at: String,
        label_name: String,
        label_color: Option<String>,
    },
    Closed {
        actor: Option<Actor>,
        created_at: String,
        state_reason: Option<String>,
    },
    Reopened {
        actor: Option<Actor>,
        created_at: String,
    },
    Renamed {
        actor: Option<Actor>,
        created_at: String,
        from: String,
        to: String,
    },
    Milestoned {
        actor: Option<Actor>,
        created_at: String,
        milestone_title: String,
    },
    Demilestoned {
        actor: Option<Actor>,
        created_at: String,
        milestone_title: String,
    },
    CrossReferenced {
        actor: Option<Actor>,
        created_at: String,
        source: TimelineReference,
    },
    Referenced {
        actor: Option<Actor>,
        created_at: String,
        subject: TimelineReference,
    },
    Comment {
        id: String,
        actor: Option<Actor>,
        created_at: String,
        url: String,
        body: String,
    },
    Locked {
        actor: Option<Actor>,
        created_at: String,
        lock_reason: Option<String>,
    },
    Unlocked {
        actor: Option<Actor>,
        created_at: String,
    },
    Pinned {
        actor: Option<Actor>,
        created_at: String,
    },
    Unpinned {
        actor: Option<Actor>,
        created_at: String,
    },
    Transferred {
        actor: Option<Actor>,
        created_at: String,
        from_repo_with_owner: Option<String>,
    },
    MarkedAsDuplicate {
        actor: Option<Actor>,
        created_at: String,
        duplicate: Option<TimelineReference>,
    },
    UnmarkedAsDuplicate {
        actor: Option<Actor>,
        created_at: String,
    },
    Connected {
        actor: Option<Actor>,
        created_at: String,
        subject: TimelineReference,
    },
    Disconnected {
        actor: Option<Actor>,
        created_at: String,
        subject: TimelineReference,
    },
}

impl GithubTimelineEvent {
    pub fn created_at(&self) -> &str {
        match self {
            Self::Assigned { created_at, .. }
            | Self::Unassigned { created_at, .. }
            | Self::Labeled { created_at, .. }
            | Self::Unlabeled { created_at, .. }
            | Self::Closed { created_at, .. }
            | Self::Reopened { created_at, .. }
            | Self::Renamed { created_at, .. }
            | Self::Milestoned { created_at, .. }
            | Self::Demilestoned { created_at, .. }
            | Self::CrossReferenced { created_at, .. }
            | Self::Referenced { created_at, .. }
            | Self::Comment { created_at, .. }
            | Self::Locked { created_at, .. }
            | Self::Unlocked { created_at, .. }
            | Self::Pinned { created_at, .. }
            | Self::Unpinned { created_at, .. }
            | Self::Transferred { created_at, .. }
            | Self::MarkedAsDuplicate { created_at, .. }
            | Self::UnmarkedAsDuplicate { created_at, .. }
            | Self::Connected { created_at, .. }
            | Self::Disconnected { created_at, .. } => created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Actor {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TimelineReference {
    Issue {
        number: i64,
        title: String,
        state: String,
        url: String,
        repo_with_owner: String,
    },
    PullRequest {
        number: i64,
        title: String,
        state: String,
        is_draft: bool,
        url: String,
        repo_with_owner: String,
    },
}

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
struct EnvelopeData {
    repository: Option<RepositoryNode>,
}

#[derive(Debug, Deserialize)]
struct RepositoryNode {
    issue: Option<IssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueNode {
    timeline_items: TimelineItems,
}

#[derive(Debug, Deserialize)]
struct TimelineItems {
    nodes: Vec<serde_json::Value>,
}

pub fn fetch_issue_timeline(
    login: &str,
    external_id: &str,
) -> Result<Option<Vec<GithubTimelineEvent>>> {
    let (owner, repo, number) = parse_external_reference(external_id)?;
    let args = vec![
        "api".to_string(),
        "--hostname".to_string(),
        GITHUB_HOST.to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={TIMELINE_QUERY}"),
        "-f".to_string(),
        format!("owner={owner}"),
        "-f".to_string(),
        format!("name={repo}"),
        "-F".to_string(),
        format!("number={number}"),
        "-F".to_string(),
        "first=250".to_string(),
    ];
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = match gh_accounts::run_cli_with_login(GITHUB_HOST, login, &arg_refs) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("{error:#}");
            if looks_like_auth_rejection(&message) {
                return Ok(None);
            }
            return Err(error.context("Failed to spawn `gh api graphql` for issue timeline"));
        }
    };

    if !output.success {
        let detail = command_detail(&output);
        if looks_like_auth_rejection(&detail) {
            return Ok(None);
        }
        return Err(anyhow!(
            "`gh api graphql` failed for issue timeline: {detail}"
        ));
    }

    let envelope = serde_json::from_str::<Envelope>(&output.stdout)
        .with_context(|| "Failed to decode GitHub issue timeline response".to_string())?;

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

    let Some(nodes) = envelope
        .data
        .and_then(|d| d.repository?.issue.map(|i| i.timeline_items.nodes))
    else {
        return Ok(None);
    };

    let mut events: Vec<GithubTimelineEvent> = nodes
        .into_iter()
        .filter_map(|node| node_to_event(&node))
        .collect();
    // GraphQL returns oldest-first; preserve that for the activity feed.
    events.sort_by(|a, b| a.created_at().cmp(b.created_at()));
    Ok(Some(events))
}

fn node_to_event(value: &serde_json::Value) -> Option<GithubTimelineEvent> {
    let typename = value.get("__typename")?.as_str()?;
    let created_at = value.get("createdAt")?.as_str()?.to_string();
    let actor = parse_actor(value.get("actor"));

    match typename {
        "AssignedEvent" => {
            let user = value.get("assignee")?;
            Some(GithubTimelineEvent::Assigned {
                actor,
                created_at,
                assignee_login: user.get("login")?.as_str()?.to_string(),
                assignee_name: user
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                assignee_avatar_url: user
                    .get("avatarUrl")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
        "UnassignedEvent" => {
            let user = value.get("assignee")?;
            Some(GithubTimelineEvent::Unassigned {
                actor,
                created_at,
                assignee_login: user.get("login")?.as_str()?.to_string(),
                assignee_name: user
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                assignee_avatar_url: user
                    .get("avatarUrl")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
        "LabeledEvent" => {
            let label = value.get("label")?;
            let name = label.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            Some(GithubTimelineEvent::Labeled {
                actor,
                created_at,
                label_name: name,
                label_color: label
                    .get("color")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
        "UnlabeledEvent" => {
            let label = value.get("label")?;
            let name = label.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            Some(GithubTimelineEvent::Unlabeled {
                actor,
                created_at,
                label_name: name,
                label_color: label
                    .get("color")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
        "ClosedEvent" => Some(GithubTimelineEvent::Closed {
            actor,
            created_at,
            state_reason: value
                .get("stateReason")
                .and_then(|v| v.as_str())
                .map(|s| s.to_ascii_lowercase()),
        }),
        "ReopenedEvent" => Some(GithubTimelineEvent::Reopened { actor, created_at }),
        "RenamedTitleEvent" => Some(GithubTimelineEvent::Renamed {
            actor,
            created_at,
            from: value.get("previousTitle")?.as_str()?.to_string(),
            to: value.get("currentTitle")?.as_str()?.to_string(),
        }),
        "MilestonedEvent" => Some(GithubTimelineEvent::Milestoned {
            actor,
            created_at,
            milestone_title: value.get("milestoneTitle")?.as_str()?.to_string(),
        }),
        "DemilestonedEvent" => Some(GithubTimelineEvent::Demilestoned {
            actor,
            created_at,
            milestone_title: value.get("milestoneTitle")?.as_str()?.to_string(),
        }),
        "CrossReferencedEvent" => {
            let source = parse_reference(value.get("source")?)?;
            Some(GithubTimelineEvent::CrossReferenced {
                actor,
                created_at,
                source,
            })
        }
        "ReferencedEvent" => {
            let subject = parse_reference(value.get("subject")?)?;
            Some(GithubTimelineEvent::Referenced {
                actor,
                created_at,
                subject,
            })
        }
        "IssueComment" => Some(GithubTimelineEvent::Comment {
            id: value.get("id")?.as_str()?.to_string(),
            actor: parse_actor(value.get("author")),
            created_at,
            url: value.get("url")?.as_str()?.to_string(),
            body: value
                .get("body")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_default(),
        }),
        "LockedEvent" => Some(GithubTimelineEvent::Locked {
            actor,
            created_at,
            lock_reason: value
                .get("lockReason")
                .and_then(|v| v.as_str())
                .map(|s| s.to_ascii_lowercase()),
        }),
        "UnlockedEvent" => Some(GithubTimelineEvent::Unlocked { actor, created_at }),
        "PinnedEvent" => Some(GithubTimelineEvent::Pinned { actor, created_at }),
        "UnpinnedEvent" => Some(GithubTimelineEvent::Unpinned { actor, created_at }),
        "TransferredEvent" => Some(GithubTimelineEvent::Transferred {
            actor,
            created_at,
            from_repo_with_owner: value
                .pointer("/fromRepository/nameWithOwner")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        }),
        "MarkedAsDuplicateEvent" => Some(GithubTimelineEvent::MarkedAsDuplicate {
            actor,
            created_at,
            duplicate: value.get("duplicate").and_then(parse_reference),
        }),
        "UnmarkedAsDuplicateEvent" => {
            Some(GithubTimelineEvent::UnmarkedAsDuplicate { actor, created_at })
        }
        "ConnectedEvent" => {
            let subject = parse_reference(value.get("subject")?)?;
            Some(GithubTimelineEvent::Connected {
                actor,
                created_at,
                subject,
            })
        }
        "DisconnectedEvent" => {
            let subject = parse_reference(value.get("subject")?)?;
            Some(GithubTimelineEvent::Disconnected {
                actor,
                created_at,
                subject,
            })
        }
        // Unknown typename: skip. The query already restricts itemTypes,
        // so reaching this branch means GitHub added a new event type
        // since we shipped — silently dropping it is better than
        // failing the whole timeline render.
        _ => None,
    }
}

fn parse_actor(value: Option<&serde_json::Value>) -> Option<Actor> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let login = value.get("login")?.as_str()?.to_string();
    Some(Actor {
        login,
        avatar_url: value
            .get("avatarUrl")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

fn parse_reference(value: &serde_json::Value) -> Option<TimelineReference> {
    let typename = value.get("__typename")?.as_str()?;
    let number = value.get("number")?.as_i64()?;
    let title = value.get("title")?.as_str()?.to_string();
    let url = value.get("url")?.as_str()?.to_string();
    let state = value
        .get("state")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let repo_with_owner = value
        .pointer("/repository/nameWithOwner")
        .and_then(|v| v.as_str())?
        .to_string();
    match typename {
        "Issue" => Some(TimelineReference::Issue {
            number,
            title,
            state,
            url,
            repo_with_owner,
        }),
        "PullRequest" => Some(TimelineReference::PullRequest {
            number,
            title,
            state,
            is_draft: value
                .get("isDraft")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            url,
            repo_with_owner,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_assigned_event() {
        let node = json!({
            "__typename": "AssignedEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "actor": { "login": "alice", "avatarUrl": "https://a/a.png" },
            "assignee": { "login": "bob", "name": "Bob B", "avatarUrl": "https://a/b.png" }
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::Assigned {
                assignee_login,
                actor,
                ..
            } => {
                assert_eq!(assignee_login, "bob");
                assert_eq!(actor.unwrap().login, "alice");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parses_renamed_event() {
        let node = json!({
            "__typename": "RenamedTitleEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "previousTitle": "old",
            "currentTitle": "new",
            "actor": { "login": "alice", "avatarUrl": null }
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::Renamed { from, to, .. } => {
                assert_eq!(from, "old");
                assert_eq!(to, "new");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parses_cross_referenced_with_pr_source() {
        let node = json!({
            "__typename": "CrossReferencedEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "actor": { "login": "alice", "avatarUrl": null },
            "source": {
                "__typename": "PullRequest",
                "number": 42,
                "title": "Fix the thing",
                "state": "OPEN",
                "isDraft": true,
                "url": "https://github.com/o/r/pull/42",
                "repository": { "nameWithOwner": "o/r" }
            }
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::CrossReferenced { source, .. } => match source {
                TimelineReference::PullRequest {
                    number, is_draft, ..
                } => {
                    assert_eq!(number, 42);
                    assert!(is_draft);
                }
                _ => panic!("wrong source variant"),
            },
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn parses_issue_comment_event() {
        let node = json!({
            "__typename": "IssueComment",
            "id": "IC_1",
            "createdAt": "2026-01-01T00:00:00Z",
            "url": "https://github.com/o/r/issues/1#issuecomment-1",
            "body": "hello",
            "author": { "login": "alice", "avatarUrl": "https://a/a.png" }
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::Comment {
                id, body, actor, ..
            } => {
                assert_eq!(id, "IC_1");
                assert_eq!(body, "hello");
                assert_eq!(actor.unwrap().login, "alice");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn unknown_typename_is_skipped() {
        let node = json!({
            "__typename": "FutureWidgetEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "actor": { "login": "alice" }
        });
        assert!(node_to_event(&node).is_none());
    }

    #[test]
    fn closed_event_lowercases_state_reason() {
        let node = json!({
            "__typename": "ClosedEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "stateReason": "COMPLETED",
            "actor": { "login": "alice", "avatarUrl": null }
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::Closed { state_reason, .. } => {
                assert_eq!(state_reason.as_deref(), Some("completed"));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn null_actor_is_acceptable() {
        let node = json!({
            "__typename": "ReopenedEvent",
            "createdAt": "2026-01-01T00:00:00Z",
            "actor": null
        });
        let event = node_to_event(&node).unwrap();
        match event {
            GithubTimelineEvent::Reopened { actor, .. } => assert!(actor.is_none()),
            _ => panic!("wrong variant"),
        }
    }
}
