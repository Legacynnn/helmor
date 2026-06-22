//! GraphQL operation strings for Linear.

/// Bootstrap probe used to validate an API key and populate the team selector.
pub const VIEWER_AND_TEAMS: &str = r#"
query ViewerAndTeams {
  viewer { id name }
  organization { name }
  teams(first: 250) {
    nodes { id key name }
  }
}
"#;

/// All workflow states for a team, in position order — so the board can show
/// every column, even ones with zero issues.
pub const TEAM_STATES: &str = r#"
query TeamStates($teamId: String!) {
  team(id: $teamId) {
    states {
      nodes { id name type color position }
    }
  }
}
"#;

/// All projects for a team — powers the project filter, including projects that
/// have no synced issues.
pub const TEAM_PROJECTS: &str = r#"
query TeamProjects($teamId: String!) {
  team(id: $teamId) {
    projects(first: 250) {
      nodes { id name icon color }
    }
  }
}
"#;

/// Active members of a team — powers the assignee picker.
pub const TEAM_MEMBERS: &str = r#"
query TeamMembers($teamId: String!) {
  team(id: $teamId) {
    members(first: 250, filter: { active: { eq: true } }) {
      nodes { id name avatarUrl }
    }
  }
}
"#;

/// All labels for a team — powers the tag editor in the task detail view.
pub const TEAM_LABELS: &str = r#"
query TeamLabels($teamId: String!) {
  team(id: $teamId) {
    labels(first: 250) {
      nodes { id name color }
    }
  }
}
"#;

/// Page of issues for a team, newest-updated first. `$after` is the cursor.
pub const TEAM_ISSUES: &str = r#"
query TeamIssues($teamId: ID!, $after: String) {
  issues(
    filter: { team: { id: { eq: $teamId } } }
    first: 100
    after: $after
    orderBy: updatedAt
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      title
      description
      priority
      url
      updatedAt
      team { id }
      project { id name icon color }
      state { id name type color }
      assignee { id name avatarUrl }
      labels { nodes { id name color } }
    }
  }
}
"#;

/// Single issue, for a fresh detail load.
pub const ISSUE_DETAIL: &str = r#"
query IssueDetail($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    priority
    url
    updatedAt
    team { id }
      project { id name icon color }
    state { id name type color }
    assignee { id name avatarUrl }
    labels { nodes { id name color } }
  }
}
"#;

/// Update mutable fields on an issue. All inputs optional.
pub const ISSUE_UPDATE: &str = r#"
mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      identifier
      title
      description
      priority
      url
      updatedAt
      team { id }
      project { id name icon color }
      state { id name type color }
      assignee { id name avatarUrl }
      labels { nodes { id name color } }
    }
  }
}
"#;

/// Create a new issue in a team.
pub const ISSUE_CREATE: &str = r#"
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      description
      priority
      url
      updatedAt
      team { id }
      project { id name icon color }
      state { id name type color }
      assignee { id name avatarUrl }
      labels { nodes { id name color } }
    }
  }
}
"#;
