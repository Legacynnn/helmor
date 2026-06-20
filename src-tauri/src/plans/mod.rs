//! MDX planning documents: `.mdx` files stored under a workspace's
//! `.helmor/plans/` directory, git-excluded so they don't leak into the
//! user's tracked tree. Lifecycle status lives in YAML frontmatter.

pub mod store;
pub mod types;

pub use types::{PlanDoc, PlanLifecycle, PlanSummary};
