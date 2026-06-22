//! Persistence for `integration_connections`: non-secret per-provider
//! connection metadata (the API key itself lives in the macOS keychain, see
//! `crate::integrations::credentials`).

use anyhow::{Context, Result};
use serde::Serialize;

use super::db;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationConnectionRecord {
    pub provider: String,
    pub connected: bool,
    pub org_name: Option<String>,
    pub selected_team_id: Option<String>,
    pub selected_team_name: Option<String>,
    pub last_synced_at: Option<String>,
}

pub fn load_connection(provider: &str) -> Result<Option<IntegrationConnectionRecord>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT provider, connected, org_name, selected_team_id, selected_team_name, last_synced_at
             FROM integration_connections WHERE provider = ?1",
        )
        .context("Failed to prepare integration_connections lookup")?;
    let mut rows = statement
        .query_map([provider], |row| {
            Ok(IntegrationConnectionRecord {
                provider: row.get(0)?,
                connected: row.get::<_, i64>(1)? != 0,
                org_name: row.get(2)?,
                selected_team_id: row.get(3)?,
                selected_team_name: row.get(4)?,
                last_synced_at: row.get(5)?,
            })
        })
        .context("Failed to query integration connection")?;
    match rows.next() {
        Some(result) => result
            .map(Some)
            .context("Failed to read integration connection"),
        None => Ok(None),
    }
}

/// Upsert the connection row, preserving `last_synced_at` when the incoming
/// record leaves it `None` (so a reconnect doesn't wipe the sync timestamp).
pub fn upsert_connection(record: &IntegrationConnectionRecord) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            r#"
            INSERT INTO integration_connections
                (provider, connected, org_name, selected_team_id, selected_team_name, last_synced_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(provider) DO UPDATE SET
                connected = excluded.connected,
                org_name = excluded.org_name,
                selected_team_id = excluded.selected_team_id,
                selected_team_name = excluded.selected_team_name,
                last_synced_at = COALESCE(excluded.last_synced_at, integration_connections.last_synced_at)
            "#,
            rusqlite::params![
                record.provider,
                record.connected as i64,
                record.org_name,
                record.selected_team_id,
                record.selected_team_name,
                record.last_synced_at,
            ],
        )
        .context("Failed to upsert integration connection")?;
    Ok(())
}

pub fn set_selected_team(provider: &str, team_id: &str, team_name: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE integration_connections
             SET selected_team_id = ?2, selected_team_name = ?3
             WHERE provider = ?1",
            rusqlite::params![provider, team_id, team_name],
        )
        .context("Failed to set selected team")?;
    Ok(())
}

pub fn set_last_synced(provider: &str, timestamp: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE integration_connections SET last_synced_at = ?2 WHERE provider = ?1",
            rusqlite::params![provider, timestamp],
        )
        .context("Failed to set last synced timestamp")?;
    Ok(())
}

pub fn clear_connection(provider: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "DELETE FROM integration_connections WHERE provider = ?1",
            [provider],
        )
        .context("Failed to clear integration connection")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_load_and_clear_round_trip() {
        let _env = crate::testkit::TestEnv::new("integration-connections");

        assert!(load_connection("linear").unwrap().is_none());

        upsert_connection(&IntegrationConnectionRecord {
            provider: "linear".into(),
            connected: true,
            org_name: Some("Acme".into()),
            selected_team_id: None,
            selected_team_name: None,
            last_synced_at: None,
        })
        .unwrap();

        let loaded = load_connection("linear").unwrap().unwrap();
        assert!(loaded.connected);
        assert_eq!(loaded.org_name.as_deref(), Some("Acme"));

        set_selected_team("linear", "team-1", "Engineering").unwrap();
        set_last_synced("linear", "2026-06-21T00:00:00Z").unwrap();

        // A reconnect that omits last_synced_at must preserve it.
        upsert_connection(&IntegrationConnectionRecord {
            provider: "linear".into(),
            connected: true,
            org_name: Some("Acme Inc".into()),
            selected_team_id: Some("team-1".into()),
            selected_team_name: Some("Engineering".into()),
            last_synced_at: None,
        })
        .unwrap();

        let loaded = load_connection("linear").unwrap().unwrap();
        assert_eq!(loaded.org_name.as_deref(), Some("Acme Inc"));
        assert_eq!(loaded.selected_team_id.as_deref(), Some("team-1"));
        assert_eq!(
            loaded.last_synced_at.as_deref(),
            Some("2026-06-21T00:00:00Z")
        );

        clear_connection("linear").unwrap();
        assert!(load_connection("linear").unwrap().is_none());
    }
}
