//! IPC commands for third-party task integrations (Linear today).
//!
//! Connection lifecycle (connect / disconnect / status / team selection) plus
//! the task mirror CRUD (list / get / sync / update / create). The API key is
//! held in the macOS keychain; everything here runs on a `spawn_blocking`
//! worker via [`run_blocking`].

use anyhow::{bail, Context};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::integrations::provider::{IntegrationStatus, IntegrationTeam};
use crate::integrations::{self, credentials, linear};
use crate::models::db;
use crate::models::integration_connections::{self as conns, IntegrationConnectionRecord};
use crate::models::tasks::{self, TaskView};
use crate::ui_sync::{self, UiMutationEvent};
use crate::workspace_state::{WorkspaceBranchIntent, WorkspaceMode};
use crate::workspace_status::WorkspaceStatus;

use super::common::{run_blocking, CmdResult};

const LINEAR: &str = integrations::LINEAR_PROVIDER;

fn ensure_supported(provider: &str) -> anyhow::Result<()> {
    if provider != LINEAR {
        bail!("Unsupported integration provider: {provider}");
    }
    Ok(())
}

fn require_api_key(provider: &str) -> anyhow::Result<String> {
    credentials::load_api_key(provider)?.with_context(|| {
        format!("{provider} is not connected — add an API key in Settings → Integrations")
    })
}

/// Build the status snapshot. Pass `teams` when already fetched (connect path)
/// to avoid a second round-trip; otherwise fetch live when a key is present.
fn build_status(
    provider: &str,
    teams: Option<Vec<IntegrationTeam>>,
) -> anyhow::Result<IntegrationStatus> {
    let record = conns::load_connection(provider)?;
    let key = credentials::load_api_key(provider)?;
    let teams = match (key.as_ref(), teams) {
        (_, Some(t)) => t,
        (Some(k), None) => linear::fetch_org_and_teams(k)
            .map(|ot| ot.teams)
            .unwrap_or_default(),
        (None, None) => Vec::new(),
    };
    let connected = key.is_some() && record.as_ref().map(|r| r.connected).unwrap_or(false);
    Ok(IntegrationStatus {
        provider: provider.to_string(),
        connected,
        org_name: record.as_ref().and_then(|r| r.org_name.clone()),
        selected_team_id: record.as_ref().and_then(|r| r.selected_team_id.clone()),
        selected_team_name: record.as_ref().and_then(|r| r.selected_team_name.clone()),
        teams,
        last_synced_at: record.and_then(|r| r.last_synced_at),
    })
}

// ── Connection lifecycle ──────────────────────────────────────────────────

#[tauri::command]
pub async fn connect_integration(
    app: AppHandle,
    provider: String,
    api_key: String,
) -> CmdResult<IntegrationStatus> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = api_key.trim().to_string();
        if key.is_empty() {
            bail!("API key is empty");
        }
        // Validates the key as a side effect.
        let org_teams = linear::fetch_org_and_teams(&key)?;
        credentials::store_api_key(&provider, &key)?;

        // Keep a previously-selected team if it still exists, else default to
        // the first team so the user can sync immediately.
        let existing = conns::load_connection(&provider)?;
        let selected_id = existing
            .and_then(|r| r.selected_team_id)
            .filter(|id| org_teams.teams.iter().any(|t| &t.id == id))
            .or_else(|| org_teams.teams.first().map(|t| t.id.clone()));
        let selected_name = selected_id.as_ref().and_then(|id| {
            org_teams
                .teams
                .iter()
                .find(|t| &t.id == id)
                .map(|t| t.name.clone())
        });

        conns::upsert_connection(&IntegrationConnectionRecord {
            provider: provider.clone(),
            connected: true,
            org_name: Some(org_teams.org_name.clone()),
            selected_team_id: selected_id,
            selected_team_name: selected_name,
            last_synced_at: None,
        })?;
        ui_sync::publish(
            &app,
            UiMutationEvent::IntegrationConnectionChanged {
                provider: provider.clone(),
            },
        );
        build_status(&provider, Some(org_teams.teams))
    })
    .await
}

#[tauri::command]
pub async fn disconnect_integration(app: AppHandle, provider: String) -> CmdResult<()> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        // Clear the key first — even if the DB delete fails, the secret is gone.
        let _ = credentials::clear_api_key(&provider);
        conns::clear_connection(&provider)?;
        ui_sync::publish(
            &app,
            UiMutationEvent::IntegrationConnectionChanged {
                provider: provider.clone(),
            },
        );
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn get_integration_status(provider: String) -> CmdResult<IntegrationStatus> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        build_status(&provider, None)
    })
    .await
}

