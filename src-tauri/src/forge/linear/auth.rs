use anyhow::Result;

use crate::models::settings::{delete_setting_value, load_setting_value, upsert_setting_value};

use super::queries::fetch_viewer;
use super::types::{LinearAuthStatus, LinearError};

const KEY: &str = "linear.api_key";

pub fn get_api_key() -> Result<Option<String>> {
    load_setting_value(KEY)
}

pub fn set_api_key(value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return clear_api_key();
    }
    upsert_setting_value(KEY, trimmed)
}

pub fn clear_api_key() -> Result<()> {
    delete_setting_value(KEY)
}

/// Probe the stored key by calling Linear's `viewer` query.
/// - No key stored → `{ connected: false, viewer: None }`.
/// - Key stored + 401/403 → `{ connected: false, viewer: None }` and the
///   stored key is left in place (user can fix it in Settings).
/// - Key stored + viewer returned → `{ connected: true, viewer: Some(_) }`.
pub async fn get_auth_status() -> Result<LinearAuthStatus, LinearError> {
    let Some(key) = get_api_key().map_err(|e| LinearError::Parse(e.to_string()))? else {
        return Ok(LinearAuthStatus {
            connected: false,
            viewer: None,
        });
    };
    match fetch_viewer(&key).await {
        Ok(viewer) => Ok(LinearAuthStatus {
            connected: true,
            viewer: Some(viewer),
        }),
        Err(LinearError::Unauthorized) => Ok(LinearAuthStatus {
            connected: false,
            viewer: None,
        }),
        Err(e) => Err(e),
    }
}
