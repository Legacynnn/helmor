//! Thin GitHub GraphQL client for the integrations layer. Delegates transport
//! + auth to `forge::github` (bundled `gh`), so there's one GitHub auth path.

use anyhow::{bail, Result};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::forge::github::{run_graphql, run_graphql_raw, GraphqlOutcome};

pub struct GithubClient {
    login: String,
}

impl GithubClient {
    pub fn new(login: impl Into<String>) -> Self {
        Self {
            login: login.into(),
        }
    }

    /// Run a typed query. Variables are string pairs (gh `-f key=value`).
    pub fn query<T: DeserializeOwned>(&self, query: &str, variables: &[(&str, &str)]) -> Result<T> {
        match run_graphql::<T>(&self.login, query, variables)? {
            GraphqlOutcome::Auth => {
                bail!("GitHub rejected the request — re-authenticate `gh` and try again")
            }
            GraphqlOutcome::Ok(value) => Ok(value),
        }
    }

    /// Run a mutation, returning raw JSON and surfacing GraphQL `errors`.
    pub fn mutate(&self, mutation: &str, variables: &[(&str, &str)]) -> Result<Value> {
        let value = match run_graphql_raw(&self.login, mutation, variables)? {
            GraphqlOutcome::Auth => {
                bail!("GitHub rejected the request — re-authenticate `gh` and try again")
            }
            GraphqlOutcome::Ok(value) => value,
        };
        if let Some(errors) = value.get("errors").and_then(|v| v.as_array()) {
            if !errors.is_empty() {
                let msgs: Vec<&str> = errors
                    .iter()
                    .filter_map(|e| e.get("message").and_then(|m| m.as_str()))
                    .collect();
                bail!("GitHub GraphQL error: {}", msgs.join("; "));
            }
        }
        Ok(value)
    }
}
