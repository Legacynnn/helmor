//! GitHub issue JSON → normalized `ProviderTask`, plus the fixed status set.

use crate::integrations::provider::{
    TaskAssignee, TaskLabel, TaskPriority, TaskStatus, TaskStatusKind,
};

/// Stable ids for GitHub's synthetic statuses (used as `status_id` for write-back).
pub const STATUS_OPEN: &str = "github:open";
pub const STATUS_DONE: &str = "github:done";
pub const STATUS_NOT_PLANNED: &str = "github:not_planned";

fn status_open() -> TaskStatus {
    TaskStatus {
        id: STATUS_OPEN.into(),
        name: "Open".into(),
        kind: TaskStatusKind::Unstarted,
        color: Some("#3fb950".into()),
    }
}

fn status_done() -> TaskStatus {
    TaskStatus {
        id: STATUS_DONE.into(),
        name: "Done".into(),
        kind: TaskStatusKind::Completed,
        color: Some("#8957e5".into()),
    }
}

fn status_not_planned() -> TaskStatus {
    TaskStatus {
        id: STATUS_NOT_PLANNED.into(),
        name: "Not planned".into(),
        kind: TaskStatusKind::Canceled,
        color: Some("#6e7681".into()),
    }
}

/// The three fixed board columns for GitHub repo issues.
pub fn fixed_statuses() -> Vec<TaskStatus> {
    vec![status_open(), status_done(), status_not_planned()]
}

/// Map GitHub `state` + `stateReason` to one of the fixed statuses.
pub fn status_for(state: &str, state_reason: Option<&str>) -> TaskStatus {
    match (
        state.to_ascii_uppercase().as_str(),
        state_reason.map(|r| r.to_ascii_uppercase()),
    ) {
        ("CLOSED", Some(r)) if r == "NOT_PLANNED" => status_not_planned(),
        ("CLOSED", _) => status_done(),
        _ => status_open(),
    }
}

/// A decoded GitHub issue search/list node. Field names match the GraphQL query.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueNode {
    pub id: String,
    pub number: i64,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    #[serde(default)]
    pub state_reason: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    pub repository: RepoRef,
    #[serde(default)]
    pub assignees: NodeList<AssigneeNode>,
    #[serde(default)]
    pub labels: NodeList<LabelNode>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    pub name_with_owner: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct NodeList<T> {
    #[serde(default = "Vec::new")]
    pub nodes: Vec<T>,
}

// Manual `Default` so it does not require `T: Default` — `#[serde(default)]` on
// `NodeList<AssigneeNode>` / `NodeList<LabelNode>` fields needs this, and those
// node types are not themselves `Default`.
impl<T> Default for NodeList<T> {
    fn default() -> Self {
        Self { nodes: Vec::new() }
    }
}

/// A paginated `{ nodes, pageInfo }` connection.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeListPaged<T> {
    #[serde(default = "Vec::new")]
    pub nodes: Vec<T>,
    #[serde(default)]
    pub page_info: PageInfo,
}

