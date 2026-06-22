//! GraphQL documents for the GitHub Issues provider.

/// Issue node fragment reused across list/detail/mutation responses.
pub const ISSUE_FIELDS: &str = r#"
  id number title body url state stateReason updatedAt
  repository { nameWithOwner }
  assignees(first: 10) { nodes { id name login avatarUrl } }
  labels(first: 50) { nodes { id name color } }
"#;

/// Viewer repositories the user can act on (affiliations cover owned + member).
pub const VIEWER_REPOSITORIES: &str = r#"
query ViewerRepos($after: String) {
  viewer {
    login
    repositories(first: 100, after: $after, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { id name nameWithOwner }
    }
  }
}
"#;

/// All issues for a repository, newest-updated first, paginated.
pub fn repo_issues(issue_fields: &str) -> String {
    format!(
        r#"
query RepoIssues($owner: String!, $name: String!, $after: String) {{
  repository(owner: $owner, name: $name) {{
    id
    issues(first: 50, after: $after, orderBy: {{ field: UPDATED_AT, direction: DESC }}) {{
      pageInfo {{ hasNextPage endCursor }}
      nodes {{ {issue_fields} }}
    }}
  }}
}}
"#
    )
}

/// Repository node id (powers `create_issue`'s repository lookup).
pub const REPO_ID: &str = r#"
query RepoId($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id }
}
"#;

/// One page of a repo's labels (paginated via `$after`).
pub const REPO_LABELS: &str = r#"
query RepoLabels($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    labels(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name color }
    }
  }
}
"#;

/// One page of a repo's assignable users (paginated via `$after`).
pub const REPO_ASSIGNEES: &str = r#"
query RepoAssignees($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    assignableUsers(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name login avatarUrl }
    }
  }
}
"#;

pub const UPDATE_ISSUE: &str = r#"
mutation($id: ID!, $title: String, $body: String) {
  updateIssue(input: { id: $id, title: $title, body: $body }) { issue { id } }
}
"#;

pub const CLOSE_ISSUE: &str = r#"
mutation($id: ID!, $reason: IssueClosedStateReason!) {
  closeIssue(input: { issueId: $id, stateReason: $reason }) { issue { id } }
}
"#;

pub const REOPEN_ISSUE: &str = r#"
mutation($id: ID!) {
  reopenIssue(input: { issueId: $id }) { issue { id } }
}
"#;

pub fn single_issue(issue_fields: &str) -> String {
    format!(
        r#"
query SingleIssue($id: ID!) {{
  node(id: $id) {{ ... on Issue {{ {issue_fields} }} }}
}}
"#
    )
}
