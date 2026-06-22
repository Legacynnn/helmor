//! Thin blocking GraphQL client for Linear's API.
//!
//! Runs on a `spawn_blocking` worker (all integration commands do), so the
//! blocking reqwest client is the natural fit. Linear personal API keys go in
//! the `Authorization` header raw — no `Bearer` prefix.

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";

pub struct LinearClient {
    api_key: String,
    http: reqwest::blocking::Client,
}

impl LinearClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        let http = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Failed to build Linear HTTP client")?;
        Ok(Self {
            api_key: api_key.into(),
            http,
        })
    }

    /// Run a GraphQL query/mutation and deserialize the `data` field into `T`.
    pub fn query<T: DeserializeOwned>(&self, query: &str, variables: Value) -> Result<T> {
        let response = self
            .http
            .post(LINEAR_GRAPHQL_URL)
            .header("Authorization", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .context("Linear request failed")?;

        let status = response.status();
        let text = response
            .text()
            .context("Failed to read Linear response body")?;

        if status.as_u16() == 401 {
            bail!("Linear rejected the API key (401 Unauthorized). Reconnect in Settings → Integrations.");
        }
        if status.as_u16() == 429 {
            bail!("Linear rate limit hit (429). Try again in a moment.");
        }

        let body: Value = serde_json::from_str(&text).with_context(|| {
            format!("Linear returned a non-JSON response (HTTP {status}): {text}")
        })?;

        if let Some(errors) = body.get("errors").filter(|e| !e.is_null()) {
            bail!("Linear GraphQL error: {errors}");
        }
        if !status.is_success() {
            bail!("Linear API error (HTTP {status})");
        }

        let data = body
            .get("data")
            .cloned()
            .context("Linear response missing `data`")?;
        serde_json::from_value(data).context("Failed to deserialize Linear response data")
    }
}
