//! Webview lifecycle for the integrated browser surface (Phase 0 ADR: Option A
//! — Tauri `unstable` child-webview embedded in the main window).
//!
//! A single content webview (label `browser-content`) is embedded inside the
//! main window via `Window::add_child`. The React chrome (URL bar, tab strip)
//! renders in the main webview around it; the `content-host.tsx` element
//! reports its on-screen rect to `set_bounds` so the child tracks the pane.
//!
//! The webview handle is held in a process-global `Mutex<Option<Webview>>` so
//! create/navigate/set_bounds/destroy can find it across commands without
//! threading Tauri state everywhere. `create` is idempotent: a second call
//! re-navigates and repositions the existing child instead of spawning a new
//! one (a window may hold only one webview per label).
//!
//! NOTE: the child-webview API is gated `all(desktop, feature = "unstable")`.
//! Everything here is desktop-only; on the (currently unsupported) mobile build
//! these calls would not compile, but Helmor ships desktop-only.

use std::sync::{Mutex, OnceLock};

use anyhow::{anyhow, Result};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};

/// Stable label for the embedded content webview.
pub const BROWSER_CONTENT_LABEL: &str = "browser-content";

/// A logical-pixel rectangle the content webview should occupy, in the main
/// window's coordinate space (origin top-left). Mirrors the host element's
/// `getBoundingClientRect()` reported from the frontend.
#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    fn position(&self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
    }

    fn size(&self) -> LogicalSize<f64> {
        // Guard against zero/negative sizes (e.g. a collapsed pane mid-layout)
        // — a non-positive size makes the platform webview reject the resize.
        LogicalSize::new(self.width.max(1.0), self.height.max(1.0))
    }
}

/// Process-global handle to the embedded content webview. `None` until the
/// surface mounts for the first time (or after `destroy`).
fn slot() -> &'static Mutex<Option<Webview>> {
    static SLOT: OnceLock<Mutex<Option<Webview>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Create the content webview at `rect` navigated to `url`, or — if it already
/// exists — navigate it to `url` and reposition it to `rect` (idempotent).
pub fn create(app: &AppHandle, url: &str, rect: Rect) -> Result<()> {
    {
        let guard = slot()
            .lock()
            .map_err(|_| anyhow!("browser content webview lock poisoned"))?;
        if let Some(webview) = guard.as_ref() {
            // Already embedded: just re-target + reposition.
            apply_navigate(webview, url)?;
            apply_bounds(webview, rect)?;
            return Ok(());
        }
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| anyhow!("no main window to embed the browser content webview in"))?;

    let parsed = url
        .parse()
        .map_err(|e| anyhow!("invalid browser url {url:?}: {e}"))?;
    let builder =
        tauri::webview::WebviewBuilder::new(BROWSER_CONTENT_LABEL, WebviewUrl::External(parsed))
            // Bridge placeholder — Phase 3 injects the inspector bridge here.
            .initialization_script("/* helmor browser bridge placeholder */");

    let webview = window
        .add_child(builder, rect.position(), rect.size())
        .map_err(|e| anyhow!("failed to embed browser content webview: {e}"))?;

    let mut guard = slot()
        .lock()
        .map_err(|_| anyhow!("browser content webview lock poisoned"))?;
    *guard = Some(webview);
    Ok(())
}

/// Navigate the embedded content webview to `url`. No-op error if not created.
pub fn navigate(_app: &AppHandle, url: &str) -> Result<()> {
    let guard = slot()
        .lock()
        .map_err(|_| anyhow!("browser content webview lock poisoned"))?;
    let webview = guard
        .as_ref()
        .ok_or_else(|| anyhow!("browser content webview not created"))?;
    apply_navigate(webview, url)
}

/// Reposition/resize the embedded content webview to track the pane rect.
pub fn set_bounds(_app: &AppHandle, rect: Rect) -> Result<()> {
    let guard = slot()
        .lock()
        .map_err(|_| anyhow!("browser content webview lock poisoned"))?;
    let webview = guard
        .as_ref()
        .ok_or_else(|| anyhow!("browser content webview not created"))?;
    apply_bounds(webview, rect)
}

/// Tear down the embedded content webview, releasing the platform layer.
/// Idempotent: a no-op when nothing is embedded.
pub fn destroy(_app: &AppHandle) -> Result<()> {
    let mut guard = slot()
        .lock()
        .map_err(|_| anyhow!("browser content webview lock poisoned"))?;
    if let Some(webview) = guard.take() {
        webview
            .close()
            .map_err(|e| anyhow!("failed to close browser content webview: {e}"))?;
    }
    Ok(())
}

fn apply_navigate(webview: &Webview, url: &str) -> Result<()> {
    let parsed = url
        .parse()
        .map_err(|e| anyhow!("invalid browser url {url:?}: {e}"))?;
    webview
        .navigate(parsed)
        .map_err(|e| anyhow!("failed to navigate browser content webview: {e}"))
}

fn apply_bounds(webview: &Webview, rect: Rect) -> Result<()> {
    webview
        .set_position(rect.position())
        .map_err(|e| anyhow!("failed to position browser content webview: {e}"))?;
    webview
        .set_size(rect.size())
        .map_err(|e| anyhow!("failed to size browser content webview: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rect_size_clamps_non_positive_dimensions() {
        let r = Rect {
            x: 10.0,
            y: 20.0,
            width: 0.0,
            height: -5.0,
        };
        let size = r.size();
        assert_eq!(size.width, 1.0);
        assert_eq!(size.height, 1.0);
    }

    #[test]
    fn rect_position_preserves_origin() {
        let r = Rect {
            x: 12.0,
            y: 34.0,
            width: 100.0,
            height: 200.0,
        };
        let pos = r.position();
        assert_eq!(pos.x, 12.0);
        assert_eq!(pos.y, 34.0);
    }
}
