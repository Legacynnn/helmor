//! Persistence for Infinite Canvas mode (epic #61).
//!
//! Three greenfield, per-workspace tables backing the spatial canvas:
//!   - `canvas_panels`      — every surface placed on the canvas (UUID-keyed).
//!   - `canvas_connections` — generic typed edges between panels (chains OK).
//!   - `canvas_view_state`  — pan/zoom/translucency + background per workspace.
//!
//! `config` / `meta` are opaque JSON strings owned by the frontend so panel and
//! connection kinds can evolve without schema churn. The repo exposes plain
//! CRUD; IPC glue + `UiMutationEvent` broadcasting live in
//! `commands::canvas_commands`.

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::db;

/// One placed surface on a workspace's canvas. `id` is a frontend-generated
/// UUID (mirrors the tldraw shape id), letting the renderer own identity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasPanel {
    pub id: String,
    pub workspace_id: String,
    pub panel_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z: i64,
    pub locked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Opaque JSON owned by the frontend (e.g. bound sessionId for a
    /// conversation/terminal panel, note body, working dir, …).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A generic typed edge between two panels. Chains (A→B→C) are just multiple
/// rows. Behavior resolves from endpoint panel types + `kind` at runtime.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasConnection {
    pub id: String,
    pub workspace_id: String,
    pub from_panel_id: String,
    pub to_panel_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<String>,
    pub created_at: String,
}

/// Per-workspace canvas viewport + appearance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasViewState {
    pub workspace_id: String,
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    /// Global translucency for all DOM panels, 0.0..=1.0 (1 = opaque).
    pub translucency: f64,
    /// "blank" | "dots" | "lines".
    pub background_pattern: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    /// "light" | "dark" | "system".
    pub background_theme: String,
    pub snap_to_grid: bool,
    pub updated_at: String,
}

impl CanvasViewState {
    /// Defaults applied when a workspace has never entered canvas mode.
    pub fn default_for(workspace_id: &str) -> Self {
        Self {
            workspace_id: workspace_id.to_string(),
            pan_x: 0.0,
            pan_y: 0.0,
            zoom: 1.0,
            translucency: 1.0,
            background_pattern: "dots".to_string(),
            background_color: None,
            background_theme: "system".to_string(),
            snap_to_grid: false,
            updated_at: String::new(),
        }
    }
}

/// Full snapshot of a workspace's canvas — what the renderer loads on entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasState {
    pub panels: Vec<CanvasPanel>,
    pub connections: Vec<CanvasConnection>,
    pub view_state: CanvasViewState,
}

// ── Row mappers ────────────────────────────────────────────────────────────

fn map_panel(row: &rusqlite::Row<'_>) -> rusqlite::Result<CanvasPanel> {
    Ok(CanvasPanel {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        panel_type: row.get(2)?,
        x: row.get(3)?,
        y: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        z: row.get(7)?,
        locked: row.get::<_, i64>(8)? != 0,
        title: row.get(9)?,
        config: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const PANEL_COLUMNS: &str = "id, workspace_id, panel_type, x, y, width, height, z, locked, title, config, created_at, updated_at";

fn map_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<CanvasConnection> {
    Ok(CanvasConnection {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        from_panel_id: row.get(2)?,
        to_panel_id: row.get(3)?,
        kind: row.get(4)?,
        meta: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const CONNECTION_COLUMNS: &str =
    "id, workspace_id, from_panel_id, to_panel_id, kind, meta, created_at";

fn map_view_state(row: &rusqlite::Row<'_>) -> rusqlite::Result<CanvasViewState> {
    Ok(CanvasViewState {
        workspace_id: row.get(0)?,
        pan_x: row.get(1)?,
        pan_y: row.get(2)?,
        zoom: row.get(3)?,
        translucency: row.get(4)?,
        background_pattern: row.get(5)?,
        background_color: row.get(6)?,
        background_theme: row.get(7)?,
        snap_to_grid: row.get::<_, i64>(8)? != 0,
        updated_at: row.get(9)?,
    })
}

const VIEW_STATE_COLUMNS: &str = "workspace_id, pan_x, pan_y, zoom, translucency, background_pattern, background_color, background_theme, snap_to_grid, updated_at";

// ── Panels ─────────────────────────────────────────────────────────────────

pub fn list_panels(conn: &Connection, workspace_id: &str) -> Result<Vec<CanvasPanel>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PANEL_COLUMNS} FROM canvas_panels WHERE workspace_id = ?1 ORDER BY z ASC, created_at ASC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_panel)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Insert-or-replace a panel keyed by its UUID. The frontend sends the full
/// panel state on create and on every move/resize, so an upsert keeps the
/// command surface minimal while staying correct.
pub fn upsert_panel(conn: &Connection, panel: &CanvasPanel) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO canvas_panels
            (id, workspace_id, panel_type, x, y, width, height, z, locked, title, config, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            panel_type = excluded.panel_type,
            x = excluded.x,
            y = excluded.y,
            width = excluded.width,
            height = excluded.height,
            z = excluded.z,
            locked = excluded.locked,
            title = excluded.title,
            config = excluded.config,
            updated_at = datetime('now')
        "#,
        rusqlite::params![
            panel.id,
            panel.workspace_id,
            panel.panel_type,
            panel.x,
            panel.y,
            panel.width,
            panel.height,
            panel.z,
            panel.locked as i64,
            panel.title,
            panel.config,
        ],
    )?;
    Ok(())
}

pub fn delete_panel(conn: &Connection, panel_id: &str) -> Result<()> {
    // Drop any edges touching this panel so chains stay consistent.
    conn.execute(
        "DELETE FROM canvas_connections WHERE from_panel_id = ?1 OR to_panel_id = ?1",
        [panel_id],
    )?;
    conn.execute("DELETE FROM canvas_panels WHERE id = ?1", [panel_id])?;
    Ok(())
}

// ── Connections ──────────────────────────────────────────────────────────────

pub fn list_connections(conn: &Connection, workspace_id: &str) -> Result<Vec<CanvasConnection>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CONNECTION_COLUMNS} FROM canvas_connections WHERE workspace_id = ?1 ORDER BY created_at ASC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_connection)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn upsert_connection(conn: &Connection, connection: &CanvasConnection) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO canvas_connections
            (id, workspace_id, from_panel_id, to_panel_id, kind, meta)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            meta = excluded.meta
        "#,
        rusqlite::params![
            connection.id,
            connection.workspace_id,
            connection.from_panel_id,
            connection.to_panel_id,
            connection.kind,
            connection.meta,
        ],
    )?;
    Ok(())
}

