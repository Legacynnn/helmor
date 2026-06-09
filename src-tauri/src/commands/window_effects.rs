//! Native window translucency for the "Vesper" theme.
//!
//! The blur is a macOS `NSVisualEffectView` inserted behind the webview by the
//! `window-vibrancy` crate — the window server composites it for free, which is
//! far cheaper than a CSS `backdrop-filter` over the whole chrome. The frontend
//! (`use-vesper-window.ts`) drives these commands: it applies vibrancy when
//! Vesper becomes the active theme, and clears it when switching away or when
//! the window enters fullscreen (where the material otherwise falls back to a
//! green/black cast because there is no desktop behind a fullscreen space).
//!
//! Off macOS both commands are no-ops so the IPC surface stays identical and
//! Vesper degrades to a plain opaque dark theme.

use super::common::CmdResult;
use tauri::Window;

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_window_vibrancy(window: Window) -> CmdResult<()> {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

    // `HudWindow` is a dark, balanced-translucency material that reads as glass
    // without washing out text. `Active` keeps the blur lit even when the window
    // loses focus. Radius `None` lets the window's native rounded corners clip
    // the effect view, avoiding double-rounded corner artifacts.
    apply_vibrancy(
        &window,
        NSVisualEffectMaterial::HudWindow,
        Some(NSVisualEffectState::Active),
        None,
    )
    .map_err(|err| anyhow::anyhow!("failed to apply window vibrancy: {err}"))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_window_vibrancy(_window: Window) -> CmdResult<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn clear_window_vibrancy(window: Window) -> CmdResult<()> {
    use window_vibrancy::clear_vibrancy;

    // A `false` result just means no effect view was present — not an error.
    clear_vibrancy(&window)
        .map_err(|err| anyhow::anyhow!("failed to clear window vibrancy: {err}"))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn clear_window_vibrancy(_window: Window) -> CmdResult<()> {
    Ok(())
}
