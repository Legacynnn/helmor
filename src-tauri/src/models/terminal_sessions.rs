//! Persistence for terminal sessions — `sessions` rows with
//! `session_kind = 'terminal'` that wrap a PTY running an agent CLI.
//! These rows never get `session_messages`; only metadata persists.

use anyhow::{bail, Context, Result};
use rusqlite::OptionalExtension;

use super::db;
use super::sessions::CreateSessionResponse;

/// Status vocabulary for terminal sessions (stored in `sessions.status`):
/// `working` | `idle` | `attention` | `exited`.
pub const STATUS_WORKING: &str = "working";
pub const STATUS_IDLE: &str = "idle";
pub const STATUS_ATTENTION: &str = "attention";
pub const STATUS_EXITED: &str = "exited";

/// Create a terminal session row and mark it active on the workspace.
/// Mirrors `sessions::create_session` but skips chat-only columns
/// (model/effort/action_kind) — the agent CLI owns those decisions.
pub fn create_terminal_session(
    workspace_id: &str,
    agent_id: &str,
    title: &str,
) -> Result<CreateSessionResponse> {
    let mut connection = db::write_conn()?;
    let transaction = connection
        .transaction()
        .context("Failed to start create-terminal-session transaction")?;

    let workspace_exists: bool = transaction
        .query_row(
            "SELECT COUNT(*) FROM workspaces WHERE id = ?1",
            [workspace_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .with_context(|| format!("Failed to verify workspace {workspace_id}"))?;
    if !workspace_exists {
        bail!("Workspace {workspace_id} does not exist");
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    transaction
        .execute(
            r#"
            INSERT INTO sessions (id, workspace_id, status, title, agent_type, session_kind)
            VALUES (?1, ?2, ?3, ?4, ?5, 'terminal')
            "#,
            (&session_id, workspace_id, STATUS_IDLE, title, agent_id),
        )
        .context("Failed to create terminal session")?;

    transaction
        .execute(
            "UPDATE workspaces SET active_session_id = ?1 WHERE id = ?2",
            (&session_id, workspace_id),
        )
        .context("Failed to set active session")?;

    transaction
        .commit()
        .context("Failed to commit create-terminal-session")?;

    Ok(CreateSessionResponse { session_id })
}

/// Row facts needed to spawn / relaunch a terminal session.
pub struct TerminalSessionRow {
    pub workspace_id: String,
    pub agent_id: String,
    pub status: String,
    pub provider_session_id: Option<String>,
}

pub fn get_terminal_session(session_id: &str) -> Result<TerminalSessionRow> {
    let connection = db::read_conn()?;
    let row = connection
        .query_row(
            "SELECT workspace_id, agent_type, status, provider_session_id
             FROM sessions WHERE id = ?1 AND session_kind = 'terminal'",
            [session_id],
            |row| {
                Ok(TerminalSessionRow {
                    workspace_id: row.get(0)?,
                    agent_id: row.get(1)?,
                    status: row.get(2)?,
                    provider_session_id: row.get(3)?,
                })
            },
        )
        .optional()
        .with_context(|| format!("Failed to read terminal session {session_id}"))?;
    row.ok_or_else(|| anyhow::anyhow!("Terminal session {session_id} not found"))
}

/// Update status. Returns `Some(workspace_id)` when the value actually
/// changed (caller publishes a UI sync event), `None` on no-op or when the
/// row is missing / not a terminal session.
pub fn set_terminal_session_status(session_id: &str, status: &str) -> Result<Option<String>> {
    let connection = db::write_conn()?;
    let current: Option<(String, String)> = connection
        .query_row(
            "SELECT status, workspace_id FROM sessions
             WHERE id = ?1 AND session_kind = 'terminal'",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .with_context(|| format!("Failed to read status for terminal session {session_id}"))?;
    let Some((current_status, workspace_id)) = current else {
        return Ok(None);
    };
    if current_status == status {
        return Ok(None);
    }
    connection
        .execute(
            "UPDATE sessions SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            (status, session_id),
        )
        .context("Failed to update terminal session status")?;
    Ok(Some(workspace_id))
}

/// Store the agent's own session id (captured from a SessionStart hook) so a
/// relaunch can resume — e.g. `claude --resume <id>`.
pub fn set_terminal_provider_session_id(session_id: &str, provider_id: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE sessions SET provider_session_id = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND session_kind = 'terminal'",
            (provider_id, session_id),
        )
        .context("Failed to set terminal provider session id")?;
    Ok(())
}

/// Opaque JSON blob (exit code, launch info).
pub fn set_terminal_meta(session_id: &str, meta_json: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE sessions SET terminal_meta = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND session_kind = 'terminal'",
            (meta_json, session_id),
        )
        .context("Failed to set terminal meta")?;
    Ok(())
}

/// PTYs die with the app; on startup every non-exited terminal row is stale.
/// Returns the `(session_id, workspace_id)` pairs that were flipped.
pub fn mark_all_terminal_sessions_exited() -> Result<Vec<(String, String)>> {
    let connection = db::write_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT id, workspace_id FROM sessions
             WHERE session_kind = 'terminal' AND status != ?1",
        )
        .context("Failed to prepare stale terminal sessions query")?;
    let stale: Vec<(String, String)> = statement
        .query_map([STATUS_EXITED], |row| Ok((row.get(0)?, row.get(1)?)))
        .context("Failed to query stale terminal sessions")?
        .collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to read stale terminal sessions")?;
    drop(statement);
    if !stale.is_empty() {
        connection
            .execute(
                "UPDATE sessions SET status = ?1, updated_at = datetime('now')
                 WHERE session_kind = 'terminal' AND status != ?1",
                [STATUS_EXITED],
            )
            .context("Failed to mark terminal sessions exited")?;
    }
    Ok(stale)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::sessions::list_workspace_sessions;
    use crate::testkit::{insert_repo, insert_workspace, TestEnv, WorkspaceFixture};

    fn test_env(name: &str) -> TestEnv {
        let env = TestEnv::new(name);
        let conn = env.db_connection();
        insert_repo(&conn, "r1", "repo", None);
        insert_workspace(
            &conn,
            &WorkspaceFixture {
                id: "w1",
                repo_id: "r1",
                directory_name: "dir",
                state: "active",
                branch: None,
                intended_target_branch: None,
            },
        );
        env
    }

    #[test]
    fn create_lists_with_terminal_kind_and_activates() {
        let _env = test_env("terminal-sessions-create");
        let created = create_terminal_session("w1", "claude-code", "Claude Code").unwrap();
        let sessions = list_workspace_sessions("w1").unwrap();
        let row = sessions
            .iter()
            .find(|s| s.id == created.session_id)
            .unwrap();
        assert_eq!(row.session_kind, "terminal");
        assert_eq!(row.agent_type.as_deref(), Some("claude-code"));
        assert_eq!(row.status, STATUS_IDLE);
        assert!(row.active);
    }

    #[test]
    fn status_update_reports_change_once() {
        let _env = test_env("terminal-sessions-status");
        let created = create_terminal_session("w1", "pi", "pi").unwrap();
        let changed = set_terminal_session_status(&created.session_id, STATUS_WORKING).unwrap();
        assert_eq!(changed.as_deref(), Some("w1"));
        let unchanged = set_terminal_session_status(&created.session_id, STATUS_WORKING).unwrap();
        assert!(unchanged.is_none());
    }

    #[test]
    fn mark_all_exited_flips_stale_rows() {
        let _env = test_env("terminal-sessions-exited");
        let a = create_terminal_session("w1", "codex", "Codex").unwrap();
        set_terminal_session_status(&a.session_id, STATUS_WORKING).unwrap();
        let flipped = mark_all_terminal_sessions_exited().unwrap();
        assert!(flipped
            .iter()
            .any(|(id, ws)| id == &a.session_id && ws == "w1"));
        let again = mark_all_terminal_sessions_exited().unwrap();
        assert!(again.is_empty());
    }
}
