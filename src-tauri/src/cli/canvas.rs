//! `helmor canvas` — drive a workspace's Infinite Canvas (epic #61) from the
//! terminal or from an agent. Reuses `models::canvas` CRUD and signals a
//! running app via `CanvasChanged` so the live canvas reflects mutations
//! without a restart.

use anyhow::{anyhow, Result};
use serde::Serialize;

use super::args::{CanvasAction, CanvasPanelAction, Cli};
use super::{notify_ui_event, output};
use crate::models::{canvas, db, sessions};
use crate::ui_sync::UiMutationEvent;

const DEFAULT_WIDTH: f64 = 480.0;
const DEFAULT_HEIGHT: f64 = 360.0;

pub fn dispatch(action: &CanvasAction, cli: &Cli) -> Result<()> {
    match action {
        CanvasAction::Panel { action } => dispatch_panel(action, cli),
        CanvasAction::Connect {
            workspace,
            from,
            to,
            kind,
        } => connect(workspace, from, to, kind.as_deref(), cli),
        CanvasAction::Disconnect { workspace, id } => disconnect(workspace, id, cli),
        CanvasAction::View { workspace } => view(workspace, cli),
    }
}

fn changed(workspace_id: &str) {
    notify_ui_event(UiMutationEvent::CanvasChanged {
        workspace_id: workspace_id.to_string(),
    });
}

fn dispatch_panel(action: &CanvasPanelAction, cli: &Cli) -> Result<()> {
    match action {
        CanvasPanelAction::List { workspace } => list_panels(workspace, cli),
        CanvasPanelAction::Create {
            workspace,
            panel_type,
            x,
            y,
            width,
            height,
            title,
        } => create_panel(
            workspace,
            panel_type,
            *x,
            *y,
            *width,
            *height,
            title.clone(),
            cli,
        ),
        CanvasPanelAction::Move {
            workspace,
            id,
            x,
            y,
        } => move_panel(workspace, id, *x, *y, cli),
        CanvasPanelAction::Resize {
            workspace,
            id,
            width,
            height,
        } => resize_panel(workspace, id, *width, *height, cli),
        CanvasPanelAction::Delete { workspace, id } => delete_panel(workspace, id, cli),
    }
}

