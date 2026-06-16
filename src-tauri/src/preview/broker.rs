//! Resolves a workspace's focused preview surface to a `PreviewDriver` and
//! tracks which workspaces are currently under agent control.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::preview::driver::{
    PreviewDriver, PreviewError, PreviewResult, PreviewSnapshot, PreviewStatus, PreviewSurfaceKind,
    PreviewTarget, WaitCondition,
};

/// A surface currently registered as controllable for a workspace.
#[derive(Clone)]
pub struct RegisteredSurface {
    pub kind: PreviewSurfaceKind,
    pub driver: Arc<dyn PreviewDriver>,
}

#[derive(Default)]
pub struct SurfaceRegistry {
    surfaces: Mutex<HashMap<String, RegisteredSurface>>,
    controlled: Mutex<HashSet<String>>,
}

impl SurfaceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, workspace_id: &str, surface: RegisteredSurface) {
        self.surfaces
            .lock()
            .expect("surfaces lock")
            .insert(workspace_id.to_string(), surface);
    }

    pub fn unregister(&self, workspace_id: &str) {
        self.surfaces
            .lock()
            .expect("surfaces lock")
            .remove(workspace_id);
        self.clear_controlled(workspace_id);
    }

    pub fn resolve(&self, workspace_id: &str) -> PreviewResult<RegisteredSurface> {
        self.surfaces
            .lock()
            .expect("surfaces lock")
            .get(workspace_id)
            .cloned()
            .ok_or(PreviewError::NoSurface)
    }

    pub fn is_controlled(&self, workspace_id: &str) -> bool {
        self.controlled
            .lock()
            .expect("controlled lock")
            .contains(workspace_id)
    }
    pub fn mark_controlled(&self, workspace_id: &str) {
        self.controlled
            .lock()
            .expect("controlled lock")
            .insert(workspace_id.to_string());
    }
    pub fn clear_controlled(&self, workspace_id: &str) {
        self.controlled
            .lock()
            .expect("controlled lock")
            .remove(workspace_id);
    }
}

/// Process-wide registry (the app has at most one controllable surface per
/// workspace; see PRD D7).
pub fn registry() -> &'static SurfaceRegistry {
    static REG: OnceLock<SurfaceRegistry> = OnceLock::new();
    REG.get_or_init(SurfaceRegistry::new)
}

/// One agent tool call, tagged by verb. Mirrors the sidecar `preview_*` tools.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "verb", rename_all = "camelCase")]
pub enum PreviewCall {
    Status,
    Open {
        target: String,
    },
    Navigate {
        url: String,
    },
    Snapshot,
    Click {
        target: PreviewTarget,
    },
    Type {
        target: PreviewTarget,
        text: String,
    },
    Press {
        key: String,
    },
    Scroll {
        target: Option<PreviewTarget>,
        dx: f64,
        dy: f64,
    },
    Evaluate {
        script: String,
    },
    WaitFor {
        condition: WaitCondition,
        timeout_ms: u64,
    },
}

/// Verbs that mutate the surface; the first one for a workspace flips it into
/// "agent controlling" and publishes `BrowserAgentControlStarted`.
fn is_mutating(call: &PreviewCall) -> bool {
    matches!(
        call,
        PreviewCall::Click { .. }
            | PreviewCall::Type { .. }
            | PreviewCall::Press { .. }
            | PreviewCall::Scroll { .. }
            | PreviewCall::Navigate { .. }
            | PreviewCall::Open { .. }
    )
}

/// The result union returned to the agent (serialized into the MCP tool reply).
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PreviewValue {
    Unit,
    Status(PreviewStatus),
    Snapshot(PreviewSnapshot),
    Json(serde_json::Value),
}

