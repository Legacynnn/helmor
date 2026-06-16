//! Surface-agnostic agent-control broker. `driver` defines the contract,
//! `broker` routes calls to the focused surface, `browser_driver` implements
//! the browser. Phase 4 adds `simulator_driver`.

pub mod broker;
pub mod browser_driver;
pub mod driver;
pub mod simulator_driver;

pub use driver::{
    InteractiveElement, PreviewDiagnostics, PreviewDriver, PreviewError, PreviewResult,
    PreviewSnapshot, PreviewStatus, PreviewSurfaceKind, PreviewTarget, WaitCondition,
};
