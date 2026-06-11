//! Terminal session runtime: PTY-backed agent CLIs threaded as workspace
//! sessions. Hook-strategy agents (Claude Code, pi) report live status via
//! a loopback HTTP server; the rest fall back to output heuristics.

pub mod hook_artifacts;
pub mod hook_server;
pub mod scrollback;
pub mod spawn;
pub mod status;
