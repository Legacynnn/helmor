//! Map normalized Linear `ProviderTask`s into the sidebar `InboxItem`/detail shape.

use serde::Serialize;

use crate::forge::inbox::{InboxItem, InboxSource, InboxState, InboxStateTone};
use crate::integrations::provider::{ProviderTask, TaskPriority, TaskStatusKind};

/// Detail payload for a Linear issue, surfaced through the cross-provider
/// `InboxItemDetail::Linear` arm (serializes as `{ "type": "linear", "data": {...} }`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueDetail {
    pub external_id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub state: String,
    pub priority_label: String,
    pub assignee_name: Option<String>,
    pub updated_at: Option<String>,
}

fn priority_label(priority: TaskPriority) -> &'static str {
    match priority {
        TaskPriority::Urgent => "Urgent",
        TaskPriority::High => "High",
        TaskPriority::Medium => "Medium",
        TaskPriority::Low => "Low",
        TaskPriority::None => "No priority",
    }
}

fn state_tone(kind: TaskStatusKind) -> InboxStateTone {
    match kind {
        TaskStatusKind::Completed | TaskStatusKind::Canceled => InboxStateTone::Closed,
        TaskStatusKind::Started => InboxStateTone::Open,
        _ => InboxStateTone::Neutral,
    }
}

/// Convert a Linear `ProviderTask` into a sidebar `InboxItem`.
pub fn task_to_item(task: &ProviderTask) -> InboxItem {
    InboxItem {
        id: format!("linear:{}", task.external_id),
        source: InboxSource::Linear,
        external_id: task.external_id.clone(),
        external_url: task.url.clone(),
        title: task.title.clone(),
        subtitle: Some(task.identifier.clone()),
        state: Some(InboxState {
            label: task.status.name.clone(),
            tone: state_tone(task.status.kind),
        }),
        last_activity_at: parse_timestamp_ms(task.remote_updated_at.as_deref()),
    }
}

/// Convert a Linear `ProviderTask` into the detail payload.
pub fn task_to_detail(task: &ProviderTask) -> LinearIssueDetail {
    LinearIssueDetail {
        external_id: task.external_id.clone(),
        identifier: task.identifier.clone(),
        title: task.title.clone(),
        description: task.description.clone(),
        url: task.url.clone(),
        state: task.status.name.clone(),
        priority_label: priority_label(task.priority).to_string(),
        assignee_name: task.assignee.as_ref().map(|a| a.name.clone()),
        updated_at: task.remote_updated_at.clone(),
    }
}

/// RFC3339 -> Unix milliseconds, mirroring `forge::github::inbox::parse_iso8601_to_ms`.
fn parse_timestamp_ms(value: Option<&str>) -> i64 {
    value
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::provider::{TaskAssignee, TaskStatus};

    fn sample() -> ProviderTask {
        ProviderTask {
            provider: "linear".into(),
            external_id: "abc-123".into(),
            identifier: "ENG-7".into(),
            title: "Fix login".into(),
            description: Some("body".into()),
            status: TaskStatus {
                id: "s1".into(),
                name: "In Progress".into(),
                kind: TaskStatusKind::Started,
                color: None,
            },
            priority: TaskPriority::High,
            assignee: Some(TaskAssignee {
                id: "u1".into(),
                name: "Ada".into(),
                avatar_url: None,
            }),
            labels: vec![],
            project: None,
            url: "https://linear.app/x/issue/ENG-7".into(),
            team_id: Some("t1".into()),
            remote_updated_at: Some("2026-06-21T00:00:00Z".into()),
        }
    }

    #[test]
    fn maps_item_fields() {
        let item = task_to_item(&sample());
        assert_eq!(item.id, "linear:abc-123");
        assert!(matches!(item.source, InboxSource::Linear));
        assert_eq!(item.external_id, "abc-123");
        assert_eq!(item.subtitle.as_deref(), Some("ENG-7"));
        assert_eq!(item.state.as_ref().unwrap().label, "In Progress");
        // 2026-06-21T00:00:00Z in Unix milliseconds.
        assert_eq!(item.last_activity_at, 1782000000000);
    }

    #[test]
    fn maps_detail_fields() {
        let d = task_to_detail(&sample());
        assert_eq!(d.identifier, "ENG-7");
        assert_eq!(d.priority_label, "High");
        assert_eq!(d.assignee_name.as_deref(), Some("Ada"));
        assert_eq!(d.state, "In Progress");
    }
}
