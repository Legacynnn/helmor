//! Tauri command handlers for the simulator preview surface.
//!
//! Device listing/boot/screenshot run through the injected `CommandExecutor`
//! (the real `ProcessExecutor` in production); the pure parsing lives in
//! `list_devices_inner` so it is unit-testable without spawning a process. The
//! surface-lifecycle commands open/close the process-global simulator slot and
//! register a `SimulatorDriver` into the agent-control broker registry so
//! `preview.*` host calls resolve it (mirroring `browser::create`).

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::common::{run_blocking, CmdResult};
use crate::preview::broker::{registry, RegisteredSurface};
use crate::preview::driver::PreviewSurfaceKind;
use crate::preview::simulator_driver::{
    CommandExecutor, ProcessExecutor, SimCommand, SimulatorDriver,
};

/// A simulator device the user can preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimDevice {
    pub udid: String,
    pub name: String,
    pub booted: bool,
}

/// Parse the device list for `kind` from the executor's output. Pure over the
/// injected executor — no process spawn here.
pub fn list_devices_inner(
    kind: PreviewSurfaceKind,
    executor: &dyn CommandExecutor,
) -> anyhow::Result<Vec<SimDevice>> {
    match kind {
        PreviewSurfaceKind::SimulatorIos => {
            let out = executor
                .run(&SimCommand::ios_list_devices())
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            parse_ios_devices(&String::from_utf8_lossy(&out.stdout))
        }
        PreviewSurfaceKind::SimulatorAndroid => {
            let out = executor
                .run(&SimCommand::adb_devices())
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            Ok(parse_android_devices(&String::from_utf8_lossy(&out.stdout)))
        }
        PreviewSurfaceKind::Browser => Ok(Vec::new()),
    }
}

/// Parse `xcrun simctl list devices --json` into a flat device list.
fn parse_ios_devices(json: &str) -> anyhow::Result<Vec<SimDevice>> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    let mut devices = Vec::new();
    if let Some(runtimes) = value.get("devices").and_then(|d| d.as_object()) {
        for entries in runtimes.values() {
            if let Some(arr) = entries.as_array() {
                for d in arr {
                    let udid = d.get("udid").and_then(|v| v.as_str()).unwrap_or_default();
                    let name = d.get("name").and_then(|v| v.as_str()).unwrap_or_default();
                    let booted = d.get("state").and_then(|v| v.as_str()) == Some("Booted");
                    if udid.is_empty() {
                        continue;
                    }
                    devices.push(SimDevice {
                        udid: udid.to_string(),
                        name: name.to_string(),
                        booted,
                    });
                }
            }
        }
    }
    Ok(devices)
}

/// Parse `adb devices` table lines into a flat device list. The serial is both
/// the udid and the name; `device` state means booted.
fn parse_android_devices(table: &str) -> Vec<SimDevice> {
    table
        .lines()
        .skip(1) // "List of devices attached" header
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut cols = line.split_whitespace();
            let serial = cols.next()?;
            let state = cols.next().unwrap_or("");
            Some(SimDevice {
                udid: serial.to_string(),
                name: serial.to_string(),
                booted: state == "device",
            })
        })
        .collect()
}

#[tauri::command]
pub async fn simulator_list_devices(kind: PreviewSurfaceKind) -> CmdResult<Vec<SimDevice>> {
    run_blocking(move || list_devices_inner(kind, &ProcessExecutor)).await
}

#[tauri::command]
pub async fn simulator_boot(udid: String) -> CmdResult<()> {
    run_blocking(move || {
        ProcessExecutor
            .run(&SimCommand::ios_boot(&udid))
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn simulator_screenshot() -> CmdResult<String> {
    run_blocking(move || {
        let surface = crate::simulator::current()
            .ok_or_else(|| anyhow::anyhow!("no simulator surface is open"))?;
        capture_screenshot_path(surface.kind, &surface.udid)
    })
    .await
}

/// Capture a screenshot of the booted device and persist it to the paste-cache,
/// returning the absolute path.
fn capture_screenshot_path(kind: PreviewSurfaceKind, udid: &str) -> anyhow::Result<String> {
    match kind {
        PreviewSurfaceKind::SimulatorIos => {
            let tmp = std::env::temp_dir().join(format!("helmor-sim-{}.png", uuid::Uuid::new_v4()));
            let tmp_str = tmp.to_string_lossy().to_string();
            ProcessExecutor
                .run(&SimCommand::ios_screenshot(&tmp_str))
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            let bytes = std::fs::read(&tmp)?;
            let _ = std::fs::remove_file(&tmp);
            crate::browser::capture::save_simulator_png(udid, &bytes)
        }
        PreviewSurfaceKind::SimulatorAndroid => {
            let out = ProcessExecutor
                .run(&SimCommand::adb_screencap())
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            crate::browser::capture::save_simulator_png(udid, &out.stdout)
        }
        PreviewSurfaceKind::Browser => Err(anyhow::anyhow!("not a simulator surface")),
    }
}

#[tauri::command]
pub async fn simulator_open_surface(
    workspace_id: String,
    kind: PreviewSurfaceKind,
    udid: String,
) -> CmdResult<()> {
    crate::simulator::open_surface(&workspace_id, kind, &udid)?;
    // Register a SimulatorDriver into the agent-control registry so the broker
    // resolves this surface for `preview.*` host calls (PRD D7).
    registry().register(
        &workspace_id,
        RegisteredSurface {
            kind,
            driver: Arc::new(SimulatorDriver::new(kind, udid, Arc::new(ProcessExecutor))),
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn simulator_close_surface(workspace_id: String) -> CmdResult<()> {
    crate::simulator::close_surface(&workspace_id)?;
    registry().unregister(&workspace_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preview::simulator_driver::FakeExecutor;

    #[test]
    fn list_devices_parses_ios_json() {
        let json = r#"{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-17-0":[
          {"udid":"UDID-1","name":"iPhone 15","state":"Booted"},
          {"udid":"UDID-2","name":"iPhone SE","state":"Shutdown"}]}}"#;
        let fake = FakeExecutor::new()
            .with_response("xcrun simctl list devices --json", json.as_bytes().to_vec());
        let devices = list_devices_inner(PreviewSurfaceKind::SimulatorIos, &fake).unwrap();
        assert_eq!(devices.iter().filter(|d| d.booted).count(), 1);
        assert_eq!(devices[0].udid, "UDID-1");
    }

    #[test]
    fn list_devices_parses_android_table() {
        let table = "List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n";
        let fake = FakeExecutor::new().with_response("adb devices", table.as_bytes().to_vec());
        let devices = list_devices_inner(PreviewSurfaceKind::SimulatorAndroid, &fake).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].udid, "emulator-5554");
        assert!(devices[0].booted);
        assert!(!devices[1].booted);
    }
}