fn list_panels(workspace: &str, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    let panels = db::read(|conn| canvas::list_panels(conn, &ws))?;
    output::print(cli, &panels, |items| {
        if items.is_empty() {
            "No panels.".to_string()
        } else {
            items
                .iter()
                .map(|p| {
                    format!(
                        "{}\t{}\t({:.0}, {:.0})\t{:.0}x{:.0}",
                        p.id, p.panel_type, p.x, p.y, p.width, p.height
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedPanel {
    panel_id: String,
    panel_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
}

#[allow(clippy::too_many_arguments)]
fn create_panel(
    workspace: &str,
    panel_type: &str,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    title: Option<String>,
    cli: &Cli,
) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    // tldraw shape-id format so the live renderer can adopt the row directly.
    let id = format!("shape:{}", uuid::Uuid::new_v4());

    // Live-bound types get their binding provisioned up front so the panel is
    // functional the moment it appears (and so an agent can drive it).
    let mut session_id = None;
    let config = match panel_type {
        "conversation" => {
            let resp = sessions::create_session(
                &ws,
                None,
                None,
                sessions::CreateSessionOverrides::default(),
            )?;
            session_id = Some(resp.session_id.clone());
            Some(serde_json::json!({ "sessionId": resp.session_id }).to_string())
        }
        "terminal" => {
            Some(serde_json::json!({ "instanceId": uuid::Uuid::new_v4().to_string() }).to_string())
        }
        _ => None,
    };

    let panel = canvas::CanvasPanel {
        id: id.clone(),
        workspace_id: ws.clone(),
        panel_type: panel_type.to_string(),
        x: x.unwrap_or(0.0),
        y: y.unwrap_or(0.0),
        width: width.unwrap_or(DEFAULT_WIDTH),
        height: height.unwrap_or(DEFAULT_HEIGHT),
        z: 0,
        locked: false,
        title,
        config,
        created_at: String::new(),
        updated_at: String::new(),
    };
    db::write_transaction(|tx| canvas::upsert_panel(tx, &panel))?;
    changed(&ws);

    let response = CreatedPanel {
        panel_id: id.clone(),
        panel_type: panel_type.to_string(),
        session_id: session_id.clone(),
    };
    if cli.json {
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else if cli.quiet {
        // Pipe-friendly: just the panel id.
        println!("{id}");
    } else {
        println!("Created {panel_type} panel {id}");
        if let Some(sid) = &session_id {
            println!("  bound session {sid}");
        }
    }
    Ok(())
}

fn load_panel(workspace_id: &str, id: &str) -> Result<canvas::CanvasPanel> {
    db::read(|conn| canvas::list_panels(conn, workspace_id))?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| anyhow!("Panel {id} not found in workspace {workspace_id}"))
}

fn move_panel(workspace: &str, id: &str, x: f64, y: f64, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    let mut panel = load_panel(&ws, id)?;
    panel.x = x;
    panel.y = y;
    db::write_transaction(|tx| canvas::upsert_panel(tx, &panel))?;
    changed(&ws);
    output::print_ok(cli, &format!("Moved {id} to ({x:.0}, {y:.0})"));
    Ok(())
}

fn resize_panel(workspace: &str, id: &str, width: f64, height: f64, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    let mut panel = load_panel(&ws, id)?;
    panel.width = width;
    panel.height = height;
    db::write_transaction(|tx| canvas::upsert_panel(tx, &panel))?;
    changed(&ws);
    output::print_ok(cli, &format!("Resized {id} to {width:.0}x{height:.0}"));
    Ok(())
}

fn delete_panel(workspace: &str, id: &str, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    db::write_transaction(|tx| canvas::delete_panel(tx, id))?;
    changed(&ws);
    output::print_ok(cli, &format!("Deleted panel {id}"));
    Ok(())
}

/// Resolve the edge kind from both endpoints (mirrors the frontend's
/// `deriveKind`) when the caller doesn't pin one.
fn derive_kind(from_type: &str, to_type: &str) -> String {
    match (from_type, to_type) {
        ("conversation", "terminal") => "conversation-terminal",
        ("conversation", "conversation") => "conversation-conversation",
        _ => "generic",
    }
    .to_string()
}

fn connect(workspace: &str, from: &str, to: &str, kind: Option<&str>, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    let panels = db::read(|conn| canvas::list_panels(conn, &ws))?;
    let from_panel = panels
        .iter()
        .find(|p| p.id == from)
        .ok_or_else(|| anyhow!("Source panel {from} not found"))?;
    let to_panel = panels
        .iter()
        .find(|p| p.id == to)
        .ok_or_else(|| anyhow!("Target panel {to} not found"))?;
    let kind = kind
        .map(str::to_string)
        .unwrap_or_else(|| derive_kind(&from_panel.panel_type, &to_panel.panel_type));

    let connection = canvas::CanvasConnection {
        id: uuid::Uuid::new_v4().to_string(),
        workspace_id: ws.clone(),
        from_panel_id: from.to_string(),
        to_panel_id: to.to_string(),
        kind,
        meta: None,
        created_at: String::new(),
    };
    db::write_transaction(|tx| canvas::upsert_connection(tx, &connection))?;
    changed(&ws);
    output::print_id(cli, "connectionId", &connection.id);
    Ok(())
}

fn disconnect(workspace: &str, id: &str, cli: &Cli) -> Result<()> {
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    db::write_transaction(|tx| canvas::delete_connection(tx, id))?;
    changed(&ws);
    output::print_ok(cli, &format!("Disconnected {id}"));
    Ok(())
}

/// Combined camera (per-workspace) + shared style (per-repository) view for the
/// CLI `canvas view` command.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasViewReport {
    #[serde(flatten)]
    camera: canvas::CanvasViewState,
    #[serde(flatten)]
    style: canvas::CanvasRepositoryStyle,
}

fn view(workspace: &str, cli: &Cli) -> Result<()> {
    use rusqlite::OptionalExtension;
    let ws = crate::service::resolve_workspace_ref(workspace)?;
    let report = db::read(|conn| {
        let camera = canvas::get_view_state(conn, &ws)?;
        let repo_id: Option<String> = conn
            .query_row(
                "SELECT repository_id FROM workspaces WHERE id = ?1",
                [&ws],
                |r| r.get(0),
            )
            .optional()?;
        let style = match repo_id {
            Some(rid) => canvas::get_repository_style(conn, &rid)?,
            None => canvas::CanvasRepositoryStyle::default_for(""),
        };
        Ok(CanvasViewReport { camera, style })
    })?;
    output::print(cli, &report, |v| {
        format!(
            "pan ({:.0}, {:.0}) · zoom {:.2} · translucency {:.0}% · bg {} ({})\nsnap-to-grid {}",
            v.camera.pan_x,
            v.camera.pan_y,
            v.camera.zoom,
            v.style.translucency * 100.0,
            v.style.background_pattern,
            v.style.background_theme,
            if v.style.snap_to_grid { "on" } else { "off" },
        )
    })
}

#[cfg(test)]
mod tests {
    use super::derive_kind;

    #[test]
    fn derive_kind_matches_endpoint_types() {
        assert_eq!(
            derive_kind("conversation", "terminal"),
            "conversation-terminal"
        );
        assert_eq!(
            derive_kind("conversation", "conversation"),
            "conversation-conversation"
        );
        assert_eq!(derive_kind("terminal", "conversation"), "generic");
        assert_eq!(derive_kind("placeholder", "terminal"), "generic");
    }
}
