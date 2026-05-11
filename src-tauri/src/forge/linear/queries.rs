use serde::Deserialize;
use serde_json::{json, Value};

use super::client::{graphql, LINEAR_API_URL};
use super::types::{LinearError, LinearTeam, LinearViewer};

pub const VIEWER_QUERY: &str = r#"query Viewer { viewer { id name email } }"#;

pub const TEAMS_QUERY: &str = r#"
query Teams { teams(first: 100) { nodes { id key name } } }
"#;

#[derive(Debug, Deserialize)]
struct ViewerEnvelope {
    viewer: LinearViewer,
}

#[derive(Debug, Deserialize)]
struct TeamsEnvelope {
    teams: TeamsConnection,
}

#[derive(Debug, Deserialize)]
struct TeamsConnection {
    nodes: Vec<LinearTeam>,
}

pub fn parse_viewer(data: Value) -> Result<LinearViewer, LinearError> {
    serde_json::from_value::<ViewerEnvelope>(data)
        .map(|e| e.viewer)
        .map_err(|e| LinearError::Parse(format!("viewer: {e}")))
}

pub fn parse_teams(data: Value) -> Result<Vec<LinearTeam>, LinearError> {
    serde_json::from_value::<TeamsEnvelope>(data)
        .map(|e| e.teams.nodes)
        .map_err(|e| LinearError::Parse(format!("teams: {e}")))
}

pub async fn fetch_viewer(api_key: &str) -> Result<LinearViewer, LinearError> {
    let data: Value = graphql(LINEAR_API_URL, api_key, VIEWER_QUERY, json!({})).await?;
    parse_viewer(data)
}

pub async fn fetch_teams(api_key: &str) -> Result<Vec<LinearTeam>, LinearError> {
    let data: Value = graphql(LINEAR_API_URL, api_key, TEAMS_QUERY, json!({})).await?;
    parse_teams(data)
}