#[tauri::command]
pub async fn set_integration_team(
    app: AppHandle,
    provider: String,
    team_id: String,
    team_name: String,
) -> CmdResult<()> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        conns::set_selected_team(&provider, &team_id, &team_name)?;
        ui_sync::publish(
            &app,
            UiMutationEvent::IntegrationConnectionChanged {
                provider: provider.clone(),
            },
        );
        Ok(())
    })
    .await
}

// ── Task mirror ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_tasks(provider: String, team_id: Option<String>) -> CmdResult<Vec<TaskView>> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        tasks::list_tasks(&provider, team_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn get_task(task_id: String) -> CmdResult<Option<TaskView>> {
    run_blocking(move || tasks::load_task(&task_id)).await
}

/// All workflow states for the selected team — used to render every board
/// column, including states with zero issues.
#[tauri::command]
pub async fn list_task_statuses(
    provider: String,
    team_id: Option<String>,
) -> CmdResult<Vec<crate::integrations::provider::TaskStatus>> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = require_api_key(&provider)?;
        let team = team_id
            .or_else(|| {
                conns::load_connection(&provider)
                    .ok()
                    .flatten()
                    .and_then(|r| r.selected_team_id)
            })
            .with_context(|| format!("No team selected for {provider}"))?;
        linear::list_team_states(&key, &team)
    })
    .await
}

/// All projects for the selected team — powers the project filter, including
/// projects with no synced issues.
#[tauri::command]
pub async fn list_task_projects(
    provider: String,
    team_id: Option<String>,
) -> CmdResult<Vec<crate::integrations::provider::TaskProject>> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = require_api_key(&provider)?;
        let team = team_id
            .or_else(|| {
                conns::load_connection(&provider)
                    .ok()
                    .flatten()
                    .and_then(|r| r.selected_team_id)
            })
            .with_context(|| format!("No team selected for {provider}"))?;
        linear::list_team_projects(&key, &team)
    })
    .await
}

/// All labels for the selected (or given) team — powers the tag editor.
#[tauri::command]
pub async fn list_task_labels(
    provider: String,
    team_id: Option<String>,
) -> CmdResult<Vec<crate::integrations::provider::TaskLabel>> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = require_api_key(&provider)?;
        let team = team_id
            .or_else(|| {
                conns::load_connection(&provider)
                    .ok()
                    .flatten()
                    .and_then(|r| r.selected_team_id)
            })
            .with_context(|| format!("No team selected for {provider}"))?;
        linear::list_team_labels(&key, &team)
    })
    .await
}

/// Active members of the selected (or given) team — powers the assignee picker.
#[tauri::command]
pub async fn list_task_assignees(
    provider: String,
    team_id: Option<String>,
) -> CmdResult<Vec<crate::integrations::provider::TaskAssignee>> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = require_api_key(&provider)?;
        let team = team_id
            .or_else(|| {
                conns::load_connection(&provider)
                    .ok()
                    .flatten()
                    .and_then(|r| r.selected_team_id)
            })
            .with_context(|| format!("No team selected for {provider}"))?;
        linear::list_team_members(&key, &team)
    })
    .await
}

/// Pull every issue for the selected team and upsert into the local mirror.
/// Returns the number of tasks synced.
#[tauri::command]
pub async fn sync_tasks(
    app: AppHandle,
    provider: String,
    team_id: Option<String>,
) -> CmdResult<usize> {
    run_blocking(move || {
        ensure_supported(&provider)?;
        let key = require_api_key(&provider)?;
        let team = team_id
            .or_else(|| {
                conns::load_connection(&provider)
                    .ok()
                    .flatten()
                    .and_then(|r| r.selected_team_id)
            })
            .with_context(|| format!("No team selected for {provider}"))?;

        let mut issues = linear::list_team_issues(&key, &team)?;
        let synced_at = db::current_timestamp()?;
        let count = issues.len();
        for issue in &mut issues {
            // All issues came from this team's filter; guarantee the team_id is
            // set so the team-scoped list query always finds them, even if the
            // response omitted the team field.
            if issue.team_id.is_none() {
                issue.team_id = Some(team.clone());
            }
            tasks::upsert_task(issue, &synced_at)?;
        }
        conns::set_last_synced(&provider, &synced_at)?;
        ui_sync::publish(
            &app,
            UiMutationEvent::TasksChanged {
                provider: provider.clone(),
            },
        );
        ui_sync::publish(
            &app,
            UiMutationEvent::IntegrationConnectionChanged { provider },
        );
        Ok(count)
    })
    .await
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatchInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<String>,
    pub priority: Option<i64>,
    pub assignee_id: Option<String>,
    pub label_ids: Option<Vec<String>>,
}

