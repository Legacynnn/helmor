//! Linear provider: high-level operations the commands call. Each constructs a
//! short-lived blocking client (commands already run on `spawn_blocking`).

pub mod client;
pub mod map;
pub mod queries;
pub mod types;

use anyhow::{bail, Context, Result};
use serde_json::{json, Map, Value};

pub use crate::integrations::provider::{IssuePatch, NewIssue, OrgTeams};
use crate::integrations::provider::{
    ProviderTask, TaskAssignee, TaskLabel, TaskProject, TaskProvider, TaskStatus,
};
use client::LinearClient;

/// Validate the key and load org name + teams for the selector.
pub fn fetch_org_and_teams(api_key: &str) -> Result<OrgTeams> {
    let client = LinearClient::new(api_key)?;
    let data: types::ViewerAndTeams = client.query(queries::VIEWER_AND_TEAMS, json!({}))?;
    Ok(OrgTeams {
        org_name: data.organization.name,
        teams: data.teams.nodes.iter().map(map::map_team).collect(),
    })
}

/// All workflow states for a team, ordered active-first then by Linear's own
/// position — so the board can render every column, even empty ones.
pub fn list_team_states(api_key: &str, team_id: &str) -> Result<Vec<TaskStatus>> {
    let client = LinearClient::new(api_key)?;
    let data: types::TeamStatesData =
        client.query(queries::TEAM_STATES, json!({ "teamId": team_id }))?;
    let mut states: Vec<(f64, TaskStatus)> = data
        .team
        .map(|t| t.states.nodes)
        .unwrap_or_default()
        .iter()
        .map(|node| (node.position, map::map_state(node)))
        .collect();
    states.sort_by(|a, b| {
        a.1.kind
            .sort_rank()
            .cmp(&b.1.kind.sort_rank())
            .then(a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
    });
    Ok(states.into_iter().map(|(_, status)| status).collect())
}

/// All projects for a team, sorted by name — for the project filter.
pub fn list_team_projects(api_key: &str, team_id: &str) -> Result<Vec<TaskProject>> {
    let client = LinearClient::new(api_key)?;
    let data: types::TeamProjectsData =
        client.query(queries::TEAM_PROJECTS, json!({ "teamId": team_id }))?;
    let mut projects: Vec<TaskProject> = data
        .team
        .map(|t| t.projects.nodes)
        .unwrap_or_default()
        .into_iter()
        .map(|node| TaskProject {
            id: node.id,
            name: node.name,
            icon: node.icon,
            color: node.color,
        })
        .collect();
    projects.sort_by_key(|p| p.name.to_lowercase());
    Ok(projects)
}

/// All labels for a team, sorted by name — for the task detail tag editor.
pub fn list_team_labels(api_key: &str, team_id: &str) -> Result<Vec<TaskLabel>> {
    let client = LinearClient::new(api_key)?;
    let data: types::TeamLabelsData =
        client.query(queries::TEAM_LABELS, json!({ "teamId": team_id }))?;
    let mut labels: Vec<TaskLabel> = data
        .team
        .map(|t| t.labels.nodes)
        .unwrap_or_default()
        .into_iter()
        .map(|node| TaskLabel {
            id: node.id,
            name: node.name,
            color: node.color,
        })
        .collect();
    labels.sort_by_key(|l| l.name.to_lowercase());
    Ok(labels)
}

/// Active members of a team, sorted by name — for the assignee picker.
pub fn list_team_members(api_key: &str, team_id: &str) -> Result<Vec<TaskAssignee>> {
    let client = LinearClient::new(api_key)?;
    let data: types::TeamMembersData =
        client.query(queries::TEAM_MEMBERS, json!({ "teamId": team_id }))?;
    let mut members: Vec<TaskAssignee> = data
        .team
        .map(|t| t.members.nodes)
        .unwrap_or_default()
        .into_iter()
        .map(|node| TaskAssignee {
            id: node.id,
            name: node.name,
            avatar_url: node.avatar_url,
        })
        .collect();
    members.sort_by_key(|m| m.name.to_lowercase());
    Ok(members)
}

/// Pull every issue for a team (paginated), newest-updated first.
pub fn list_team_issues(api_key: &str, team_id: &str) -> Result<Vec<ProviderTask>> {
    let client = LinearClient::new(api_key)?;
    let mut all = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let data: types::TeamIssuesData = client.query(
            queries::TEAM_ISSUES,
            json!({ "teamId": team_id, "after": after }),
        )?;
        for node in &data.issues.nodes {
            all.push(map::map_issue(node));
        }
        if data.issues.page_info.has_next_page {
            after = data.issues.page_info.end_cursor.clone();
            if after.is_none() {
                break;
            }
        } else {
            break;
        }
    }
    Ok(all)
}

