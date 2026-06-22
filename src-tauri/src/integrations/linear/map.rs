//! Map Linear GraphQL nodes into provider-agnostic types.

use super::types::{IssueNode, StateNode, TeamNode};
use crate::integrations::provider::{
    IntegrationTeam, ProviderTask, TaskAssignee, TaskLabel, TaskPriority, TaskProject, TaskStatus,
    TaskStatusKind,
};
use crate::integrations::LINEAR_PROVIDER;

pub fn map_team(node: &TeamNode) -> IntegrationTeam {
    IntegrationTeam {
        id: node.id.clone(),
        key: node.key.clone(),
        name: node.name.clone(),
    }
}

pub fn map_state(state: &StateNode) -> TaskStatus {
    TaskStatus {
        id: state.id.clone(),
        name: state.name.clone(),
        kind: TaskStatusKind::from_str_lossy(&state.state_type),
        color: state.color.clone(),
    }
}

pub fn map_issue(node: &IssueNode) -> ProviderTask {
    let status = match &node.state {
        Some(state) => map_state(state),
        None => TaskStatus {
            id: String::new(),
            name: "Unknown".to_string(),
            kind: TaskStatusKind::Unstarted,
            color: None,
        },
    };

    let assignee = node.assignee.as_ref().map(|a| TaskAssignee {
        id: a.id.clone(),
        name: a.name.clone(),
        avatar_url: a.avatar_url.clone(),
    });

    let labels = node
        .labels
        .as_ref()
        .map(|l| {
            l.nodes
                .iter()
                .map(|label| TaskLabel {
                    id: label.id.clone(),
                    name: label.name.clone(),
                    color: label.color.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    ProviderTask {
        provider: LINEAR_PROVIDER.to_string(),
        external_id: node.id.clone(),
        identifier: node.identifier.clone(),
        title: node.title.clone(),
        description: node.description.clone(),
        status,
        // Linear sends priority as a float (0–4); round to the nearest bucket.
        priority: TaskPriority::from_i64(node.priority.round() as i64),
        assignee,
        labels,
        project: node.project.as_ref().map(|p| TaskProject {
            id: p.id.clone(),
            name: p.name.clone(),
            icon: p.icon.clone(),
            color: p.color.clone(),
        }),
        url: node.url.clone(),
        team_id: node.team.as_ref().map(|t| t.id.clone()),
        remote_updated_at: node.updated_at.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::linear::types::TeamIssuesData;

    #[test]
    fn maps_full_issue_node() {
        let json = serde_json::json!({
            "issues": {
                "pageInfo": { "hasNextPage": false, "endCursor": null },
                "nodes": [{
                    "id": "issue-uuid-1",
                    "identifier": "ENG-123",
                    "title": "Fix the thing",
                    "description": "Some **markdown** body",
                    "priority": 2.0,
                    "url": "https://linear.app/acme/issue/ENG-123",
                    "updatedAt": "2026-06-21T10:00:00.000Z",
                    "team": { "id": "team-1" },
                    "project": { "id": "proj-1", "name": "Q3 Roadmap", "icon": "🚀", "color": "#5e6ad2" },
                    "state": { "id": "state-1", "name": "In Progress", "type": "started", "color": "#abc" },
                    "assignee": { "id": "user-1", "name": "Dana", "avatarUrl": null },
                    "labels": { "nodes": [{ "id": "lab-1", "name": "bug", "color": "#f00" }] }
                }]
            }
        });
        let data: TeamIssuesData = serde_json::from_value(json).unwrap();
        let task = map_issue(&data.issues.nodes[0]);

        assert_eq!(task.provider, "linear");
        assert_eq!(task.external_id, "issue-uuid-1");
        assert_eq!(task.identifier, "ENG-123");
        assert_eq!(task.title, "Fix the thing");
        assert_eq!(task.status.kind, TaskStatusKind::Started);
        assert_eq!(task.priority, TaskPriority::High);
        assert_eq!(task.team_id.as_deref(), Some("team-1"));
        assert_eq!(task.assignee.as_ref().unwrap().name, "Dana");
        assert_eq!(task.labels.len(), 1);
        assert_eq!(task.labels[0].name, "bug");
        let project = task.project.expect("project mapped");
        assert_eq!(project.name, "Q3 Roadmap");
        assert_eq!(project.icon.as_deref(), Some("🚀"));
        assert_eq!(project.color.as_deref(), Some("#5e6ad2"));
    }

    #[test]
    fn maps_issue_with_missing_optionals() {
        let json = serde_json::json!({
            "issues": {
                "pageInfo": { "hasNextPage": false, "endCursor": null },
                "nodes": [{
                    "id": "issue-2",
                    "identifier": "ENG-2",
                    "title": "No frills",
                    "description": null,
                    "priority": 0.0,
                    "url": "https://linear.app/acme/issue/ENG-2",
                    "updatedAt": null,
                    "team": null,
                    "state": { "id": "s", "name": "Todo", "type": "unstarted", "color": null },
                    "assignee": null,
                    "labels": { "nodes": [] }
                }]
            }
        });
        let data: TeamIssuesData = serde_json::from_value(json).unwrap();
        let task = map_issue(&data.issues.nodes[0]);

        assert_eq!(task.priority, TaskPriority::None);
        assert_eq!(task.status.kind, TaskStatusKind::Unstarted);
        assert!(task.assignee.is_none());
        assert!(task.labels.is_empty());
        assert!(task.team_id.is_none());
    }

    #[test]
    fn unknown_state_type_falls_back_to_unstarted() {
        assert_eq!(
            TaskStatusKind::from_str_lossy("mystery"),
            TaskStatusKind::Unstarted
        );
        assert_eq!(
            TaskStatusKind::from_str_lossy("triage"),
            TaskStatusKind::Backlog
        );
        assert_eq!(
            TaskStatusKind::from_str_lossy("cancelled"),
            TaskStatusKind::Canceled
        );
    }
}
