//! Persistence for the local `tasks` mirror.
//!
//! Tasks are pulled from a connected integration and upserted here. Local-only
//! columns (`agent_feedback`, `linked_workspace_id`) are preserved across
//! re-sync. `dirty = 1` marks a row with a local edit pending push to the
//! provider.

use anyhow::{Context, Result};
use serde::Serialize;

use super::db;
use crate::integrations::provider::{
    ProviderTask, TaskAssignee, TaskLabel, TaskPriority, TaskProject, TaskStatus, TaskStatusKind,
};

/// Frontend-facing task shape (camelCase). Assembled from the flat DB row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    pub id: String,
    pub provider: String,
    pub external_id: String,
    pub identifier: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub assignee: Option<TaskAssignee>,
    pub labels: Vec<TaskLabel>,
    pub project: Option<TaskProject>,
    pub url: Option<String>,
    pub team_id: Option<String>,
    pub remote_updated_at: Option<String>,
    pub agent_feedback: Option<String>,
    pub linked_workspace_id: Option<String>,
    pub synced_at: Option<String>,
    pub dirty: bool,
    pub updated_at: Option<String>,
}

/// Patch for a local edit. `None` leaves a field untouched.
#[derive(Debug, Default, Clone)]
pub struct TaskLocalPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
}

pub fn local_id(provider: &str, external_id: &str) -> String {
    format!("{provider}:{external_id}")
}

fn row_to_view(row: &rusqlite::Row) -> rusqlite::Result<TaskView> {
    let status = TaskStatus {
        id: row
            .get::<_, Option<String>>("status_id")?
            .unwrap_or_default(),
        name: row
            .get::<_, Option<String>>("status_name")?
            .unwrap_or_default(),
        kind: TaskStatusKind::from_str_lossy(
            &row.get::<_, Option<String>>("status_kind")?
                .unwrap_or_default(),
        ),
        color: row.get("status_color")?,
    };
    let assignee = match row.get::<_, Option<String>>("assignee_id")? {
        Some(id) if !id.is_empty() => Some(TaskAssignee {
            id,
            name: row
                .get::<_, Option<String>>("assignee_name")?
                .unwrap_or_default(),
            avatar_url: row.get("assignee_avatar")?,
        }),
        _ => None,
    };
    let labels = row
        .get::<_, Option<String>>("labels_json")?
        .and_then(|raw| serde_json::from_str::<Vec<TaskLabel>>(&raw).ok())
        .unwrap_or_default();
    let project = match row.get::<_, Option<String>>("project_id")? {
        Some(id) if !id.is_empty() => Some(TaskProject {
            id,
            name: row
                .get::<_, Option<String>>("project_name")?
                .unwrap_or_default(),
            icon: row.get("project_icon")?,
            color: row.get("project_color")?,
        }),
        _ => None,
    };

    Ok(TaskView {
        id: row.get("id")?,
        provider: row.get("provider")?,
        external_id: row.get("external_id")?,
        identifier: row.get("identifier")?,
        title: row.get("title")?,
        description: row.get("description")?,
        status,
        priority: TaskPriority::from_i64(row.get::<_, i64>("priority")?),
        assignee,
        labels,
        project,
        url: row.get("url")?,
        team_id: row.get("team_id")?,
        remote_updated_at: row.get("remote_updated_at")?,
        agent_feedback: row.get("agent_feedback")?,
        linked_workspace_id: row.get("linked_workspace_id")?,
        synced_at: row.get("synced_at")?,
        dirty: row.get::<_, i64>("dirty")? != 0,
        updated_at: row.get("updated_at")?,
    })
}

const SELECT_COLS: &str = "id, provider, external_id, identifier, title, description, \
    status_id, status_name, status_kind, status_color, priority, \
    assignee_id, assignee_name, assignee_avatar, labels_json, \
    project_id, project_name, project_icon, project_color, \
    url, team_id, remote_updated_at, agent_feedback, linked_workspace_id, synced_at, dirty, updated_at";

pub fn list_tasks(provider: &str, team_id: Option<&str>) -> Result<Vec<TaskView>> {
    let connection = db::read_conn()?;
    let sql = format!(
        "SELECT {SELECT_COLS} FROM tasks WHERE provider = ?1 \
         AND (?2 IS NULL OR team_id = ?2) \
         ORDER BY datetime(remote_updated_at) DESC, identifier DESC"
    );
    let mut statement = connection.prepare(&sql).context("prepare list_tasks")?;
    let rows = statement
        .query_map(rusqlite::params![provider, team_id], row_to_view)
        .context("query list_tasks")?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("read list_tasks rows")
}

