//! Status transitions for terminal sessions. Hook events (Claude Code
//! settings hooks, pi extension events) drive first-class agents; the
//! `HeuristicTracker` drives the rest from PTY output activity.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Runtime};

use crate::models::terminal_sessions::{
    self, STATUS_ATTENTION, STATUS_EXITED, STATUS_IDLE, STATUS_WORKING,
};

/// Map a hook event name (claude hook or pi extension event) to a status.
/// Returns `None` for events that shouldn't change status.
pub fn status_for_hook_event(event: &str) -> Option<&'static str> {
    match event {
        // Claude Code settings hooks
        "SessionStart" => Some(STATUS_IDLE),
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => Some(STATUS_WORKING),
        "Stop" => Some(STATUS_IDLE),
        "Notification" => Some(STATUS_ATTENTION),
        // pi extension events
        "session_start" => Some(STATUS_IDLE),
        "agent_start" | "turn_start" | "tool_execution_start" => Some(STATUS_WORKING),
        "agent_end" => Some(STATUS_IDLE),
        _ => None,
    }
}

pub fn apply_hook_event<R: Runtime>(app: &AppHandle<R>, session_id: &str, event: &str) {
    if let Some(status) = status_for_hook_event(event) {
        set_status(app, session_id, status);
    }
}

/// Persist a status change and notify the frontend. No-ops (and publishes
/// nothing) when the status is unchanged or the session doesn't exist.
pub fn set_status<R: Runtime>(app: &AppHandle<R>, session_id: &str, status: &str) {
    match terminal_sessions::set_terminal_session_status(session_id, status) {
        Ok(Some(workspace_id)) => {
            crate::ui_sync::publish(
                app,
                crate::ui_sync::UiMutationEvent::TerminalSessionChanged {
                    workspace_id,
                    session_id: session_id.to_string(),
                },
            );
        }
        Ok(None) => {}
        Err(error) => {
            tracing::warn!(%error, session_id, status, "Failed to update terminal session status");
        }
    }
}

pub fn mark_exited<R: Runtime>(app: &AppHandle<R>, session_id: &str, exit_code: Option<i32>) {
    let meta = serde_json::json!({ "exitCode": exit_code }).to_string();
    if let Err(error) = terminal_sessions::set_terminal_meta(session_id, &meta) {
        tracing::warn!(%error, session_id, "Failed to persist terminal exit meta");
    }
    set_status(app, session_id, STATUS_EXITED);
}

/// Quiet window after which a heuristic agent flips working -> idle.
const HEURISTIC_IDLE_AFTER: Duration = Duration::from_secs(3);
const HEURISTIC_SCAN_INTERVAL: Duration = Duration::from_secs(1);

/// Output-activity tracker for agents without a hook strategy. PTY output
/// marks the session `working`; sustained silence flips it back to `idle`.
/// Only heuristic agents are tracked — hook-driven agents would flap
/// (TUI spinners emit output while idle at the prompt).
#[derive(Default)]
pub struct HeuristicTracker {
    last_output: Mutex<HashMap<String, Instant>>,
}

impl HeuristicTracker {
    pub fn touch<R: Runtime>(&self, app: &AppHandle<R>, session_id: &str) {
        let is_new_burst = {
            let mut map = self.last_output.lock().expect("heuristic tracker poisoned");
            let previous = map.insert(session_id.to_string(), Instant::now());
            previous.is_none_or(|at| at.elapsed() >= HEURISTIC_IDLE_AFTER)
        };
        // Only hit the DB when output resumes after silence (or on first
        // output) — per-chunk writes would thrash during streams.
        if is_new_burst {
            set_status(app, session_id, STATUS_WORKING);
        }
    }

    pub fn forget(&self, session_id: &str) {
        self.last_output
            .lock()
            .expect("heuristic tracker poisoned")
            .remove(session_id);
    }

    /// Sessions whose last output is older than the idle window; removes
    /// them from the tracker (they re-enter on next output).
    fn drain_quiet(&self) -> Vec<String> {
        let mut map = self.last_output.lock().expect("heuristic tracker poisoned");
        let quiet: Vec<String> = map
            .iter()
            .filter(|(_, at)| at.elapsed() >= HEURISTIC_IDLE_AFTER)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &quiet {
            map.remove(id);
        }
        quiet
    }
}

/// Background sweep flipping quiet heuristic sessions to idle. Spawned once
/// at app setup; lives for the process lifetime.
pub fn spawn_heuristic_sweeper<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(HEURISTIC_SCAN_INTERVAL);
        loop {
            interval.tick().await;
            let tracker = tauri::Manager::state::<HeuristicTracker>(&app);
            for session_id in tracker.drain_quiet() {
                set_status(&app, &session_id, STATUS_IDLE);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_hook_events_map_to_statuses() {
        assert_eq!(status_for_hook_event("SessionStart"), Some(STATUS_IDLE));
        assert_eq!(
            status_for_hook_event("UserPromptSubmit"),
            Some(STATUS_WORKING)
        );
        assert_eq!(status_for_hook_event("PreToolUse"), Some(STATUS_WORKING));
        assert_eq!(status_for_hook_event("Stop"), Some(STATUS_IDLE));
        assert_eq!(
            status_for_hook_event("Notification"),
            Some(STATUS_ATTENTION)
        );
    }

    #[test]
    fn pi_extension_events_map_to_statuses() {
        assert_eq!(status_for_hook_event("agent_start"), Some(STATUS_WORKING));
        assert_eq!(status_for_hook_event("agent_end"), Some(STATUS_IDLE));
        assert_eq!(status_for_hook_event("turn_start"), Some(STATUS_WORKING));
        assert_eq!(status_for_hook_event("session_start"), Some(STATUS_IDLE));
    }

    #[test]
    fn unknown_events_are_ignored() {
        assert_eq!(status_for_hook_event("SomethingElse"), None);
        assert_eq!(status_for_hook_event(""), None);
    }
}
