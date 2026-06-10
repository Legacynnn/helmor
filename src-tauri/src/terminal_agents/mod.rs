//! Terminal agent CLIs: the static registry of supported agents and the
//! detection layer that probes which ones are installed (binary + version)
//! and what skills / extensions / plugins each has configured.

pub mod detection;
pub mod registry;

pub use detection::{
    detect_agent_details, detect_all_agents, TerminalAgentDetails, TerminalAgentInfo,
};
pub use registry::{agent_by_id, all_agents, HookStrategy, TerminalAgentSpec};