pub fn delete_connection(conn: &Connection, connection_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM canvas_connections WHERE id = ?1",
        [connection_id],
    )?;
    Ok(())
}

// ── View state ───────────────────────────────────────────────────────────────

pub fn get_view_state(conn: &Connection, workspace_id: &str) -> Result<CanvasViewState> {
    let found = conn
        .query_row(
            &format!("SELECT {VIEW_STATE_COLUMNS} FROM canvas_view_state WHERE workspace_id = ?1"),
            [workspace_id],
            map_view_state,
        )
        .optional()?;
    Ok(found.unwrap_or_else(|| CanvasViewState::default_for(workspace_id)))
}

pub fn upsert_view_state(conn: &Connection, view: &CanvasViewState) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO canvas_view_state
            (workspace_id, pan_x, pan_y, zoom, translucency, background_pattern,
             background_color, background_theme, snap_to_grid, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
        ON CONFLICT(workspace_id) DO UPDATE SET
            pan_x = excluded.pan_x,
            pan_y = excluded.pan_y,
            zoom = excluded.zoom,
            translucency = excluded.translucency,
            background_pattern = excluded.background_pattern,
            background_color = excluded.background_color,
            background_theme = excluded.background_theme,
            snap_to_grid = excluded.snap_to_grid,
            updated_at = datetime('now')
        "#,
        rusqlite::params![
            view.workspace_id,
            view.pan_x,
            view.pan_y,
            view.zoom,
            view.translucency,
            view.background_pattern,
            view.background_color,
            view.background_theme,
            view.snap_to_grid as i64,
        ],
    )?;
    Ok(())
}

// ── Aggregate ────────────────────────────────────────────────────────────────