pub fn load_task(id: &str) -> Result<Option<TaskView>> {
    let connection = db::read_conn()?;
    let sql = format!("SELECT {SELECT_COLS} FROM tasks WHERE id = ?1");
    let mut statement = connection.prepare(&sql).context("prepare load_task")?;
    let mut rows = statement
        .query_map([id], row_to_view)
        .context("query load_task")?;
    match rows.next() {
        Some(result) => result.map(Some).context("read load_task row"),
        None => Ok(None),
    }
}

/// Insert or update a task from a freshly-fetched provider task. Preserves
/// local-only columns and clears `dirty` (remote is now authoritative for the
/// synced fields).
pub fn upsert_task(task: &ProviderTask, synced_at: &str) -> Result<String> {
    let id = local_id(&task.provider, &task.external_id);
    let labels_json = serde_json::to_string(&task.labels).context("serialize labels")?;
    let connection = db::write_conn()?;
    connection
        .execute(
            r#"
            INSERT INTO tasks (
                id, provider, external_id, identifier, title, description,
                status_id, status_name, status_kind, status_color, priority,
                assignee_id, assignee_name, assignee_avatar, labels_json,
                project_id, project_name, project_icon, project_color, url,
                team_id, remote_updated_at, synced_at, dirty, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, 0, datetime('now')
            )
            ON CONFLICT(provider, external_id) DO UPDATE SET
                identifier = excluded.identifier,
                title = excluded.title,
                description = excluded.description,
                status_id = excluded.status_id,
                status_name = excluded.status_name,
                status_kind = excluded.status_kind,
                status_color = excluded.status_color,
                priority = excluded.priority,
                assignee_id = excluded.assignee_id,
                assignee_name = excluded.assignee_name,
                assignee_avatar = excluded.assignee_avatar,
                labels_json = excluded.labels_json,
                project_id = excluded.project_id,
                project_name = excluded.project_name,
                project_icon = excluded.project_icon,
                project_color = excluded.project_color,
                url = excluded.url,
                team_id = excluded.team_id,
                remote_updated_at = excluded.remote_updated_at,
                synced_at = excluded.synced_at,
                dirty = 0,
                updated_at = datetime('now')
                -- agent_feedback and linked_workspace_id are intentionally NOT
                -- overwritten: they are local-only and survive re-sync.
            "#,
            rusqlite::params![
                id,
                task.provider,
                task.external_id,
                task.identifier,
                task.title,
                task.description,
                task.status.id,
                task.status.name,
                task.status.kind.as_str(),
                task.status.color,
                task.priority.as_i64(),
                task.assignee.as_ref().map(|a| a.id.clone()),
                task.assignee.as_ref().map(|a| a.name.clone()),
                task.assignee.as_ref().and_then(|a| a.avatar_url.clone()),
                labels_json,
                task.project.as_ref().map(|p| p.id.clone()),
                task.project.as_ref().map(|p| p.name.clone()),
                task.project.as_ref().and_then(|p| p.icon.clone()),
                task.project.as_ref().and_then(|p| p.color.clone()),
                task.url,
                task.team_id,
                task.remote_updated_at,
                synced_at,
            ],
        )
        .context("upsert task")?;
    Ok(id)
}

/// Apply a local edit and mark the row dirty (pending push).
pub fn update_task_local(id: &str, patch: &TaskLocalPatch) -> Result<()> {
    let connection = db::write_conn()?;
    if let Some(title) = &patch.title {
        connection
            .execute(
                "UPDATE tasks SET title = ?2 WHERE id = ?1",
                rusqlite::params![id, title],
            )
            .context("update task title")?;
    }
    if let Some(description) = &patch.description {
        connection
            .execute(
                "UPDATE tasks SET description = ?2 WHERE id = ?1",
                rusqlite::params![id, description],
            )
            .context("update task description")?;
    }
    if let Some(status) = &patch.status {
        connection
            .execute(
                "UPDATE tasks SET status_id = ?2, status_name = ?3, status_kind = ?4, status_color = ?5 WHERE id = ?1",
                rusqlite::params![id, status.id, status.name, status.kind.as_str(), status.color],
            )
            .context("update task status")?;
    }
    if let Some(priority) = patch.priority {
        connection
            .execute(
                "UPDATE tasks SET priority = ?2 WHERE id = ?1",
                rusqlite::params![id, priority.as_i64()],
            )
            .context("update task priority")?;
    }
    connection
        .execute(
            "UPDATE tasks SET dirty = 1, updated_at = datetime('now') WHERE id = ?1",
            [id],
        )
        .context("mark task dirty")?;
    Ok(())
}

