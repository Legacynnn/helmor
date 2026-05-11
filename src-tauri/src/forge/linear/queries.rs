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
}
