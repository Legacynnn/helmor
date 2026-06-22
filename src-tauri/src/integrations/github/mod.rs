//! GitHub Issues provider. Repos act as "teams"; issues normalize into the
//! shared `ProviderTask` model. Built on the bundled `gh` auth via `forge`.

pub mod auth;
pub mod client;
pub mod map;

pub use auth::default_login;

use anyhow::Result;

use crate::integrations::provider::{
    IssuePatch, NewIssue, OrgTeams, ProviderTask, TaskAssignee, TaskLabel, TaskProject,
    TaskProvider, TaskStatus,
};

pub struct GithubProvider {
    login: String,
}

impl GithubProvider {
    pub fn new(login: impl Into<String>) -> Self {
        Self {
            login: login.into(),
        }
    }
}

impl TaskProvider for GithubProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        let _ = &self.login;
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_states(&self, _team: &str) -> Result<Vec<TaskStatus>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_projects(&self, _team: &str) -> Result<Vec<TaskProject>> {
        Ok(Vec::new())
    }
    fn list_labels(&self, _team: &str) -> Result<Vec<TaskLabel>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_members(&self, _team: &str) -> Result<Vec<TaskAssignee>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn list_issues(&self, _team: &str) -> Result<Vec<ProviderTask>> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn update_issue(&self, _external_id: &str, _patch: &IssuePatch) -> Result<ProviderTask> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
    fn create_issue(
        &self,
        _team: &str,
        _title: &str,
        _fields: &NewIssue<'_>,
    ) -> Result<ProviderTask> {
        anyhow::bail!("GitHub Issues integration is not available yet")
    }
}