pub const TASKS_QUERY: &str = r#"
query Tasks($teamId: ID!) {
  issues(
    filter: { team: { id: { eq: $teamId } }, state: { type: { nin: ["completed", "canceled"] } } }
    orderBy: updatedAt
    first: 50
  ) {
    nodes {
      id
      identifier
      title
      url
      priority
      updatedAt
      state { id name type color }
      assignee { id name avatarUrl }
      labels { nodes { id name color } }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct TasksEnvelope {
    issues: TasksConnection,
}

#[derive(Debug, Deserialize)]
struct TasksConnection {
    nodes: Vec<super::types::LinearIssue>,
}

pub fn parse_tasks(data: Value) -> Result<Vec<super::types::LinearIssue>, LinearError> {
    serde_json::from_value::<TasksEnvelope>(data)
        .map(|e| e.issues.nodes)
        .map_err(|e| LinearError::Parse(format!("tasks: {e}")))
}

pub async fn fetch_tasks(
    api_key: &str,
    team_id: &str,
) -> Result<Vec<super::types::LinearIssue>, LinearError> {
    let data: Value = graphql(
        LINEAR_API_URL,
        api_key,
        TASKS_QUERY,
        json!({ "teamId": team_id }),
    )
    .await?;
    parse_tasks(data)
}

pub const TASK_DETAIL_QUERY: &str = r#"
query Task($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    url
    priority
    updatedAt
    description
    state { id name type color }
    assignee { id name avatarUrl }
    labels { nodes { id name color } }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct TaskEnvelope {
    issue: Option<super::types::LinearIssueDetail>,
}

pub fn parse_task(data: Value) -> Result<super::types::LinearIssueDetail, LinearError> {
    let env: TaskEnvelope =
        serde_json::from_value(data).map_err(|e| LinearError::Parse(format!("task: {e}")))?;
    env.issue
        .ok_or_else(|| LinearError::Parse("issue not found".into()))
}

pub async fn fetch_task(
    api_key: &str,
    id: &str,
) -> Result<super::types::LinearIssueDetail, LinearError> {
    let data: Value = graphql(
        LINEAR_API_URL,
        api_key,
        TASK_DETAIL_QUERY,
        json!({ "id": id }),
    )
    .await?;
    parse_task(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_viewer_response() {
        let data = json!({
            "viewer": { "id": "u1", "name": "Dan", "email": "dan@example.com" }
        });
        let viewer = parse_viewer(data).expect("parse");
        assert_eq!(viewer.id, "u1");
        assert_eq!(viewer.name, "Dan");
        assert_eq!(viewer.email, "dan@example.com");
    }

    #[test]
    fn parses_teams_response() {
        let data = json!({
            "teams": {
                "nodes": [
                    { "id": "t1", "key": "SUPER", "name": "Superset" },
                    { "id": "t2", "key": "HELM",  "name": "Helmor"   }
                ]
            }
        });
        let teams = parse_teams(data).expect("parse");
        assert_eq!(teams.len(), 2);
        assert_eq!(teams[0].key, "SUPER");
        assert_eq!(teams[1].name, "Helmor");
    }

    #[test]
    fn viewer_parse_error_is_typed() {
        let data = json!({ "viewer": { "id": "u1" } }); // missing name/email
        let err = parse_viewer(data).expect_err("should fail");
        assert!(matches!(err, LinearError::Parse(_)));
    }

    #[test]
    fn parses_tasks_response() {
        let data = json!({
            "issues": {
                "nodes": [
                    {
                        "id": "i1",
                        "identifier": "SUPER-187",
                        "title": "Fix something",
                        "url": "https://linear.app/x/issue/SUPER-187",
                        "priority": 1,
                        "updatedAt": "2026-03-23T10:00:00Z",
                        "state": {
                            "id": "s1",
                            "name": "In Progress",
                            "type": "started",
                            "color": "#5e6ad2"
                        },
                        "assignee": {
                            "id": "u1",
                            "name": "Dan",
                            "avatarUrl": "https://example.com/dan.png"
                        },
                        "labels": {
                            "nodes": [
                                { "id": "l1", "name": "bug", "color": "#eb5757" }
                            ]
                        }
                    }
                ]
            }
        });
        let tasks = parse_tasks(data).expect("parse");
        assert_eq!(tasks.len(), 1);
        let task = &tasks[0];
        assert_eq!(task.identifier, "SUPER-187");
        assert_eq!(task.state.kind, "started");
        assert_eq!(task.assignee.as_ref().unwrap().name, "Dan");
        assert_eq!(task.labels.nodes.len(), 1);
        assert_eq!(task.labels.nodes[0].name, "bug");
    }

    #[test]
    fn tasks_query_uses_linear_id_scalar_for_team_filter() {
        assert!(
            TASKS_QUERY.contains("query Tasks($teamId: ID!)"),
            "Linear validates the team id filter as GraphQL ID, not String"
        );
    }

    #[test]
    fn parses_task_with_null_assignee_and_empty_labels() {
        let data = json!({
            "issues": {
                "nodes": [
                    {
                        "id": "i1",
                        "identifier": "SUPER-188",
                        "title": "Untriaged",
                        "url": "https://linear.app/x/issue/SUPER-188",
                        "priority": 0,
                        "updatedAt": "2026-03-23T10:00:00Z",
                        "state": {
                            "id": "s1",
                            "name": "Backlog",
                            "type": "backlog",
                            "color": "#bec2c8"
                        },
                        "assignee": null,
                        "labels": { "nodes": [] }
                    }
                ]
            }
        });
        let tasks = parse_tasks(data).expect("parse");
        assert_eq!(tasks.len(), 1);
        assert!(tasks[0].assignee.is_none());
        assert_eq!(tasks[0].labels.nodes.len(), 0);
    }

    #[test]
    fn parses_task_detail() {
        let data = json!({
            "issue": {
                "id": "i1",
                "identifier": "SUPER-187",
                "title": "Fix something",
                "url": "https://linear.app/x/issue/SUPER-187",
                "priority": 2,
                "updatedAt": "2026-03-23T10:00:00Z",
                "description": "## Steps\n- Repro\n- Fix",
                "state": { "id": "s1", "name": "In Progress", "type": "started", "color": "#5e6ad2" },
                "assignee": null,
                "labels": { "nodes": [] }
            }
        });
        let task = parse_task(data).expect("parse");
        assert_eq!(task.identifier, "SUPER-187");
        assert!(task.description.contains("Repro"));
    }

    #[test]
    fn parses_task_detail_missing_issue() {
        let data = json!({ "issue": null });
        let err = parse_task(data).expect_err("should fail");
        assert!(matches!(err, LinearError::Parse(_)));
    }
}
