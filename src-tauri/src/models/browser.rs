//! Persistence for the integrated browser surface.
//!
//! A workspace owns an ordered list of `browser_tabs` rows. We persist the full
//! tab set per workspace with `replace_tabs` (delete-then-insert) — the simplest
//! consistent shape for a small, frequently-rewritten list — and read it back
//! ordered by `position` with `list_tabs`. Mirrors `models/paired_devices.rs`.

use anyhow::Result;
use rusqlite::params;
use serde::Serialize;

use crate::models::db;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTab {
    pub id: String,
    pub workspace_id: String,
    pub url: String,
    pub title: Option<String>,
    pub position: i64,
    pub active: bool,
}

/// A tab to persist. `id` is assigned on insert, so the input carries only the
/// fields the caller controls.
pub struct NewBrowserTab {
    pub url: String,
    pub title: Option<String>,
    pub position: i64,
    pub active: bool,
}

/// Replace the full tab set for a workspace (delete-then-insert). The simplest
/// consistent persistence for a small, frequently-rewritten list.
pub fn replace_tabs(workspace_id: &str, tabs: &[NewBrowserTab]) -> Result<()> {
    let conn = db::write_conn()?;
    conn.execute(
        "DELETE FROM browser_tabs WHERE workspace_id = ?1",
        params![workspace_id],
    )?;
    for t in tabs {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO browser_tabs (id, workspace_id, url, title, position, active) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                workspace_id,
                t.url,
                t.title,
                t.position,
                t.active as i64
            ],
        )?;
    }
    Ok(())
}

/// List a workspace's tabs ordered by `position` ascending.
pub fn list_tabs(workspace_id: &str) -> Result<Vec<BrowserTab>> {
    let conn = db::read_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, url, title, position, active \
         FROM browser_tabs WHERE workspace_id = ?1 ORDER BY position ASC",
    )?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok(BrowserTab {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                url: row.get(2)?,
                title: row.get(3)?,
                position: row.get(4)?,
                active: row.get::<_, i64>(5)? != 0,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_and_list_tabs_round_trip() {
        let _env = crate::testkit::TestEnv::new("browser-tabs");
        let ws = "ws-test";
        replace_tabs(
            ws,
            &[NewBrowserTab {
                url: "http://localhost:3000".into(),
                title: Some("Local".into()),
                position: 0,
                active: true,
            }],
        )
        .unwrap();

        let tabs = list_tabs(ws).unwrap();
        assert_eq!(tabs.len(), 1);
        assert_eq!(tabs[0].url, "http://localhost:3000");
        assert_eq!(tabs[0].title.as_deref(), Some("Local"));
        assert!(tabs[0].active);
    }

    #[test]
    fn replace_tabs_overwrites_previous_set_and_orders_by_position() {
        let _env = crate::testkit::TestEnv::new("browser-tabs-replace");
        let ws = "ws-replace";
        replace_tabs(
            ws,
            &[NewBrowserTab {
                url: "u-old".into(),
                title: None,
                position: 0,
                active: true,
            }],
        )
        .unwrap();

        replace_tabs(
            ws,
            &[
                NewBrowserTab {
                    url: "u-second".into(),
                    title: None,
                    position: 1,
                    active: false,
                },
                NewBrowserTab {
                    url: "u-first".into(),
                    title: None,
                    position: 0,
                    active: true,
                },
            ],
        )
        .unwrap();

        let tabs = list_tabs(ws).unwrap();
        assert_eq!(tabs.len(), 2);
        // Ordered by position: "u-first" (0) before "u-second" (1).
        assert_eq!(tabs[0].url, "u-first");
        assert_eq!(tabs[1].url, "u-second");
        assert!(!tabs.iter().any(|t| t.url == "u-old"));
    }

    #[test]
    fn list_tabs_is_scoped_per_workspace() {
        let _env = crate::testkit::TestEnv::new("browser-tabs-scope");
        replace_tabs(
            "ws-a",
            &[NewBrowserTab {
                url: "a".into(),
                title: None,
                position: 0,
                active: true,
            }],
        )
        .unwrap();
        replace_tabs(
            "ws-b",
            &[NewBrowserTab {
                url: "b".into(),
                title: None,
                position: 0,
                active: true,
            }],
        )
        .unwrap();

        assert_eq!(list_tabs("ws-a").unwrap().len(), 1);
        assert_eq!(list_tabs("ws-a").unwrap()[0].url, "a");
        assert_eq!(list_tabs("ws-b").unwrap()[0].url, "b");
    }
}
