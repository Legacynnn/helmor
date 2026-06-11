use std::sync::Mutex;

use sysinfo::{ProcessesToUpdate, System};

use super::tree::{classify, collect_descendants};
use super::types::{ProcessInfo, ProcessKind, ResourceSnapshot};

/// Persistent sysinfo handle. CPU% is a delta between two refreshes, so
/// the same `System` must live across polls — held in Tauri managed state.
pub struct ResourceSampler {
    system: Mutex<System>,
}

impl Default for ResourceSampler {
    fn default() -> Self {
        Self {
            system: Mutex::new(System::new()),
        }
    }
}

impl ResourceSampler {
    /// Snapshot the Helmor process tree (app -> sidecar -> agents ->
    /// children). Ports are filled in by the caller (commands layer)
    /// so this stays lsof-free and testable.
    pub fn snapshot(&self, sidecar_pid: Option<u32>) -> ResourceSnapshot {
        let app_pid = std::process::id();
        let mut system = match self.system.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        system.refresh_processes(ProcessesToUpdate::All, true);

        let pairs: Vec<(u32, Option<u32>)> = system
            .processes()
            .iter()
            .map(|(pid, proc_)| (pid.as_u32(), proc_.parent().map(|p| p.as_u32())))
            .collect();
        let tree = collect_descendants(app_pid, &pairs);

        let mut processes: Vec<ProcessInfo> = system
            .processes()
            .iter()
            .filter(|(pid, _)| tree.contains(&pid.as_u32()))
            .map(|(pid, proc_)| {
                let pid_u32 = pid.as_u32();
                let kind = classify(
                    proc_.name().to_string_lossy().as_ref(),
                    pid_u32,
                    app_pid,
                    sidecar_pid,
                );
                ProcessInfo {
                    pid: pid_u32,
                    parent_pid: proc_.parent().map(|p| p.as_u32()),
                    name: proc_.name().to_string_lossy().into_owned(),
                    cpu_percent: proc_.cpu_usage(),
                    memory_bytes: proc_.memory(),
                    start_time: proc_.start_time(),
                    workspace_id: None, // filled by attribution (commands layer)
                    kind,
                    killable: !matches!(kind, ProcessKind::App | ProcessKind::Sidecar),
                }
            })
            .collect();
        processes.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));

        ResourceSnapshot {
            total_cpu_percent: processes.iter().map(|p| p.cpu_percent).sum(),
            total_memory_bytes: processes.iter().map(|p| p.memory_bytes).sum(),
            processes,
            ports: Vec::new(),
            ports_unavailable: false,
        }
    }

    /// Process cwd by PID — used by attribution.
    pub fn process_cwd(&self, pid: u32) -> Option<std::path::PathBuf> {
        let system = self.system.lock().ok()?;
        system
            .process(sysinfo::Pid::from_u32(pid))
            .and_then(|p| p.cwd().map(|c| c.to_path_buf()))
    }

    /// Verify a PID still refers to the same process (start-time match)
    /// — guards kill against PID reuse.
    pub fn verify_identity(&self, pid: u32, start_time: u64) -> bool {
        let mut system = match self.system.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        system.refresh_processes(
            ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
            true,
        );
        system
            .process(sysinfo::Pid::from_u32(pid))
            .is_some_and(|p| p.start_time() == start_time)
    }
}
