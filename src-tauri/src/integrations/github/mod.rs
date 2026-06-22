//! GitHub Issues provider. Repos act as "teams"; issues normalize into the
//! shared `ProviderTask` model. Built on the bundled `gh` auth via `forge`.

pub mod auth;
pub mod client;
pub mod inbox;
pub mod map;
mod ops;
pub mod queries;
mod responses;

pub use auth::default_login;

pub struct GithubProvider {
    login: String,
}

impl GithubProvider {
    pub fn new(login: impl Into<String>) -> Self {
        Self {
            login: login.into(),
        }
    }
}
