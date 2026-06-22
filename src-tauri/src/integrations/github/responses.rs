//! GraphQL response deserialize structs for the GitHub provider ops.
//!
//! `gh api graphql` returns the full `{ "data": {...} }` envelope; the typed
//! `run_graphql`/`client.query` path does NOT unwrap `data` (unlike the Linear
//! client), so response structs and `Value` indexing both go through `data`.

use serde::Deserialize;

use super::map;

#[derive(Deserialize)]
pub(super) struct ViewerReposEnvelope {
    pub(super) data: ViewerReposData,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ViewerReposData {
    pub(super) viewer: ViewerRepos,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ViewerRepos {
    pub(super) login: String,
    pub(super) repositories: map::NodeListPaged<RepoNode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RepoNode {
    pub(super) name: String,
    pub(super) name_with_owner: String,
}
