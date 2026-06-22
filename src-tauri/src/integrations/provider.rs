//! Provider-agnostic task types. Concrete providers (Linear today) normalize
//! their API shapes into these so the frontend renders one icon/status set
//! regardless of source.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

/// A selectable team/project within a connected workspace (Linear "team").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationTeam {
    pub id: String,
    /// Short key, e.g. Linear's `ENG`.
    pub key: String,
    pub name: String,
}

/// Connection status surfaced to the Settings panel and Tasks screen. Never
/// carries the API key itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub provider: String,
    pub connected: bool,
    pub org_name: Option<String>,
    pub selected_team_id: Option<String>,
    pub selected_team_name: Option<String>,
    pub teams: Vec<IntegrationTeam>,
    pub last_synced_at: Option<String>,
}

/// Normalized lifecycle bucket for a task's status, independent of the
/// provider's named states. Drives the status icon glyph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatusKind {
    Backlog,
    Unstarted,
    Started,
    Completed,
    Canceled,
}

impl TaskStatusKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TaskStatusKind::Backlog => "backlog",
            TaskStatusKind::Unstarted => "unstarted",
            TaskStatusKind::Started => "started",
            TaskStatusKind::Completed => "completed",
            TaskStatusKind::Canceled => "canceled",
        }
    }

    /// Column/group order: active work first, terminal states last. Mirrors the
    /// frontend `KIND_ORDER`.
    pub fn sort_rank(self) -> u8 {
        match self {
            TaskStatusKind::Started => 0,
            TaskStatusKind::Unstarted => 1,
            TaskStatusKind::Backlog => 2,
            TaskStatusKind::Completed => 3,
            TaskStatusKind::Canceled => 4,
        }
    }

    pub fn from_str_lossy(value: &str) -> TaskStatusKind {
        match value.trim().to_ascii_lowercase().as_str() {
            "backlog" => TaskStatusKind::Backlog,
            "unstarted" => TaskStatusKind::Unstarted,
            "started" => TaskStatusKind::Started,
            "completed" => TaskStatusKind::Completed,
            "canceled" | "cancelled" => TaskStatusKind::Canceled,
            // Linear also emits "triage" — bucket it with backlog.
            "triage" => TaskStatusKind::Backlog,
            _ => TaskStatusKind::Unstarted,
        }
    }
}

/// Normalized status with the provider's own id/name/color preserved so we can
/// round-trip edits and tint icons.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatus {
    pub id: String,
    pub name: String,
    pub kind: TaskStatusKind,
    pub color: Option<String>,
}

/// Priority, normalized to Linear's 0–4 scale (0 None, 1 Urgent, 2 High,
/// 3 Medium, 4 Low). Stored as the integer; this enum is the typed view.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskPriority {
    None,
    Urgent,
    High,
    Medium,
    Low,
}

impl TaskPriority {
    pub fn from_i64(value: i64) -> TaskPriority {
        match value {
            1 => TaskPriority::Urgent,
            2 => TaskPriority::High,
            3 => TaskPriority::Medium,
            4 => TaskPriority::Low,
            _ => TaskPriority::None,
        }
    }

    pub fn as_i64(self) -> i64 {
        match self {
            TaskPriority::None => 0,
            TaskPriority::Urgent => 1,
            TaskPriority::High => 2,
            TaskPriority::Medium => 3,
            TaskPriority::Low => 4,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskAssignee {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLabel {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProject {
    pub id: String,
    pub name: String,
    /// Project icon: an emoji when the user picked one, otherwise a named glyph
    /// id (rendered as a colored fallback) or `None`.
    pub icon: Option<String>,
    /// Hex accent color for the project, e.g. `#5e6ad2`.
    pub color: Option<String>,
}

/// A task normalized from any provider. `external_id` is the provider's stable
/// node id; the local DB key is `provider:external_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTask {
    pub provider: String,
    pub external_id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub assignee: Option<TaskAssignee>,
    pub labels: Vec<TaskLabel>,
    pub project: Option<TaskProject>,
    pub url: String,
    pub team_id: Option<String>,
    /// Provider's `updatedAt`, RFC3339. Used for last-write-wins conflict notes.
    pub remote_updated_at: Option<String>,
}

/// Result of the bootstrap probe — also doubles as credential validation.
pub struct OrgTeams {
    pub org_name: String,
    pub teams: Vec<IntegrationTeam>,
}

/// Mutable fields for an issue update. `None` leaves a field untouched.
#[derive(Debug, Default, Clone)]
pub struct IssuePatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<String>,
    pub priority: Option<i64>,
    pub assignee_id: Option<String>,
    /// Full replacement set of label ids.
    pub label_ids: Option<Vec<String>>,
}

impl IssuePatch {
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.status_id.is_none()
            && self.priority.is_none()
            && self.assignee_id.is_none()
            && self.label_ids.is_none()
    }

    /// Linear-style GraphQL input map. GitHub builds its own input separately.
    pub fn to_linear_input(&self) -> Value {
        let mut input = Map::new();
        if let Some(title) = &self.title {
            input.insert("title".into(), json!(title));
        }
        if let Some(description) = &self.description {
            input.insert("description".into(), json!(description));
        }
        if let Some(status_id) = &self.status_id {
            input.insert("stateId".into(), json!(status_id));
        }
        if let Some(priority) = self.priority {
            input.insert("priority".into(), json!(priority));
        }
        if let Some(assignee_id) = &self.assignee_id {
            if assignee_id.is_empty() {
                input.insert("assigneeId".into(), Value::Null);
            } else {
                input.insert("assigneeId".into(), json!(assignee_id));
            }
        }
        if let Some(label_ids) = &self.label_ids {
            input.insert("labelIds".into(), json!(label_ids));
        }
        Value::Object(input)
    }
}

/// Optional fields for a new issue beyond the required title.
#[derive(Debug, Default)]
pub struct NewIssue<'a> {
    pub description: Option<&'a str>,
    pub priority: Option<i64>,
    pub status_id: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub project_id: Option<&'a str>,
    pub label_ids: Option<&'a [String]>,
}

/// Provider-agnostic operations the IPC commands call. Each concrete provider
/// (Linear, GitHub) constructs short-lived clients internally.
pub trait TaskProvider: Send {
    /// Probe credentials and load the org name + selectable teams (GitHub: repos).
    fn org_and_teams(&self) -> Result<OrgTeams>;
    /// Workflow states for a team (GitHub: the fixed Open/Done/Not planned set).
    fn list_states(&self, team: &str) -> Result<Vec<TaskStatus>>;
    fn list_projects(&self, team: &str) -> Result<Vec<TaskProject>>;
    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>>;
    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>>;
    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>>;
    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask>;
    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask>;
}