/// Load the full canvas for a workspace in one read transaction — what the
/// renderer pulls on entry / after restart.
pub fn load_state(workspace_id: &str) -> Result<CanvasState> {
    db::read(|conn| {
        Ok(CanvasState {
            panels: list_panels(conn, workspace_id)?,
            connections: list_connections(conn, workspace_id)?,
            view_state: get_view_state(conn, workspace_id)?,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        conn
    }

    fn sample_panel(id: &str, ws: &str) -> CanvasPanel {
        CanvasPanel {
            id: id.to_string(),
            workspace_id: ws.to_string(),
            panel_type: "placeholder".to_string(),
            x: 10.0,
            y: 20.0,
            width: 480.0,
            height: 360.0,
            z: 0,
            locked: false,
            title: Some("Panel".to_string()),
            config: Some(r#"{"foo":"bar"}"#.to_string()),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn panel_upsert_then_list_round_trips() {
        let conn = mem_conn();
        upsert_panel(&conn, &sample_panel("p1", "ws1")).unwrap();
        let panels = list_panels(&conn, "ws1").unwrap();
        assert_eq!(panels.len(), 1);
        assert_eq!(panels[0].id, "p1");
        assert_eq!(panels[0].x, 10.0);
        assert_eq!(panels[0].title.as_deref(), Some("Panel"));
        assert_eq!(panels[0].config.as_deref(), Some(r#"{"foo":"bar"}"#));
    }

    #[test]
    fn panel_upsert_updates_in_place() {
        let conn = mem_conn();
        upsert_panel(&conn, &sample_panel("p1", "ws1")).unwrap();
        let mut moved = sample_panel("p1", "ws1");
        moved.x = 999.0;
        moved.z = 5;
        upsert_panel(&conn, &moved).unwrap();
        let panels = list_panels(&conn, "ws1").unwrap();
        assert_eq!(panels.len(), 1, "upsert must not duplicate");
        assert_eq!(panels[0].x, 999.0);
        assert_eq!(panels[0].z, 5);
    }

    #[test]
    fn panels_are_scoped_per_workspace() {
        let conn = mem_conn();
        upsert_panel(&conn, &sample_panel("p1", "ws1")).unwrap();
        upsert_panel(&conn, &sample_panel("p2", "ws2")).unwrap();
        assert_eq!(list_panels(&conn, "ws1").unwrap().len(), 1);
        assert_eq!(list_panels(&conn, "ws2").unwrap().len(), 1);
    }

    #[test]
    fn deleting_panel_cascades_connections() {
        let conn = mem_conn();
        upsert_panel(&conn, &sample_panel("a", "ws1")).unwrap();
        upsert_panel(&conn, &sample_panel("b", "ws1")).unwrap();
        upsert_connection(
            &conn,
            &CanvasConnection {
                id: "c1".to_string(),
                workspace_id: "ws1".to_string(),
                from_panel_id: "a".to_string(),
                to_panel_id: "b".to_string(),
                kind: "generic".to_string(),
                meta: None,
                created_at: String::new(),
            },
        )
        .unwrap();
        assert_eq!(list_connections(&conn, "ws1").unwrap().len(), 1);
        delete_panel(&conn, "a").unwrap();
        assert_eq!(list_panels(&conn, "ws1").unwrap().len(), 1);
        assert_eq!(
            list_connections(&conn, "ws1").unwrap().len(),
            0,
            "edges touching a deleted panel must be removed"
        );
    }

    #[test]
    fn view_state_defaults_when_absent() {
        let conn = mem_conn();
        let view = get_view_state(&conn, "ws1").unwrap();
        assert_eq!(view.zoom, 1.0);
        assert_eq!(view.translucency, 1.0);
        assert_eq!(view.background_pattern, "dots");
        assert!(!view.snap_to_grid);
    }

    #[test]
    fn view_state_upsert_round_trips_and_updates() {
        let conn = mem_conn();
        let mut view = CanvasViewState::default_for("ws1");
        view.pan_x = 100.0;
        view.zoom = 2.0;
        view.translucency = 0.5;
        view.background_pattern = "lines".to_string();
        view.snap_to_grid = true;
        upsert_view_state(&conn, &view).unwrap();

        let loaded = get_view_state(&conn, "ws1").unwrap();
        assert_eq!(loaded.pan_x, 100.0);
        assert_eq!(loaded.zoom, 2.0);
        assert_eq!(loaded.translucency, 0.5);
        assert_eq!(loaded.background_pattern, "lines");
        assert!(loaded.snap_to_grid);

        view.zoom = 3.0;
        upsert_view_state(&conn, &view).unwrap();
        assert_eq!(get_view_state(&conn, "ws1").unwrap().zoom, 3.0);
    }

    #[test]
    fn connection_delete_round_trips() {
        let conn = mem_conn();
        upsert_connection(
            &conn,
            &CanvasConnection {
                id: "c1".to_string(),
                workspace_id: "ws1".to_string(),
                from_panel_id: "a".to_string(),
                to_panel_id: "b".to_string(),
                kind: "conversation-terminal".to_string(),
                meta: Some(r#"{"terminal":"t1"}"#.to_string()),
                created_at: String::new(),
            },
        )
        .unwrap();
        let conns = list_connections(&conn, "ws1").unwrap();
        assert_eq!(conns.len(), 1);
        assert_eq!(conns[0].kind, "conversation-terminal");
        delete_connection(&conn, "c1").unwrap();
        assert_eq!(list_connections(&conn, "ws1").unwrap().len(), 0);
    }
}
