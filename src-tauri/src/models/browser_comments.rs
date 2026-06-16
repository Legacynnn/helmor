//! Persistence for browser inspector hover-comments.
//!
//! A workspace owns a list of `browser_comments` rows, each pinning a user note
//! to a DOM element by CSS selector plus a snapshot of its `outerHTML` and rect.
//! Comments are scoped per workspace + `url` so the surface can hydrate and
//! re-anchor (via `bridge/comments.ts` `reanchorComments`) only the pins
//! relevant to the page currently loaded. Mirrors `models/browser.rs`.

use anyhow::Result;
use rusqlite::params;
use serde::Serialize;

use crate::models::db;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserComment {
    pub id: String,
    pub workspace_id: String,
    pub url: String,
    pub seq: i64,
    pub selector: String,
    // The page contract spells this `outerHTML` (DOM casing); keep it so the
    // frontend `CommentPin` / `BridgeSelection` shapes read it directly.
    #[serde(rename = "outerHTML")]
    pub outer_html: String,
    pub text: String,
    pub rect_json: String,
    pub created_at: String,
}

/// A comment to persist. `id` is caller-supplied (it mirrors the page-side pin
/// id so host + page agree), and `created_at` is assigned on insert.
pub struct NewBrowserComment {
    pub id: String,
    pub url: String,
    pub seq: i64,
    pub selector: String,
    pub outer_html: String,
    pub text: String,
    pub rect_json: String,
}

/// Insert a pinned comment, returning the stored row. Idempotent on `id`
/// (`INSERT OR REPLACE`) so a re-fired pin event doesn't duplicate.
pub fn insert_comment(workspace_id: &str, c: NewBrowserComment) -> Result<BrowserComment> {
    let conn = db::write_conn()?;
    let now = db::current_timestamp()?;
    conn.execute(
        "INSERT OR REPLACE INTO browser_comments \
         (id, workspace_id, url, seq, selector, outer_html, text, rect_json, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            c.id,
            workspace_id,
            c.url,
            c.seq,
            c.selector,
            c.outer_html,
            c.text,
            c.rect_json,
            now,
        ],
    )?;
    Ok(BrowserComment {
        id: c.id,
        workspace_id: workspace_id.to_owned(),
        url: c.url,
        seq: c.seq,
        selector: c.selector,
        outer_html: c.outer_html,
        text: c.text,
        rect_json: c.rect_json,
        created_at: now,
    })
}

/// List a workspace's comments, optionally narrowed to a single `url`, ordered
/// by `seq` ascending. Pass `None` for `url` to list every comment in the
/// workspace (e.g. a "all annotations" view).
pub fn list_comments(workspace_id: &str, url: Option<&str>) -> Result<Vec<BrowserComment>> {
    let conn = db::read_conn()?;
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(BrowserComment {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            url: row.get(2)?,
            seq: row.get(3)?,
            selector: row.get(4)?,
            outer_html: row.get(5)?,
            text: row.get(6)?,
            rect_json: row.get(7)?,
            created_at: row.get(8)?,
        })
    };
    let cols = "id, workspace_id, url, seq, selector, outer_html, text, rect_json, created_at";
    match url {
        Some(url) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT {cols} FROM browser_comments \
                 WHERE workspace_id = ?1 AND url = ?2 ORDER BY seq ASC",
            ))?;
            let rows = stmt
                .query_map(params![workspace_id, url], map_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        }
        None => {
            let mut stmt = conn.prepare(&format!(
                "SELECT {cols} FROM browser_comments \
                 WHERE workspace_id = ?1 ORDER BY seq ASC",
            ))?;
            let rows = stmt
                .query_map(params![workspace_id], map_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        }
    }
}

/// Delete a comment by id. No-op if the row is already gone.
pub fn delete_comment(id: &str) -> Result<()> {
    let conn = db::write_conn()?;
    conn.execute("DELETE FROM browser_comments WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, url: &str, seq: i64) -> NewBrowserComment {
        NewBrowserComment {
            id: id.to_owned(),
            url: url.to_owned(),
            seq,
            selector: "#hero".to_owned(),
            outer_html: "<div id=\"hero\"></div>".to_owned(),
            text: "fix spacing".to_owned(),
            rect_json: "{\"x\":1,\"y\":2,\"width\":3,\"height\":4}".to_owned(),
        }
    }

    #[test]
    fn insert_and_list_round_trip() {
        let _env = crate::testkit::TestEnv::new("browser-comments");
        let ws = "ws-c1";
        let stored = insert_comment(ws, sample("c1", "http://localhost:5173/", 1)).unwrap();
        assert_eq!(stored.selector, "#hero");
        assert_eq!(stored.text, "fix spacing");

        let all = list_comments(ws, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "c1");
        assert_eq!(all[0].outer_html, "<div id=\"hero\"></div>");
    }

    #[test]
    fn list_is_scoped_by_url_when_provided() {
        let _env = crate::testkit::TestEnv::new("browser-comments-url");
        let ws = "ws-c2";
        insert_comment(ws, sample("a", "http://localhost/a", 1)).unwrap();
        insert_comment(ws, sample("b", "http://localhost/b", 2)).unwrap();

        let only_a = list_comments(ws, Some("http://localhost/a")).unwrap();
        assert_eq!(only_a.len(), 1);
        assert_eq!(only_a[0].id, "a");

        assert_eq!(list_comments(ws, None).unwrap().len(), 2);
    }

    #[test]
    fn list_orders_by_seq_ascending() {
        let _env = crate::testkit::TestEnv::new("browser-comments-seq");
        let ws = "ws-c3";
        insert_comment(ws, sample("late", "u", 5)).unwrap();
        insert_comment(ws, sample("early", "u", 1)).unwrap();
        let rows = list_comments(ws, None).unwrap();
        assert_eq!(rows[0].id, "early");
        assert_eq!(rows[1].id, "late");
    }

    #[test]
    fn delete_removes_row() {
        let _env = crate::testkit::TestEnv::new("browser-comments-del");
        let ws = "ws-c4";
        insert_comment(ws, sample("c1", "u", 1)).unwrap();
        delete_comment("c1").unwrap();
        assert!(list_comments(ws, None).unwrap().is_empty());
    }

    #[test]
    fn insert_is_idempotent_on_id() {
        let _env = crate::testkit::TestEnv::new("browser-comments-idem");
        let ws = "ws-c5";
        insert_comment(ws, sample("dup", "u", 1)).unwrap();
        let mut second = sample("dup", "u", 1);
        second.text = "updated note".to_owned();
        insert_comment(ws, second).unwrap();
        let rows = list_comments(ws, None).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].text, "updated note");
    }
}
