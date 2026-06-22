//! Canonical GitHub *issue* inbox search execution: run the search GraphQL via
//! the integrations GithubClient and map nodes to InboxItems. The forge inbox
//! builds the query string + cursor and calls this, so GitHub issue listing has
//! one execution path (the integrations client). Issue DETAIL stays in forge.

use anyhow::{bail, Context, Result};
use serde::Deserialize;

use super::client::GithubClient;
use crate::forge::github::inbox::{
    issue_state, pick_sort_timestamp, with_search_first, ISSUE_PR_SEARCH_QUERY,
};
use crate::forge::inbox::{InboxItem, InboxSortFilter, InboxSource};

pub struct IssueSearchPage {
    pub items: Vec<InboxItem>,
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

// We reuse forge's `ISSUE_PR_SEARCH_QUERY` (selecting both Issue and
// PullRequest fields) run through `with_search_first(query, limit)`. `Node`
// only models the `Issue` arm and tolerates everything else via `Other`, so —
// like forge's `issue_or_pr_to_item(.., expect_pr=false)` — PR nodes are
// dropped. This keeps fields + `first: N` byte-identical to forge.

#[derive(Deserialize)]
struct Envelope {
    data: Option<Data>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: String,
}

#[derive(Deserialize)]
struct Data {
    search: Payload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    page_info: PageInfo,
    nodes: Vec<Node>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum Node {
    Issue {
        id: String,
        number: i64,
        title: String,
        url: String,
        state: String,
        #[serde(rename = "stateReason")]
        state_reason: Option<String>,
        #[serde(rename = "createdAt")]
        created_at: String,
        #[serde(rename = "updatedAt")]
        updated_at: String,
        repository: Repo,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Repo {
    name_with_owner: String,
}

/// Run a prebuilt issue search (full query string + sort already assembled by
/// the caller) for one page; returns mapped InboxItems.
///
/// `sort` matches the caller's `InboxSortFilter` so `last_activity_at` picks the
/// same field forge picks. `limit` feeds the GraphQL `first: N` slot exactly as
/// forge does, so pagination is identical.
pub fn search_issues(
    login: &str,
    query: &str,
    cursor: Option<&str>,
    sort: Option<InboxSortFilter>,
    limit: usize,
) -> Result<IssueSearchPage> {
    let client = GithubClient::new(login);
    let cursor_owned = cursor.unwrap_or_default().to_string();
    let mut vars: Vec<(&str, &str)> = vec![("q", query)];
    if !cursor_owned.is_empty() {
        vars.push(("cursor", cursor_owned.as_str()));
    }
    let document = with_search_first(ISSUE_PR_SEARCH_QUERY, limit);
    let env: Envelope = client.query(&document, &vars)?;
    if let Some(errors) = env.errors {
        if !errors.is_empty() {
            bail!(
                "GitHub search errors: {}",
                errors
                    .iter()
                    .map(|e| e.message.as_str())
                    .collect::<Vec<_>>()
                    .join("; ")
            );
        }
    }
    let payload = env
        .data
        .context("GitHub issue search returned no data")?
        .search;
    let items = payload
        .nodes
        .into_iter()
        .filter_map(|node| node_to_item(node, sort))
        .collect();
    Ok(IssueSearchPage {
        items,
        has_next_page: payload.page_info.has_next_page,
        end_cursor: payload.page_info.end_cursor,
    })
}

fn node_to_item(node: Node, sort: Option<InboxSortFilter>) -> Option<InboxItem> {
    let Node::Issue {
        id,
        number,
        title,
        url,
        state,
        state_reason,
        created_at,
        updated_at,
        repository,
    } = node
    else {
        return None;
    };
    Some(InboxItem {
        id: format!("github_issue:{id}"),
        source: InboxSource::GithubIssue,
        external_id: format!("{}#{}", repository.name_with_owner, number),
        external_url: url,
        title,
        subtitle: Some(repository.name_with_owner.clone()),
        state: Some(issue_state(&state, state_reason.as_deref())),
        last_activity_at: pick_sort_timestamp(sort, &created_at, &updated_at)?,
    })
}