pub fn set_agent_feedback(id: &str, feedback: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE tasks SET agent_feedback = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id, feedback],
        )
        .context("set agent feedback")?;
    Ok(())
}

pub fn set_linked_workspace(id: &str, workspace_id: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE tasks SET linked_workspace_id = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id, workspace_id],
        )
        .context("set linked workspace")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::provider::{TaskStatus, TaskStatusKind};

    fn sample_task() -> ProviderTask {
        ProviderTask {
            provider: "linear".into(),
            external_id: "ext-1".into(),
            identifier: "ENG-1".into(),
            title: "Original title".into(),
            description: Some("body".into()),
            status: TaskStatus {
                id: "s1".into(),
                name: "Todo".into(),
                kind: TaskStatusKind::Unstarted,
                color: Some("#ccc".into()),
            },
            priority: TaskPriority::Medium,
            assignee: None,
            labels: vec![TaskLabel {
                id: "l1".into(),
                name: "bug".into(),
                color: Some("#f00".into()),
            }],
            project: Some(TaskProject {
                id: "proj-1".into(),
                name: "Q3 Roadmap".into(),
                icon: Some("🚀".into()),
                color: Some("#5e6ad2".into()),
            }),
            url: "https://linear.app/x".into(),
            team_id: Some("team-1".into()),
            remote_updated_at: Some("2026-06-21T00:00:00Z".into()),
        }
    }

    #[test]
    fn upsert_preserves_local_fields_across_resync() {
        let _env = crate::testkit::TestEnv::new("tasks-upsert");
        let id = upsert_task(&sample_task(), "2026-06-21T00:00:00Z").unwrap();

        set_agent_feedback(&id, "looks good").unwrap();
        set_linked_workspace(&id, "ws-1").unwrap();

        // Re-sync with a changed remote title.
        let mut updated = sample_task();
        updated.title = "Renamed remotely".into();
        upsert_task(&updated, "2026-06-21T01:00:00Z").unwrap();

        let view = load_task(&id).unwrap().unwrap();
        assert_eq!(view.title, "Renamed remotely");
        assert_eq!(view.agent_feedback.as_deref(), Some("looks good"));
        assert_eq!(view.linked_workspace_id.as_deref(), Some("ws-1"));
        assert!(!view.dirty, "re-sync clears dirty");
        assert_eq!(view.labels.len(), 1);
        assert_eq!(view.priority, TaskPriority::Medium);
        let project = view.project.expect("project survives re-sync");
        assert_eq!(project.icon.as_deref(), Some("🚀"));
        assert_eq!(project.color.as_deref(), Some("#5e6ad2"));
    }

    #[test]
    fn local_edit_marks_dirty() {
        let _env = crate::testkit::TestEnv::new("tasks-edit");
        let id = upsert_task(&sample_task(), "2026-06-21T00:00:00Z").unwrap();

        update_task_local(
            &id,
            &TaskLocalPatch {
                title: Some("Locally edited".into()),
                priority: Some(TaskPriority::Urgent),
                ..Default::default()
            },
        )
        .unwrap();

        let view = load_task(&id).unwrap().unwrap();
        assert_eq!(view.title, "Locally edited");
        assert_eq!(view.priority, TaskPriority::Urgent);
        assert!(view.dirty);
    }

    #[test]
    fn list_filters_by_provider_and_team() {
        let _env = crate::testkit::TestEnv::new("tasks-list");
        upsert_task(&sample_task(), "2026-06-21T00:00:00Z").unwrap();

        assert_eq!(list_tasks("linear", Some("team-1")).unwrap().len(), 1);
        assert_eq!(list_tasks("linear", Some("team-2")).unwrap().len(), 0);
        assert_eq!(list_tasks("linear", None).unwrap().len(), 1);
        assert_eq!(list_tasks("github", None).unwrap().len(), 0);
    }
}
