//! Spawning agent CLIs into PTY-backed terminal sessions. Reuses the
//! inspector terminal's `ScriptProcessManager` plumbing — the PTY key is
//! `(repo_id, "terminal:<session_id>", workspace_id)`, so the existing
//! `write_terminal_stdin` / `resize_terminal` / `stop_terminal` commands
//! work unchanged with `instanceId = sessionId`.

use anyhow::Result;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};

use crate::models::terminal_sessions::{
    self, TerminalSessionRow, STATUS_EXITED, STATUS_IDLE, STATUS_WORKING,
};
use crate::terminal_agents::registry::{HookStrategy, TerminalAgentSpec};
use crate::workspace::scripts::{ScriptContext, ScriptEvent, ScriptProcessManager};

use super::hook_artifacts;
use super::hook_server::HookEndpoint;
use super::status::{self, HeuristicTracker};

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// Build the command typed into the freshly-spawned login shell. `exec`
/// replaces the shell so PTY exit == agent exit, while the `-i -l` shell
/// has already resolved the user's PATH (nvm, homebrew, …).
fn build_launch_command(
    spec: &TerminalAgentSpec,
    session: &TerminalSessionRow,
    hook_artifact: Option<&std::path::Path>,
) -> String {
    let mut parts: Vec<String> = vec!["exec".into(), spec.binary_names[0].into()];
    match spec.hook_strategy {
        HookStrategy::ClaudeSettingsFlag => {
            if let Some(path) = hook_artifact {
                parts.push("--settings".into());
                parts.push(shell_quote(&path.display().to_string()));
            }
        }
        HookStrategy::PiExtension => {
            if let Some(path) = hook_artifact {
                parts.push("--extension".into());
                parts.push(shell_quote(&path.display().to_string()));
            }
        }
        HookStrategy::Heuristic => {}
    }
    parts.extend(spec.launch_args.iter().map(|arg| (*arg).to_string()));

    // Relaunching an exited session resumes where supported.
    if session.status == STATUS_EXITED && !spec.resume_args.is_empty() {
        if spec.resume_requires_provider_id {
            if let Some(provider_id) = session
                .provider_session_id
                .as_deref()
                .filter(|id| !id.is_empty())
            {
                parts.extend(spec.resume_args.iter().map(|arg| (*arg).to_string()));
                parts.push(shell_quote(provider_id));
            }
        } else {
            parts.extend(spec.resume_args.iter().map(|arg| (*arg).to_string()));
        }
    }
    parts.join(" ")
}

/// Wrap the frontend channel so the backend observes the event stream:
/// Stdout/Stderr feed the heuristic tracker (heuristic agents only), and
/// Exited flips the session status + persists the exit code. All events
/// are forwarded to the frontend untouched.
fn tee_channel<R: Runtime>(
    app: AppHandle<R>,
    frontend: Channel<ScriptEvent>,
    session_id: String,
    heuristic: bool,
) -> Channel<ScriptEvent> {
    Channel::new(move |body: tauri::ipc::InvokeResponseBody| {
        let tauri::ipc::InvokeResponseBody::Json(json) = body else {
            return Ok(());
        };
        let Ok(event) = serde_json::from_str::<ScriptEvent>(&json) else {
            return Ok(());
        };
        match &event {
            ScriptEvent::Stdout { .. } | ScriptEvent::Stderr { .. } if heuristic => {
                let tracker = app.state::<HeuristicTracker>();
                tracker.touch(&app, &session_id);
            }
            ScriptEvent::Exited { code } => {
                if heuristic {
                    app.state::<HeuristicTracker>().forget(&session_id);
                }
                status::mark_exited(&app, &session_id, *code);
            }
            _ => {}
        }
        let _ = frontend.send(event);
        Ok(())
    })
}