// Manual `Default` so it does not require `T: Default`, mirroring `NodeList<T>`.
impl<T> Default for NodeListPaged<T> {
    fn default() -> Self {
        Self {
            nodes: Vec::new(),
            page_info: PageInfo::default(),
        }
    }
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    #[serde(default)]
    pub has_next_page: bool,
    #[serde(default)]
    pub end_cursor: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssigneeNode {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub login: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LabelNode {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

/// Normalize a GitHub issue node into a `ProviderTask`.
pub fn map_issue(node: &IssueNode) -> crate::integrations::provider::ProviderTask {
    use crate::integrations::{provider::ProviderTask, GITHUB_PROVIDER};
    let assignee = node.assignees.nodes.first().map(|a| TaskAssignee {
        id: a.id.clone(),
        name: a.name.clone().unwrap_or_else(|| a.login.clone()),
        avatar_url: a.avatar_url.clone(),
    });
    let labels = node
        .labels
        .nodes
        .iter()
        .map(|l| TaskLabel {
            id: l.id.clone(),
            name: l.name.clone(),
            // GitHub colors are 6 hex digits with no leading '#'.
            color: l.color.as_ref().map(|c| format!("#{c}")),
        })
        .collect();
    ProviderTask {
        provider: GITHUB_PROVIDER.to_string(),
        external_id: node.id.clone(),
        identifier: format!("{}#{}", node.repository.name_with_owner, node.number),
        title: node.title.clone(),
        description: node.body.clone(),
        status: status_for(&node.state, node.state_reason.as_deref()),
        priority: TaskPriority::None,
        assignee,
        labels,
        project: None,
        url: node.url.clone(),
        team_id: Some(node.repository.name_with_owner.clone()),
        remote_updated_at: node.updated_at.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_issue_maps_to_open_unstarted() {
        let s = status_for("OPEN", None);
        assert_eq!(s.id, STATUS_OPEN);
        assert_eq!(s.kind, TaskStatusKind::Unstarted);
    }

    #[test]
    fn closed_completed_maps_to_done() {
        let s = status_for("CLOSED", Some("COMPLETED"));
        assert_eq!(s.id, STATUS_DONE);
        assert_eq!(s.kind, TaskStatusKind::Completed);
    }

    #[test]
    fn closed_not_planned_maps_to_canceled() {
        let s = status_for("CLOSED", Some("NOT_PLANNED"));
        assert_eq!(s.id, STATUS_NOT_PLANNED);
        assert_eq!(s.kind, TaskStatusKind::Canceled);
    }

    #[test]
    fn fixed_statuses_count() {
        assert_eq!(fixed_statuses().len(), 3);
    }

    #[test]
    fn map_issue_normalizes_fields() {
        let node = IssueNode {
            id: "I_1".into(),
            number: 42,
            title: "Fix the thing".into(),
            body: Some("details".into()),
            url: "https://github.com/acme/web/issues/42".into(),
            state: "OPEN".into(),
            state_reason: None,
            updated_at: Some("2026-06-21T00:00:00Z".into()),
            repository: RepoRef {
                name_with_owner: "acme/web".into(),
            },
            assignees: NodeList {
                nodes: vec![AssigneeNode {
                    id: "U_1".into(),
                    name: Some("Ada".into()),
                    login: "ada".into(),
                    avatar_url: None,
                }],
            },
            labels: NodeList {
                nodes: vec![LabelNode {
                    id: "L_1".into(),
                    name: "bug".into(),
                    color: Some("d73a4a".into()),
                }],
            },
        };
        let task = map_issue(&node);
        assert_eq!(task.provider, "github");
        assert_eq!(task.identifier, "acme/web#42");
        assert_eq!(task.status.id, STATUS_OPEN);
        assert_eq!(task.priority, TaskPriority::None);
        assert_eq!(task.assignee.as_ref().unwrap().name, "Ada");
        assert_eq!(task.labels[0].color.as_deref(), Some("#d73a4a"));
        assert_eq!(task.team_id.as_deref(), Some("acme/web"));
    }

    #[test]
    fn closed_without_reason_maps_to_done() {
        let s = status_for("CLOSED", None);
        assert_eq!(s.id, STATUS_DONE);
        assert_eq!(s.kind, TaskStatusKind::Completed);
    }

    #[test]
    fn assignee_name_falls_back_to_login() {
        let node = IssueNode {
            id: "I_2".into(),
            number: 3,
            title: "No name".into(),
            body: None,
            url: "https://github.com/acme/web/issues/3".into(),
            state: "OPEN".into(),
            state_reason: None,
            updated_at: None,
            repository: RepoRef {
                name_with_owner: "acme/web".into(),
            },
            assignees: NodeList {
                nodes: vec![AssigneeNode {
                    id: "U_2".into(),
                    name: None,
                    login: "octocat".into(),
                    avatar_url: None,
                }],
            },
            labels: NodeList { nodes: vec![] },
        };
        let task = map_issue(&node);
        assert_eq!(task.assignee.unwrap().name, "octocat");
    }

    #[test]
    fn deserializes_minimal_issue_json() {
        use serde_json::json;

        let node: IssueNode = serde_json::from_value(json!({
            "id": "I_7",
            "number": 7,
            "title": "Minimal",
            "url": "https://github.com/acme/web/issues/7",
            "state": "OPEN",
            "repository": { "nameWithOwner": "acme/web" },
            "updatedAt": "2026-06-21T00:00:00Z"
        }))
        .expect("minimal issue JSON deserializes");

        let task = map_issue(&node);
        assert_eq!(task.identifier, "acme/web#7");
        assert!(task.assignee.is_none());
        assert!(task.labels.is_empty());
        assert!(task.description.is_none());
        assert_eq!(task.status.id, STATUS_OPEN);
    }
}
