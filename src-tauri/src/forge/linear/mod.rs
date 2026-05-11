//! Linear backend. Mirrors the layout of `forge::github`, but talks to a
//! single GraphQL endpoint (`https://api.linear.app/graphql`) using a
//! Personal API Key stored in the `settings` table under `linear.api_key`.
//!
//! Public surface:
//! - `auth::{get_api_key, set_api_key, clear_api_key, get_auth_status}`
//! - `queries::list_teams`

pub mod auth;
pub mod client;
pub mod queries;
pub mod types;
