//! Serde structs mirroring Linear GraphQL response shapes. Kept separate from
//! the normalized `provider` types; `map.rs` bridges the two.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ViewerAndTeams {
    pub organization: Organization,
    pub teams: TeamConnection,
}

#[derive(Debug, Deserialize)]
pub struct Organization {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamConnection {
    pub nodes: Vec<TeamNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamNode {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueConnection {
    pub page_info: PageInfo,
    pub nodes: Vec<IssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueNode {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(default)]
    pub priority: f64,
    pub url: String,
    pub updated_at: Option<String>,
    pub team: Option<TeamRef>,
    pub project: Option<ProjectRef>,
    pub state: Option<StateNode>,
    pub assignee: Option<AssigneeNode>,
    pub labels: Option<LabelConnection>,
}

#[derive(Debug, Deserialize)]
pub struct TeamRef {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectRef {
    pub id: String,
    pub name: String,
    /// Linear project icon: usually an emoji, sometimes a named glyph id.
    #[serde(default)]
    pub icon: Option<String>,
    /// Hex accent color, e.g. `#5e6ad2`.
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateNode {
    pub id: String,
    pub name: String,
    /// backlog | unstarted | started | completed | canceled | triage
    #[serde(rename = "type")]
    pub state_type: String,
    pub color: Option<String>,
    /// Only requested by the workflow-states query; absent on issue.state.
    #[serde(default)]
    pub position: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssigneeNode {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LabelConnection {
    pub nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize)]
pub struct LabelNode {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

// --- Wrapper structs matching each query's top-level `data` shape ---

#[derive(Debug, Deserialize)]
pub struct TeamMembersData {
    pub team: Option<TeamMembersNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamMembersNode {
    pub members: MemberConnection,
}

#[derive(Debug, Deserialize)]
pub struct MemberConnection {
    pub nodes: Vec<AssigneeNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamLabelsData {
    pub team: Option<TeamLabelsNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamLabelsNode {
    pub labels: LabelConnection,
}

#[derive(Debug, Deserialize)]
pub struct TeamProjectsData {
    pub team: Option<TeamProjectsNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamProjectsNode {
    pub projects: ProjectConnection,
}

#[derive(Debug, Deserialize)]
pub struct ProjectConnection {
    pub nodes: Vec<ProjectRef>,
}

#[derive(Debug, Deserialize)]
pub struct TeamStatesData {
    pub team: Option<TeamStatesNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamStatesNode {
    pub states: StateConnection,
}

#[derive(Debug, Deserialize)]
pub struct StateConnection {
    pub nodes: Vec<StateNode>,
}

#[derive(Debug, Deserialize)]
pub struct TeamIssuesData {
    pub issues: IssueConnection,
}

#[derive(Debug, Deserialize)]
pub struct IssueDetailData {
    pub issue: Option<IssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueUpdateData {
    pub issue_update: IssueMutationPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueCreateData {
    pub issue_create: IssueMutationPayload,
}

#[derive(Debug, Deserialize)]
pub struct IssueMutationPayload {
    pub success: bool,
    pub issue: Option<IssueNode>,
}