/// Push an inline edit to the provider, then refresh the local row from the
/// authoritative response.
#[tauri::command]
pub async fn update_task(
    app: AppHandle,
    task_id: String,
    patch: TaskPatchInput,
) -> CmdResult<TaskView> {
    run_blocking(move || {
        let task =
            tasks::load_task(&task_id)?.with_context(|| format!("Task {task_id} not found"))?;
        ensure_supported(&task.provider)?;
        let key = require_api_key(&task.provider)?;

        let issue_patch = crate::integrations::provider::IssuePatch {
            title: patch.title,
            description: patch.description,
            status_id: patch.status_id,
            priority: patch.priority,
            assignee_id: patch.assignee_id,
            label_ids: patch.label_ids,
        };
        let updated = linear::update_issue(&key, &task.external_id, &issue_patch)?;
        let synced_at = db::current_timestamp()?;
        let id = tasks::upsert_task(&updated, &synced_at)?;
        ui_sync::publish(
            &app,
            UiMutationEvent::TaskChanged {
                task_id: id.clone(),
            },
        );
        tasks::load_task(&id)?.context("Task vanished after update")
    })
    .await
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub provider: String,
    pub team_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<i64>,
    pub status_id: Option<String>,
    pub assignee_id: Option<String>,
    pub project_id: Option<String>,
    pub label_ids: Option<Vec<String>>,
}

#[tauri::command]
pub async fn create_task(app: AppHandle, input: CreateTaskInput) -> CmdResult<TaskView> {
    run_blocking(move || {
        ensure_supported(&input.provider)?;
        let key = require_api_key(&input.provider)?;
        let created = linear::create_issue(
            &key,
            &input.team_id,
            &input.title,
            &linear::NewIssue {
                description: input.description.as_deref(),
                priority: input.priority,
                status_id: input.status_id.as_deref(),
                assignee_id: input.assignee_id.as_deref(),
                project_id: input.project_id.as_deref(),
                label_ids: input.label_ids.as_deref(),
            },
        )?;
        let synced_at = db::current_timestamp()?;
        let id = tasks::upsert_task(&created, &synced_at)?;
        ui_sync::publish(
            &app,
            UiMutationEvent::TasksChanged {
                provider: input.provider,
            },
        );
        tasks::load_task(&id)?.context("Task vanished after create")
    })
    .await
}

// ── Agent review + workspace-from-task ──────────────────────────────────────

/// Result of a flow that creates a session and seeds a prompt into it. The
/// frontend's pending-CLI-send pipeline navigates to the workspace and
/// auto-submits the prompt, so callers just need the ids for any follow-up.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeededSessionResult {
    pub workspace_id: String,
    pub session_id: String,
}

fn task_summary(task: &TaskView) -> String {
    let identifier = task.identifier.as_deref().unwrap_or(&task.external_id);
    let mut out = format!("{} {}: {}\n", task.provider, identifier, task.title);
    if let Some(description) = &task.description {
        if !description.trim().is_empty() {
            out.push('\n');
            out.push_str(description);
            out.push('\n');
        }
    }
    if let Some(url) = &task.url {
        out.push_str(&format!("\nLink: {url}\n"));
    }
    out
}

/// Queue a seed prompt for a freshly-created session. Mirrors the
/// `pending_cli_sends` producer in `service.rs`: pin the resolved model onto
/// the session row (so the composer's auto-submit uses it), insert the pending
/// row, then publish so the running app drains + dispatches it.
fn queue_seed_prompt(
    app: &AppHandle,
    workspace_id: &str,
    session_id: &str,
    prompt: &str,
) -> anyhow::Result<()> {
    let model_id = crate::models::settings::load_setting_value("app.default_model_id")
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty());

    {
        let connection = db::write_conn()?;
        if let Some(model) = &model_id {
            connection
                .execute(
                    "UPDATE sessions SET model = ?2, updated_at = datetime('now') WHERE id = ?1",
                    rusqlite::params![session_id, model],
                )
                .context("Failed to pin model on seeded session")?;
        }
        connection
            .execute(
                r#"INSERT INTO pending_cli_sends (id, workspace_id, session_id, prompt, model_id, permission_mode)
                   VALUES (?1, ?2, ?3, ?4, ?5, NULL)"#,
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(),
                    workspace_id,
                    session_id,
                    prompt,
                    model_id,
                ],
            )
            .context("Failed to queue seeded prompt")?;
    }

    ui_sync::publish(
        app,
        UiMutationEvent::PendingCliSendQueued {
            workspace_id: workspace_id.to_string(),
            session_id: session_id.to_string(),
            prompt: prompt.to_string(),
            model_id,
            permission_mode: None,
        },
    );
    Ok(())
}