/// Fresh single-issue load.
pub fn get_issue(api_key: &str, external_id: &str) -> Result<Option<ProviderTask>> {
    let client = LinearClient::new(api_key)?;
    let data: types::IssueDetailData =
        client.query(queries::ISSUE_DETAIL, json!({ "id": external_id }))?;
    Ok(data.issue.as_ref().map(map::map_issue))
}

/// Push field changes to Linear, returning the updated issue.
pub fn update_issue(api_key: &str, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask> {
    if patch.is_empty() {
        bail!("No fields to update");
    }
    let client = LinearClient::new(api_key)?;
    let data: types::IssueUpdateData = client.query(
        queries::ISSUE_UPDATE,
        json!({ "id": external_id, "input": patch.to_linear_input() }),
    )?;
    if !data.issue_update.success {
        bail!("Linear rejected the issue update");
    }
    let issue = data
        .issue_update
        .issue
        .context("Linear update returned no issue")?;
    Ok(map::map_issue(&issue))
}

/// Create a new issue in a team.
pub fn create_issue(
    api_key: &str,
    team_id: &str,
    title: &str,
    fields: &NewIssue<'_>,
) -> Result<ProviderTask> {
    let client = LinearClient::new(api_key)?;
    let mut input = Map::new();
    input.insert("teamId".into(), json!(team_id));
    input.insert("title".into(), json!(title));
    if let Some(description) = fields.description {
        input.insert("description".into(), json!(description));
    }
    if let Some(priority) = fields.priority {
        input.insert("priority".into(), json!(priority));
    }
    if let Some(status_id) = fields.status_id {
        input.insert("stateId".into(), json!(status_id));
    }
    if let Some(assignee_id) = fields.assignee_id {
        input.insert("assigneeId".into(), json!(assignee_id));
    }
    if let Some(project_id) = fields.project_id {
        input.insert("projectId".into(), json!(project_id));
    }
    if let Some(label_ids) = fields.label_ids {
        input.insert("labelIds".into(), json!(label_ids));
    }
    let data: types::IssueCreateData = client.query(
        queries::ISSUE_CREATE,
        json!({ "input": Value::Object(input) }),
    )?;
    if !data.issue_create.success {
        bail!("Linear rejected the issue creation");
    }
    let issue = data
        .issue_create
        .issue
        .context("Linear create returned no issue")?;
    Ok(map::map_issue(&issue))
}

/// `TaskProvider` impl backed by a Linear personal API key.
pub struct LinearProvider {
    api_key: String,
}

impl LinearProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
        }
    }
}

impl TaskProvider for LinearProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        fetch_org_and_teams(&self.api_key)
    }
    fn list_states(&self, team: &str) -> Result<Vec<TaskStatus>> {
        list_team_states(&self.api_key, team)
    }
    fn list_projects(&self, team: &str) -> Result<Vec<TaskProject>> {
        list_team_projects(&self.api_key, team)
    }
    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>> {
        list_team_labels(&self.api_key, team)
    }
    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>> {
        list_team_members(&self.api_key, team)
    }
    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>> {
        list_team_issues(&self.api_key, team)
    }
    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask> {
        update_issue(&self.api_key, external_id, patch)
    }
    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask> {
        create_issue(&self.api_key, team, title, fields)
    }
}
