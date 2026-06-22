//! `TaskProvider` implementation for `GithubProvider`: repo listing, label/member
//! enumeration, issue list, and issue create/update via GraphQL.

use anyhow::{bail, Context, Result};
use serde_json::Value;

use super::client::GithubClient;
use super::responses::ViewerReposEnvelope;
use super::{map, queries, GithubProvider};
use crate::integrations::provider::{
    IntegrationTeam, IssuePatch, NewIssue, OrgTeams, ProviderTask, TaskAssignee, TaskLabel,
    TaskProject, TaskProvider, TaskStatus,
};

fn split_repo(team: &str) -> Result<(&str, &str)> {
    team.split_once('/')
        .context("Repository must be in owner/name form")
}

impl TaskProvider for GithubProvider {
    fn org_and_teams(&self) -> Result<OrgTeams> {
        let client = GithubClient::new(&self.login);
        let mut teams = Vec::new();
        let mut after: Option<String> = None;
        let mut login: Option<String> = None;
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = Vec::new();
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let envelope: ViewerReposEnvelope =
                client.query(queries::VIEWER_REPOSITORIES, &vars)?;
            let data = envelope.data;
            if login.is_none() {
                login = Some(data.viewer.login.clone());
            }
            for node in &data.viewer.repositories.nodes {
                teams.push(IntegrationTeam {
                    id: node.name_with_owner.clone(),
                    key: node.name.clone(),
                    name: node.name_with_owner.clone(),
                });
            }
            if data.viewer.repositories.page_info.has_next_page {
                after = data.viewer.repositories.page_info.end_cursor.clone();
                if after.is_none() {
                    break;
                }
            } else {
                break;
            }
        }
        teams.sort_by_key(|t| t.name.to_lowercase());
        Ok(OrgTeams {
            org_name: login.unwrap_or_else(|| self.login.clone()),
            teams,
        })
    }

    fn list_states(&self, _team: &str) -> Result<Vec<TaskStatus>> {
        Ok(map::fixed_statuses())
    }

    fn list_projects(&self, _team: &str) -> Result<Vec<TaskProject>> {
        Ok(Vec::new())
    }

    /// Fetch all label pages for the repo (paginated; not capped at one page).
    fn list_labels(&self, team: &str) -> Result<Vec<TaskLabel>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let mut out: Vec<TaskLabel> = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("owner", owner), ("name", name)];
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let data: Value = client.query(queries::REPO_LABELS, &vars)?;
            let labels = &data["data"]["repository"]["labels"];
            if let Some(nodes) = labels["nodes"].as_array() {
                for l in nodes {
                    if let (Some(id), Some(name)) = (l["id"].as_str(), l["name"].as_str()) {
                        out.push(TaskLabel {
                            id: id.to_string(),
                            name: name.to_string(),
                            color: l["color"].as_str().map(|c| format!("#{c}")),
                        });
                    }
                }
            }
            if labels["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false) {
                after = labels["pageInfo"]["endCursor"]
                    .as_str()
                    .map(|s| s.to_string());
                if after.is_none() {
                    break;
                }
            } else {
                break;
            }
        }
        out.sort_by_key(|l| l.name.to_lowercase());
        Ok(out)
    }

    /// Fetch all assignable-user pages for the repo (paginated; not capped at one page).
    fn list_members(&self, team: &str) -> Result<Vec<TaskAssignee>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let mut out: Vec<TaskAssignee> = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("owner", owner), ("name", name)];
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let data: Value = client.query(queries::REPO_ASSIGNEES, &vars)?;
            let users = &data["data"]["repository"]["assignableUsers"];
            if let Some(nodes) = users["nodes"].as_array() {
                for u in nodes {
                    let Some(login) = u["login"].as_str().map(|s| s.to_string()) else {
                        continue;
                    };
                    let Some(id) = u["id"].as_str().map(|s| s.to_string()) else {
                        continue;
                    };
                    out.push(TaskAssignee {
                        id,
                        name: u["name"].as_str().map(|s| s.to_string()).unwrap_or(login),
                        avatar_url: u["avatarUrl"].as_str().map(|s| s.to_string()),
                    });
                }
            }
            if users["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false) {
                after = users["pageInfo"]["endCursor"]
                    .as_str()
                    .map(|s| s.to_string());
                if after.is_none() {
                    break;
                }
            } else {
                break;
            }
        }
        out.sort_by_key(|m| m.name.to_lowercase());
        Ok(out)
    }

    fn list_issues(&self, team: &str) -> Result<Vec<ProviderTask>> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        let query = queries::repo_issues(queries::ISSUE_FIELDS);
        let mut all = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let after_str = after.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("owner", owner), ("name", name)];
            if !after_str.is_empty() {
                vars.push(("after", after_str.as_str()));
            }
            let data: Value = client.query(&query, &vars)?;
            let issues = &data["data"]["repository"]["issues"];
            if let Some(nodes) = issues["nodes"].as_array() {
                for raw in nodes {
                    let node: map::IssueNode = serde_json::from_value(raw.clone())
                        .context("Failed to decode GitHub issue node")?;
                    all.push(map::map_issue(&node));
                }
            }
            if issues["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false) {
                after = issues["pageInfo"]["endCursor"]
                    .as_str()
                    .map(|s| s.to_string());
                if after.is_none() {
                    break;
                }
            } else {
                break;
            }
        }
        Ok(all)
    }

    fn update_issue(&self, external_id: &str, patch: &IssuePatch) -> Result<ProviderTask> {
        if patch.is_empty() {
            bail!("No fields to update");
        }
        let client = GithubClient::new(&self.login);

        // Title / body.
        if patch.title.is_some() || patch.description.is_some() {
            let title = patch.title.clone().unwrap_or_default();
            let body = patch.description.clone().unwrap_or_default();
            let mut vars: Vec<(&str, &str)> = vec![("id", external_id)];
            if patch.title.is_some() {
                vars.push(("title", title.as_str()));
            }
            if patch.description.is_some() {
                vars.push(("body", body.as_str()));
            }
            client.mutate(queries::UPDATE_ISSUE, &vars)?;
        }

        // Status -> open/close/reopen.
        if let Some(status_id) = &patch.status_id {
            match status_id.as_str() {
                map::STATUS_DONE => {
                    client.mutate(
                        queries::CLOSE_ISSUE,
                        &[("id", external_id), ("reason", "COMPLETED")],
                    )?;
                }
                map::STATUS_NOT_PLANNED => {
                    client.mutate(
                        queries::CLOSE_ISSUE,
                        &[("id", external_id), ("reason", "NOT_PLANNED")],
                    )?;
                }
                map::STATUS_OPEN => {
                    client.mutate(queries::REOPEN_ISSUE, &[("id", external_id)])?;
                }
                other => bail!("Unknown GitHub status id: {other}"),
            }
        }

        // Assignee (single; empty string = unassign). `assigneeIds` is a list
        // arg, so it must be inlined into the document (gh `-f` can't encode
        // lists). `assignee_id` is a GitHub node id, safe to inline.
        if let Some(assignee_id) = &patch.assignee_id {
            let ids = if assignee_id.is_empty() {
                "[]".to_string()
            } else {
                format!("[\"{assignee_id}\"]")
            };
            let mutation = format!(
                "mutation($id: ID!) {{ updateIssue(input: {{ id: $id, assigneeIds: {ids} }}) {{ issue {{ id }} }} }}"
            );
            client.mutate(&mutation, &[("id", external_id)])?;
        }

        // Labels (absolute set). GitHub has no single "replace"; remove existing
        // then add. Both list args are inlined for the same `-f` reason.
        if let Some(label_ids) = &patch.label_ids {
            let current = self.get_issue(external_id)?;
            if let Some(task) = &current {
                if !task.labels.is_empty() {
                    let existing: Vec<String> = task.labels.iter().map(|l| l.id.clone()).collect();
                    let existing_json = serde_json::to_string(&existing)?;
                    let remove = format!(
                        "mutation($id: ID!) {{ removeLabelsFromLabelable(input: {{ labelableId: $id, labelIds: {existing_json} }}) {{ clientMutationId }} }}"
                    );
                    client.mutate(&remove, &[("id", external_id)])?;
                }
            }
            if !label_ids.is_empty() {
                let json_ids = serde_json::to_string(label_ids)?;
                let add = format!(
                    "mutation($id: ID!) {{ addLabelsToLabelable(input: {{ labelableId: $id, labelIds: {json_ids} }}) {{ clientMutationId }} }}"
                );
                client.mutate(&add, &[("id", external_id)])?;
            }
        }

        self.get_issue(external_id)?
            .context("Issue vanished after update")
    }

    fn create_issue(&self, team: &str, title: &str, fields: &NewIssue<'_>) -> Result<ProviderTask> {
        let (owner, name) = split_repo(team)?;
        let client = GithubClient::new(&self.login);
        // Resolve the repository node id.
        let meta: Value = client.query(queries::REPO_ID, &[("owner", owner), ("name", name)])?;
        let repo_id = meta["data"]["repository"]["id"]
            .as_str()
            .context("Repository id missing")?
            .to_string();

        // Build a templated mutation so list args (assigneeIds/labelIds) inline
        // cleanly — `gh -f` can't encode list-typed variables.
        let assignees = match fields.assignee_id {
            Some(id) if !id.is_empty() => format!(", assigneeIds: [\"{id}\"]"),
            _ => String::new(),
        };
        let labels = match fields.label_ids {
            Some(ids) if !ids.is_empty() => format!(", labelIds: {}", serde_json::to_string(ids)?),
            _ => String::new(),
        };
        let body = fields.description.unwrap_or_default();
        let mutation = format!(
            "mutation($repositoryId: ID!, $title: String!, $body: String) {{ createIssue(input: {{ repositoryId: $repositoryId, title: $title, body: $body{assignees}{labels} }}) {{ issue {{ id }} }} }}"
        );
        let created = client.mutate(
            &mutation,
            &[
                ("repositoryId", repo_id.as_str()),
                ("title", title),
                ("body", body),
            ],
        )?;
        let id = created["data"]["createIssue"]["issue"]["id"]
            .as_str()
            .context("Created issue id missing")?
            .to_string();

        // New issues are created OPEN. If the caller dropped the issue into a
        // closed column, close it with the matching reason. An unknown
        // status_id is intentionally ignored here (no bail) — a create
        // shouldn't fail over a column hint; `update_issue` is the strict path.
        match fields.status_id {
            Some(map::STATUS_DONE) => {
                client.mutate(
                    queries::CLOSE_ISSUE,
                    &[("id", id.as_str()), ("reason", "COMPLETED")],
                )?;
            }
            Some(map::STATUS_NOT_PLANNED) => {
                client.mutate(
                    queries::CLOSE_ISSUE,
                    &[("id", id.as_str()), ("reason", "NOT_PLANNED")],
                )?;
            }
            // STATUS_OPEN, None, or any unknown id: leave open.
            _ => {}
        }

        self.get_issue(&id)?.context("Issue vanished after create")
    }
}

impl GithubProvider {
    fn get_issue(&self, external_id: &str) -> Result<Option<ProviderTask>> {
        let client = GithubClient::new(&self.login);
        let query = queries::single_issue(queries::ISSUE_FIELDS);
        // UNCACHED: `get_issue` is the post-mutation freshness path. The cached
        // `query` can return a pre-mutation snapshot for ~6s, making edits look
        // like they silently reverted.
        let data: Value = client.query_uncached(&query, &[("id", external_id)])?;
        let node_json = data["data"]["node"].clone();
        if node_json.is_null() {
            return Ok(None);
        }
        let node: map::IssueNode =
            serde_json::from_value(node_json).context("Failed to decode issue")?;
        Ok(Some(map::map_issue(&node)))
    }
}