/// Ask an agent to review a task. Spins up a Chat-mode session seeded with a
/// review prompt and returns its ids; the frontend navigates there and the
/// agent's feedback streams into the conversation.
#[tauri::command]
pub async fn review_task_with_agent(
    app: AppHandle,
    task_id: String,
) -> CmdResult<SeededSessionResult> {
    let prepared = {
        let _lock = db::WORKSPACE_FS_MUTATION_LOCK.lock().await;
        run_blocking(move || {
            crate::workspaces::prepare_chat_workspace_impl(WorkspaceStatus::default(), None)
        })
        .await?
    };
    let workspace_id = prepared.workspace_id.clone();
    let session_id = prepared.initial_session_id.clone();

    run_blocking({
        let app = app.clone();
        let task_id = task_id.clone();
        let workspace_id = workspace_id.clone();
        let session_id = session_id.clone();
        move || {
            let task =
                tasks::load_task(&task_id)?.with_context(|| format!("Task {task_id} not found"))?;
            let prompt = format!(
                "Please review the following task and leave concise, actionable feedback — \
clarify the scope, surface risks and edge cases, and suggest an implementation approach. \
Do not write code yet.\n\n{}",
                task_summary(&task)
            );
            queue_seed_prompt(&app, &workspace_id, &session_id, &prompt)?;
            Ok(())
        }
    })
    .await?;

    ui_sync::publish(&app, UiMutationEvent::WorkspaceListChanged);
    Ok(SeededSessionResult {
        workspace_id,
        session_id,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceFromTaskInput {
    pub task_id: String,
    pub repo_id: String,
    pub source_branch: Option<String>,
    pub mode: Option<WorkspaceMode>,
}

/// Start a new workspace from a task: prepare + finalize the workspace, link it
/// to the task, and seed a kickoff prompt summarizing the task.
#[tauri::command]
pub async fn create_workspace_from_task(
    app: AppHandle,
    input: CreateWorkspaceFromTaskInput,
) -> CmdResult<SeededSessionResult> {
    let mode = input.mode.unwrap_or(WorkspaceMode::Worktree);
    if matches!(mode, WorkspaceMode::Chat) {
        return Err(anyhow::anyhow!("Chat mode is not valid for a task workspace").into());
    }

    let repo_id = input.repo_id.clone();
    let source_branch = input.source_branch.clone();
    let prepared = {
        let _lock = db::WORKSPACE_FS_MUTATION_LOCK.lock().await;
        run_blocking(move || match mode {
            WorkspaceMode::Worktree => crate::workspaces::prepare_workspace_from_repo_impl(
                &repo_id,
                source_branch.as_deref(),
                WorkspaceBranchIntent::default(),
                WorkspaceStatus::default(),
                None,
            ),
            WorkspaceMode::Local => crate::workspaces::prepare_local_workspace_impl(
                &repo_id,
                source_branch.as_deref(),
                WorkspaceStatus::default(),
                None,
            ),
            WorkspaceMode::Chat => unreachable!("chat mode rejected above"),
        })
        .await?
    };
    let workspace_id = prepared.workspace_id.clone();
    let session_id = prepared.initial_session_id.clone();

    if matches!(mode, WorkspaceMode::Worktree) {
        let ws_lock = db::workspace_fs_mutation_lock(&workspace_id);
        let _lock = ws_lock.lock().await;
        let wid = workspace_id.clone();
        run_blocking(move || crate::workspaces::finalize_workspace_from_repo_impl(&wid)).await?;
    }

    run_blocking({
        let app = app.clone();
        let task_id = input.task_id.clone();
        let workspace_id = workspace_id.clone();
        let session_id = session_id.clone();
        move || {
            let task =
                tasks::load_task(&task_id)?.with_context(|| format!("Task {task_id} not found"))?;
            tasks::set_linked_workspace(&task_id, &workspace_id)?;
            let prompt = format!(
                "You are starting work on this task. Review it, explore the relevant code, \
outline a short plan, then implement it.\n\n{}",
                task_summary(&task)
            );
            queue_seed_prompt(&app, &workspace_id, &session_id, &prompt)?;
            ui_sync::publish(&app, UiMutationEvent::TaskChanged { task_id });
            Ok(())
        }
    })
    .await?;

    ui_sync::publish(&app, UiMutationEvent::WorkspaceListChanged);
    Ok(SeededSessionResult {
        workspace_id,
        session_id,
    })
}
