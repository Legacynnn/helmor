//! Detail payloads returned by `forge::github::inbox::get_inbox_item_detail`.
//! Pulled into `forge::inbox` to participate in the cross-provider
//! `InboxItemDetail` enum.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIssueDetail {
    pub external_id: String,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub state_reason: Option<String>,
    pub author_login: Option<String>,
    pub author_avatar_url: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    /// GraphQL node ID. Needed by mutations (addAssigneesToAssignable etc.).
    /// `None` when this detail came from the REST path.
    pub node_id: Option<String>,
    #[serde(default)]
    pub assignees: Vec<GithubUserRef>,
    #[serde(default)]
    pub labels: Vec<GithubLabelRef>,
    pub issue_type: Option<GithubIssueType>,
    pub milestone: Option<GithubMilestone>,
    #[serde(default)]
    pub participants: Vec<GithubUserRef>,
    #[serde(default)]
    pub linked_pull_requests: Vec<GithubLinkedPullRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUserRef {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubLabelRef {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIssueType {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubMilestone {
    pub id: String,
    pub title: String,
    pub due_on: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubLinkedPullRequest {
    pub number: i64,
    pub title: String,
    pub state: String,
    pub is_draft: bool,
    pub url: String,
    pub repo_with_owner: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPullRequestDetail {
    pub external_id: String,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    pub merged: bool,
    pub draft: bool,
    pub author_login: Option<String>,
    pub base_ref_name: Option<String>,
    pub head_ref_name: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubDiscussionDetail {
    pub external_id: String,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub answered: Option<bool>,
    pub author_login: Option<String>,
    pub category_name: Option<String>,
    pub category_emoji: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}
