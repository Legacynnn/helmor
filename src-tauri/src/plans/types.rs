//! Domain types for MDX planning documents stored under a workspace's
//! `.helmor/plans/` directory.

use serde::{Deserialize, Serialize};

/// Lifecycle status of a plan, carried in YAML frontmatter as a kebab-case
/// string (`draft`, `approved`, `handed-off`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlanLifecycle {
    Draft,
    Approved,
    HandedOff,
}

impl PlanLifecycle {
    /// Wire/frontmatter spelling for this status.
    pub fn as_str(self) -> &'static str {
        match self {
            PlanLifecycle::Draft => "draft",
            PlanLifecycle::Approved => "approved",
            PlanLifecycle::HandedOff => "handed-off",
        }
    }
}

/// Lightweight metadata about a plan, parsed from its frontmatter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub slug: String,
    pub title: String,
    pub status: PlanLifecycle,
    /// Workspace-relative path, e.g. `.helmor/plans/foo.mdx`.
    pub path: String,
}

/// A plan's summary plus its full raw `.mdx` content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDoc {
    pub summary: PlanSummary,
    /// Raw `.mdx` content, frontmatter included.
    pub content: String,
}
