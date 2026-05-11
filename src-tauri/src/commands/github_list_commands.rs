use super::common::{run_blocking, CmdResult};
use crate::forge::github::lists::{list_repo_issues, list_repo_prs, GhIssue, GhPr};
use crate::models::repos;

fn extract_owner_repo(remote_url: &str) -> Option<String> {
    // Accepts:
    //   git@github.com:owner/repo.git
    //   https://github.com/owner/repo(.git)
    //   ssh://git@github.com/owner/repo.git
    let trimmed = remote_url.trim_end_matches(".git");
    let after_host = trimmed
        .strip_prefix("git@github.com:")
        .or_else(|| trimmed.strip_prefix("https://github.com/"))
        .or_else(|| trimmed.strip_prefix("ssh://git@github.com/"))?;
    let mut parts = after_host.splitn(3, '/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("{owner}/{repo}"))
}

fn resolve_github_repo(repo_id: &str) -> anyhow::Result<(String, String)> {
    let repos = repos::list_repositories()?;
    let repo = repos
        .into_iter()
        .find(|r| r.id == repo_id)
        .ok_or_else(|| anyhow::anyhow!("Repository not found: {repo_id}"))?;
    let login = repo
        .forge_login
        .ok_or_else(|| anyhow::anyhow!("Repository has no GitHub account bound"))?;
    let remote = repo
        .remote_url
        .ok_or_else(|| anyhow::anyhow!("Repository has no remote URL"))?;
    let slug = extract_owner_repo(&remote)
        .ok_or_else(|| anyhow::anyhow!("Could not parse owner/repo from `{remote}`"))?;
    Ok((login, slug))
}

#[tauri::command]
pub async fn github_list_repo_prs(repo_id: String) -> CmdResult<Vec<GhPr>> {
    run_blocking(move || {
        let (login, slug) = resolve_github_repo(&repo_id)?;
        list_repo_prs(&login, &slug)
    })
    .await
}

#[tauri::command]
pub async fn github_list_repo_issues(repo_id: String) -> CmdResult<Vec<GhIssue>> {
    run_blocking(move || {
        let (login, slug) = resolve_github_repo(&repo_id)?;
        list_repo_issues(&login, &slug)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::extract_owner_repo;

    #[test]
    fn parses_git_at_remote() {
        assert_eq!(
            extract_owner_repo("git@github.com:owner/repo.git").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn parses_https_remote() {
        assert_eq!(
            extract_owner_repo("https://github.com/owner/repo.git").as_deref(),
            Some("owner/repo")
        );
        assert_eq!(
            extract_owner_repo("https://github.com/owner/repo").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn parses_ssh_remote() {
        assert_eq!(
            extract_owner_repo("ssh://git@github.com/owner/repo.git").as_deref(),
            Some("owner/repo")
        );
    }

    #[test]
    fn rejects_non_github_remote() {
        assert!(extract_owner_repo("https://gitlab.com/owner/repo.git").is_none());
    }
}