pub async fn spawn_for_session<R: Runtime>(
    app: AppHandle<R>,
    manager: ScriptProcessManager,
    session_id: String,
    channel: Channel<ScriptEvent>,
) -> Result<()> {
    let (session, spec, repo, working_dir, port_range) = tauri::async_runtime::spawn_blocking({
        let session_id = session_id.clone();
        move || -> Result<_> {
            let session = terminal_sessions::get_terminal_session(&session_id)?;
            let spec = crate::terminal_agents::agent_by_id(&session.agent_id)
                .ok_or_else(|| anyhow::anyhow!("Unknown terminal agent: {}", session.agent_id))?;
            let workspace =
                crate::models::workspaces::load_workspace_record_by_id(&session.workspace_id)?
                    .ok_or_else(|| {
                        anyhow::anyhow!("Workspace not found: {}", session.workspace_id)
                    })?;
            let repo = crate::repos::load_repository_by_id(&workspace.repo_id)?
                .ok_or_else(|| anyhow::anyhow!("Repository not found: {}", workspace.repo_id))?;
            let working_dir = crate::workspace::helpers::workspace_path(&workspace)
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| repo.root_path.clone());
            let port_range =
                crate::workspace::port_allocation::ensure_workspace_port_range(&workspace.id)
                    .unwrap_or(None);
            Ok((session, spec, repo, working_dir, port_range))
        }
    })
    .await
    .map_err(|e| anyhow::anyhow!("spawn_blocking join failed: {e}"))??;

    let workspace_id = session.workspace_id.clone();
    let key = (
        repo.id.clone(),
        format!("terminal:{session_id}"),
        Some(workspace_id.clone()),
    );
    // Idempotent: a live PTY under this key means a double-mount or
    // re-render raced us — keep the existing process.
    if manager.is_running(&key) {
        return Ok(());
    }

    // Hook plumbing (first-class agents only).
    let heuristic = spec.hook_strategy == HookStrategy::Heuristic;
    let mut extra_env: Vec<(String, String)> =
        vec![("HELMOR_TERMINAL_SESSION_ID".to_string(), session_id.clone())];
    let hook_artifact = if heuristic {
        None
    } else {
        let server = app.state::<super::hook_server::TerminalHookServer>();
        let HookEndpoint { port, token } = server.ensure_started(app.clone()).await?;
        extra_env.push(("HELMOR_HOOK_PORT".to_string(), port.to_string()));
        extra_env.push(("HELMOR_HOOK_TOKEN".to_string(), token));
        let artifact = match spec.hook_strategy {
            HookStrategy::ClaudeSettingsFlag => hook_artifacts::write_claude_settings(&session_id),
            HookStrategy::PiExtension => hook_artifacts::write_pi_extension(&session_id),
            HookStrategy::Heuristic => unreachable!(),
        };
        match artifact {
            Ok(path) => Some(path),
            Err(error) => {
                // Hook injection is best-effort: launch without live status
                // rather than failing the terminal entirely.
                tracing::warn!(%error, session_id, "Failed to write hook artifact; launching without hooks");
                None
            }
        }
    };

    let launch_command = build_launch_command(spec, &session, hook_artifact.as_deref());

    let context = ScriptContext {
        root_path: repo.root_path.clone(),
        workspace_path: Some(working_dir.clone()),
        workspace_name: None,
        default_branch: repo.default_branch.clone(),
        port_base: port_range.map(|r| r.base),
        port_count: port_range.map(|r| r.count),
        extra_env,
    };

    // Initial status: heuristic agents are visibly busy while booting; hook
    // agents confirm via SessionStart/session_start shortly after.
    status::set_status(
        &app,
        &session_id,
        if heuristic {
            STATUS_WORKING
        } else {
            STATUS_IDLE
        },
    );

    let tee = tee_channel(app.clone(), channel.clone(), session_id.clone(), heuristic);
    let repo_id = repo.id.clone();
    let script_type = format!("terminal:{session_id}");
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = crate::workspace::scripts::run_terminal_session(
            &manager,
            &repo_id,
            &script_type,
            Some(&workspace_id),
            &working_dir,
            &context,
            tee,
            Some(&format!("{launch_command}\n")),
        ) {
            let _ = channel.send(ScriptEvent::Error {
                message: e.to_string(),
            });
        }
    });

    Ok(())
}

/// Best-effort teardown when a terminal session is hidden or deleted:
/// kill the PTY and drop hook artifacts.
pub fn cleanup_session(
    manager: &ScriptProcessManager,
    repo_id: &str,
    workspace_id: &str,
    session_id: &str,
) {
    let key = (
        repo_id.to_string(),
        format!("terminal:{session_id}"),
        Some(workspace_id.to_string()),
    );
    manager.kill(&key);
    hook_artifacts::remove_artifacts(session_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal_agents::agent_by_id;

    fn row(status: &str, provider_id: Option<&str>) -> TerminalSessionRow {
        TerminalSessionRow {
            workspace_id: "w1".into(),
            agent_id: "claude-code".into(),
            status: status.into(),
            provider_session_id: provider_id.map(str::to_string),
        }
    }

    #[test]
    fn claude_launch_includes_settings_flag() {
        let spec = agent_by_id("claude-code").unwrap();
        let cmd = build_launch_command(
            spec,
            &row(STATUS_IDLE, None),
            Some(std::path::Path::new("/tmp/x/claude-settings.json")),
        );
        assert_eq!(cmd, "exec claude --settings '/tmp/x/claude-settings.json'");
    }

    #[test]
    fn claude_relaunch_resumes_with_provider_id() {
        let spec = agent_by_id("claude-code").unwrap();
        let cmd = build_launch_command(
            spec,
            &row(STATUS_EXITED, Some("abc-123")),
            Some(std::path::Path::new("/tmp/x/claude-settings.json")),
        );
        assert!(cmd.ends_with("--resume 'abc-123'"), "{cmd}");
    }

    #[test]
    fn claude_relaunch_without_provider_id_skips_resume() {
        let spec = agent_by_id("claude-code").unwrap();
        let cmd = build_launch_command(spec, &row(STATUS_EXITED, None), None);
        assert_eq!(cmd, "exec claude");
    }

    #[test]
    fn pi_launch_uses_extension_flag() {
        let spec = agent_by_id("pi").unwrap();
        let mut session = row(STATUS_IDLE, None);
        session.agent_id = "pi".into();
        let cmd = build_launch_command(
            spec,
            &session,
            Some(std::path::Path::new("/tmp/x/helmor-status.ts")),
        );
        assert_eq!(cmd, "exec pi --extension '/tmp/x/helmor-status.ts'");
    }

    #[test]
    fn heuristic_agent_launches_bare_and_resumes_without_id() {
        let spec = agent_by_id("codex").unwrap();
        let mut session = row(STATUS_EXITED, None);
        session.agent_id = "codex".into();
        let cmd = build_launch_command(spec, &session, None);
        assert_eq!(cmd, "exec codex resume --last");
    }
}