/// Entry point invoked by the `preview.` host handler. `workspace_id` is the
/// agent's OWN workspace (the sidecar stamps it; see Task 8), so resolving
/// against the registry is the entire cross-workspace safety boundary (D7).
pub async fn dispatch<R: Runtime>(
    app: &AppHandle<R>,
    workspace_id: &str,
    call: PreviewCall,
) -> PreviewResult<PreviewValue> {
    let surface = registry().resolve(workspace_id)?;

    if is_mutating(&call) && !registry().is_controlled(workspace_id) {
        registry().mark_controlled(workspace_id);
        crate::ui_sync::publish(
            app,
            crate::ui_sync::UiMutationEvent::BrowserAgentControlStarted {
                workspace_id: workspace_id.to_string(),
                surface_kind: surface.kind,
            },
        );
    }

    let d = surface.driver;
    let value = match call {
        PreviewCall::Status => PreviewValue::Status(d.status().await?),
        PreviewCall::Open { target } => {
            d.open(target).await?;
            PreviewValue::Unit
        }
        PreviewCall::Navigate { url } => {
            d.navigate(url).await?;
            PreviewValue::Unit
        }
        PreviewCall::Snapshot => PreviewValue::Snapshot(d.snapshot().await?),
        PreviewCall::Click { target } => {
            d.click(target).await?;
            PreviewValue::Unit
        }
        PreviewCall::Type { target, text } => {
            d.type_text(target, text).await?;
            PreviewValue::Unit
        }
        PreviewCall::Press { key } => {
            d.press(key).await?;
            PreviewValue::Unit
        }
        PreviewCall::Scroll { target, dx, dy } => {
            d.scroll(target, dx, dy).await?;
            PreviewValue::Unit
        }
        PreviewCall::Evaluate { script } => PreviewValue::Json(d.evaluate(script).await?),
        PreviewCall::WaitFor {
            condition,
            timeout_ms,
        } => {
            d.wait_for(condition, timeout_ms).await?;
            PreviewValue::Unit
        }
    };
    Ok(value)
}

/// Kill switch: clear control + tell the UI. Called by `preview_stop_agent_control`.
pub fn stop_agent_control<R: Runtime>(app: &AppHandle<R>, workspace_id: &str) {
    registry().clear_controlled(workspace_id);
    crate::ui_sync::publish(
        app,
        crate::ui_sync::UiMutationEvent::BrowserAgentControlEnded {
            workspace_id: workspace_id.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn dispatch_no_surface_is_structured_error() {
        let reg = SurfaceRegistry::new();
        let err = reg
            .resolve("ws-unknown")
            .err()
            .expect("unknown workspace must error");
        assert_eq!(err, crate::preview::PreviewError::NoSurface);
    }

    #[test]
    fn control_set_tracks_entry_and_exit() {
        let reg = SurfaceRegistry::new();
        assert!(!reg.is_controlled("ws1"));
        reg.mark_controlled("ws1");
        assert!(reg.is_controlled("ws1"));
        reg.clear_controlled("ws1");
        assert!(!reg.is_controlled("ws1"));
    }

    #[test]
    fn register_then_unregister_round_trips_resolution() {
        struct Dummy;
        #[async_trait::async_trait]
        impl crate::preview::PreviewDriver for Dummy {
            async fn status(&self) -> crate::preview::PreviewResult<crate::preview::PreviewStatus> {
                Ok(crate::preview::PreviewStatus {
                    surface_kind: crate::preview::PreviewSurfaceKind::Browser,
                    present: true,
                    url: None,
                    title: None,
                })
            }
            async fn open(&self, _t: String) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn navigate(&self, _u: String) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn snapshot(
                &self,
            ) -> crate::preview::PreviewResult<crate::preview::PreviewSnapshot> {
                unreachable!()
            }
            async fn click(
                &self,
                _t: crate::preview::PreviewTarget,
            ) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn type_text(
                &self,
                _t: crate::preview::PreviewTarget,
                _x: String,
            ) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn press(&self, _k: String) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn scroll(
                &self,
                _t: Option<crate::preview::PreviewTarget>,
                _dx: f64,
                _dy: f64,
            ) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
            async fn evaluate(
                &self,
                _s: String,
            ) -> crate::preview::PreviewResult<serde_json::Value> {
                Ok(serde_json::Value::Null)
            }
            async fn wait_for(
                &self,
                _c: crate::preview::WaitCondition,
                _t: u64,
            ) -> crate::preview::PreviewResult<()> {
                Ok(())
            }
        }
        let reg = SurfaceRegistry::new();
        reg.register(
            "ws1",
            RegisteredSurface {
                kind: PreviewSurfaceKind::Browser,
                driver: std::sync::Arc::new(Dummy),
            },
        );
        assert!(reg.resolve("ws1").is_ok());
        reg.unregister("ws1");
        assert_eq!(
            reg.resolve("ws1").err(),
            Some(crate::preview::PreviewError::NoSurface)
        );
    }
}
