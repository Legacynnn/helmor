use serde::de::DeserializeOwned;
use serde_json::Value;

use super::types::LinearError;

pub const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

/// Send a GraphQL request and deserialize the `data` field into `T`.
///
/// `base_url` is parameterised so tests can point at a mock server. In
/// production, callers pass [`LINEAR_API_URL`].
pub async fn graphql<T: DeserializeOwned>(
    base_url: &str,
    api_key: &str,
    query: &str,
    variables: Value,
) -> Result<T, LinearError> {
    let client = reqwest::Client::new();
    let response = client
        .post(base_url)
        .header("Authorization", api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "query": query,
            "variables": variables,
        }))
        .send()
        .await?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| LinearError::Parse(format!("response not JSON: {e}")))?;

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(LinearError::Unauthorized);
    }

    if let Some(errors) = body.get("errors") {
        return Err(LinearError::GraphQl(errors.to_string()));
    }

    let data = body
        .get("data")
        .ok_or_else(|| LinearError::Parse("missing 'data' field".into()))?
        .clone();

    serde_json::from_value(data).map_err(|e| LinearError::Parse(format!("decode data: {e}")))
}
