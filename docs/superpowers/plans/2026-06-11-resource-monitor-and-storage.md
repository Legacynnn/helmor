# Resource Monitor Widget + Storage Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar footer widget showing Helmor-tree CPU/RAM with a detail popover (process tree, PIDs, ports, per-workspace usage, kill actions), plus a Storage settings page (disk breakdown, dead-workspace cleanup, process hygiene, maintenance, auto-cleanup policy).

**Architecture:** Frontend polls a cheap `get_resource_snapshot` Tauri command every 2s (React Query `refetchInterval`); a persistent `sysinfo::System` in Tauri managed state keeps CPU% deltas accurate. Storage scans are a separate on-demand command. Mutations (kill/cleanup) publish a new `StorageChanged` UiMutationEvent. Spec: `docs/superpowers/specs/2026-06-11-resource-monitor-and-storage-design.md`.

**Tech Stack:** Rust (Tauri v2, `sysinfo` crate, `lsof` parsing on macOS), React 19 + TanStack Query, shadcn Popover, Vitest, cargo test.

**Conventions that apply to every task:** Biome tab indent; all Rust passes `cargo clippy --all-targets -- -D warnings`; serde `rename_all = "camelCase"` on every IPC type; files < 300 lines (split if growing); every custom clickable element gets `cursor-pointer`.

---

## Shared type contract (referenced by all tasks)

Rust (`src-tauri/src/resources/types.rs`) ⇄ TypeScript (`src/lib/api.ts`):

| Rust | TS field | Notes |
|---|---|---|
| `ResourceSnapshot { total_cpu_percent: f32, total_memory_bytes: u64, processes: Vec<ProcessInfo>, ports: Vec<PortInfo>, ports_unavailable: bool }` | `totalCpuPercent`, `totalMemoryBytes`, `processes`, `ports`, `portsUnavailable` | Helmor tree aggregate |
| `ProcessInfo { pid: u32, parent_pid: Option<u32>, name: String, cpu_percent: f32, memory_bytes: u64, start_time: u64, workspace_id: Option<String>, kind: ProcessKind, killable: bool }` | camelCase mirror | `start_time` = unix seconds |
| `ProcessKind` enum: `App, Sidecar, Agent, DevServer, Shell, Other` | `"app" \| "sidecar" \| "agent" \| "devServer" \| "shell" \| "other"` | `rename_all = "camelCase"` on enum |
| `PortInfo { port: u16, pid: Option<u32>, process_name: Option<String>, workspace_id: Option<String> }` | camelCase mirror | |
| `StorageBreakdown { total_bytes: u64, db_bytes: u64, logs_bytes: u64, chats_bytes: u64, workspaces: Vec<WorkspaceStorage> }` | camelCase mirror | |
| `WorkspaceStorage { id: String, name: String, branch: Option<String>, state: String, size_bytes: Option<u64>, dir_present: bool, reclaimable: bool }` | camelCase mirror | `reclaimable` = archived/dead + dir present |

---

### Task 1: Backend scaffolding — sysinfo dep, `resources` module, types, sidecar PID accessor

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/resources/mod.rs`
- Create: `src-tauri/src/resources/types.rs`
- Modify: `src-tauri/src/lib.rs` (module declaration)
- Modify: `src-tauri/src/sidecar.rs` (PID accessor on `ManagedSidecar`)

- [ ] **Step 1: Add sysinfo to Cargo.toml**

In `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
sysinfo = "0.33"
```

Run: `cd src-tauri && cargo fetch` — confirm it resolves. If the latest published API differs from what Tasks 2–3 use (`refresh_processes`, `ProcessesToUpdate::All`, `process.cpu_usage()`, `.memory()`, `.parent()`, `.start_time()`, `.cwd()`, `.name()`), check `cargo doc` and adapt call sites, not the architecture.

- [ ] **Step 2: Write failing test for types serialization**

Create `src-tauri/src/resources/types.rs`:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessKind {
    App,
    Sidecar,
    Agent,
    DevServer,
    Shell,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub start_time: u64,
    pub workspace_id: Option<String>,
    pub kind: ProcessKind,
    pub killable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    pub total_cpu_percent: f32,
    pub total_memory_bytes: u64,
    pub processes: Vec<ProcessInfo>,
    pub ports: Vec<PortInfo>,
    pub ports_unavailable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStorage {
    pub id: String,
    pub name: String,
    pub branch: Option<String>,
    pub state: String,
    pub size_bytes: Option<u64>,
    pub dir_present: bool,
    pub reclaimable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBreakdown {
    pub total_bytes: u64,
    pub db_bytes: u64,
    pub logs_bytes: u64,
    pub chats_bytes: u64,
    pub workspaces: Vec<WorkspaceStorage>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_kind_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&ProcessKind::DevServer).unwrap(),
            "\"devServer\""
        );
    }

    #[test]
    fn snapshot_fields_serialize_camel_case() {
        let snap = ResourceSnapshot {
            total_cpu_percent: 1.5,
            total_memory_bytes: 1024,
            processes: vec![],
            ports: vec![],
            ports_unavailable: false,
        };
        let json = serde_json::to_value(&snap).unwrap();
        assert!(json.get("totalCpuPercent").is_some());
        assert!(json.get("portsUnavailable").is_some());
        assert!(json.get("total_cpu_percent").is_none());
    }
}
```

Create `src-tauri/src/resources/mod.rs`:

```rust
pub mod types;
```

In `src-tauri/src/lib.rs`, next to the other module declarations (e.g. near `mod sidecar;`):

```rust
mod resources;
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test resources::types`
Expected: PASS (2 tests). (These pass on first write — serialization tests gate against future serde drift, same pattern as `ui_sync/events.rs` tests.)

- [ ] **Step 4: Add PID accessor to ManagedSidecar**

In `src-tauri/src/sidecar.rs`, add a public method to `impl ManagedSidecar` (the struct at ~line 349 holds `process: Mutex<Option<SidecarProcess>>`; `SidecarProcess.child.id()` is the PID, see the private `pid()` at ~line 276):

```rust
/// PID of the running sidecar process, if one is alive. Used by the
/// resource monitor to anchor the Helmor process tree.
pub fn current_pid(&self) -> Option<u32> {
    self.process
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|p| p.child.id()))
}
```

- [ ] **Step 5: Verify compile + clippy, commit**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: clean (a `dead_code` warning on `current_pid` is possible until Task 3 uses it — if so, add `#[allow(dead_code)] // consumed by resources::sampler (Task 3)` and remove it in Task 3).

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/resources/ src-tauri/src/lib.rs src-tauri/src/sidecar.rs
git commit -m "feat(resources): scaffolding — sysinfo dep, types module, sidecar PID accessor"
```

---

### Task 2: Process tree collection + kind classification (pure functions, TDD)

**Files:**
- Create: `src-tauri/src/resources/tree.rs`
- Modify: `src-tauri/src/resources/mod.rs`

- [ ] **Step 1: Write failing tests**

Create `src-tauri/src/resources/tree.rs` with tests first:

```rust
use std::collections::{HashMap, HashSet};

use super::types::ProcessKind;

/// Collect `root` plus all transitive children from (pid, parent_pid) pairs.
pub fn collect_descendants(root: u32, pairs: &[(u32, Option<u32>)]) -> HashSet<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, parent) in pairs {
        if let Some(parent) = parent {
            children.entry(*parent).or_default().push(*pid);
        }
    }
    let mut out = HashSet::new();
    let mut stack = vec![root];
    while let Some(pid) = stack.pop() {
        if out.insert(pid) {
            if let Some(kids) = children.get(&pid) {
                stack.extend(kids.iter().copied());
            }
        }
    }
    out
}

/// Classify a process by executable name. `app_pid` / `sidecar_pid`
/// override name-based rules.
pub fn classify(name: &str, pid: u32, app_pid: u32, sidecar_pid: Option<u32>) -> ProcessKind {
    if pid == app_pid {
        return ProcessKind::App;
    }
    if Some(pid) == sidecar_pid {
        return ProcessKind::Sidecar;
    }
    let lower = name.to_ascii_lowercase();
    if lower.contains("claude") || lower.contains("codex") {
        ProcessKind::Agent
    } else if ["node", "bun", "deno", "vite"]
        .iter()
        .any(|n| lower == *n || lower.starts_with(&format!("{n} ")))
    {
        ProcessKind::DevServer
    } else if ["zsh", "bash", "fish", "sh"].contains(&lower.as_str()) {
        ProcessKind::Shell
    } else {
        ProcessKind::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_root_and_transitive_children() {
        // 1 -> 2 -> 4, 1 -> 3; 99 unrelated
        let pairs = vec![
            (2, Some(1)),
            (3, Some(1)),
            (4, Some(2)),
            (99, Some(50)),
        ];
        let tree = collect_descendants(1, &pairs);
        assert_eq!(tree, HashSet::from([1, 2, 3, 4]));
    }

    #[test]
    fn handles_cycles_without_hanging() {
        let pairs = vec![(2, Some(1)), (1, Some(2))];
        let tree = collect_descendants(1, &pairs);
        assert_eq!(tree, HashSet::from([1, 2]));
    }

    #[test]
    fn classifies_by_pid_overrides_first() {
        assert_eq!(classify("node", 10, 10, None), ProcessKind::App);
        assert_eq!(classify("bun", 11, 10, Some(11)), ProcessKind::Sidecar);
    }

    #[test]
    fn classifies_by_name() {
        assert_eq!(classify("claude", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("codex", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("node", 5, 1, None), ProcessKind::DevServer);
        assert_eq!(classify("fish", 5, 1, None), ProcessKind::Shell);
        assert_eq!(classify("anything", 5, 1, None), ProcessKind::Other);
    }
}
```

Add to `src-tauri/src/resources/mod.rs`:

```rust
pub mod tree;
pub mod types;
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test resources::tree`
Expected: PASS (4 tests). If `collect_descendants` were written wrong, the cycle test hangs — keep it.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/
git commit -m "feat(resources): process tree collection and kind classification"
```

---

### Task 3: Sampler — persistent sysinfo System + snapshot of Helmor tree

**Files:**
- Create: `src-tauri/src/resources/sampler.rs`
- Modify: `src-tauri/src/resources/mod.rs`

No unit test for the sysinfo integration itself (live-system dependent); the pure logic was tested in Task 2. The command smoke test lands in Task 7.

- [ ] **Step 1: Implement sampler**

Create `src-tauri/src/resources/sampler.rs`:

```rust
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
        system.refresh_processes(ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]), true);
        system
            .process(sysinfo::Pid::from_u32(pid))
            .is_some_and(|p| p.start_time() == start_time)
    }
}
```

Update `src-tauri/src/resources/mod.rs`:

```rust
pub mod sampler;
pub mod tree;
pub mod types;
```

- [ ] **Step 2: Compile + clippy**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: clean. Adapt sysinfo 0.33 API names if the compiler disagrees (`name()` returns `&OsStr` in 0.33 — the `.to_string_lossy()` calls above assume that; if it returns `&str` in the resolved version, drop the conversion).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/
git commit -m "feat(resources): sysinfo sampler with persistent System and PID identity check"
```

---

### Task 4: Ports — lsof parser (TDD) + collector

**Files:**
- Create: `src-tauri/src/resources/ports.rs`
- Modify: `src-tauri/src/resources/mod.rs`

- [ ] **Step 1: Write failing parser tests + implementation**

Create `src-tauri/src/resources/ports.rs`:

```rust
use std::collections::HashSet;
use std::process::Command;

use super::types::PortInfo;

/// Parse `lsof -iTCP -sTCP:LISTEN -P -n` output into (pid, port) pairs.
/// Sample line:
/// `node    48121 dan   23u  IPv4 0x1a2b  0t0  TCP 127.0.0.1:3000 (LISTEN)`
pub fn parse_lsof(output: &str) -> Vec<(u32, u16)> {
    let mut out = Vec::new();
    for line in output.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 9 || !line.contains("(LISTEN)") {
            continue;
        }
        let Ok(pid) = cols[1].parse::<u32>() else {
            continue;
        };
        // NAME col like `127.0.0.1:3000` or `*:3000` or `[::1]:8080`
        let Some(name) = cols.get(8) else { continue };
        let Some(port_str) = name.rsplit(':').next() else {
            continue;
        };
        if let Ok(port) = port_str.parse::<u16>() {
            out.push((pid, port));
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Listening ports owned by tree PIDs, or falling inside any allocated
/// workspace range. `ranges` = (workspace_id, base, count).
pub fn filter_ports(
    listened: &[(u32, u16)],
    tree_pids: &HashSet<u32>,
    pid_names: &[(u32, String)],
    pid_workspaces: &[(u32, Option<String>)],
    ranges: &[(String, u16, u16)],
) -> Vec<PortInfo> {
    let range_owner = |port: u16| -> Option<String> {
        ranges
            .iter()
            .find(|(_, base, count)| port >= *base && port < base + count)
            .map(|(id, _, _)| id.clone())
    };
    listened
        .iter()
        .filter_map(|(pid, port)| {
            let in_tree = tree_pids.contains(pid);
            let ws_from_range = range_owner(*port);
            if !in_tree && ws_from_range.is_none() {
                return None;
            }
            let process_name = pid_names
                .iter()
                .find(|(p, _)| p == pid)
                .map(|(_, n)| n.clone());
            let workspace_id = pid_workspaces
                .iter()
                .find(|(p, _)| p == pid)
                .and_then(|(_, w)| w.clone())
                .or(ws_from_range);
            Some(PortInfo {
                port: *port,
                pid: if in_tree { Some(*pid) } else { None },
                process_name,
                workspace_id,
            })
        })
        .collect()
}

/// Run lsof. Err => caller sets `ports_unavailable: true`.
pub fn list_listening_ports() -> anyhow::Result<Vec<(u32, u16)>> {
    let output = Command::new("lsof")
        .args(["-iTCP", "-sTCP:LISTEN", "-P", "-n"])
        .output()?;
    // lsof exits 1 when nothing matches — only stdout matters.
    Ok(parse_lsof(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    48121   dan   23u  IPv4 0x1a2b      0t0  TCP 127.0.0.1:3000 (LISTEN)
node    48121   dan   24u  IPv6 0x1a2c      0t0  TCP [::1]:3000 (LISTEN)
bun     50001   dan   11u  IPv4 0x9f00      0t0  TCP *:55100 (LISTEN)
Spotify   902   dan   88u  IPv4 0x0001      0t0  TCP 127.0.0.1:57621 (LISTEN)
weird     903   dan   88u  IPv4 0x0002      0t0  TCP 1.2.3.4:443->5.6.7.8:1 (ESTABLISHED)
";

    #[test]
    fn parses_listen_lines_and_dedups() {
        let pairs = parse_lsof(SAMPLE);
        assert_eq!(pairs, vec![(902, 57621), (48121, 3000), (50001, 55100)]);
    }

    #[test]
    fn ignores_non_listen_and_garbage() {
        assert!(parse_lsof("COMMAND PID\ngarbage line\n").is_empty());
    }

    #[test]
    fn filter_keeps_tree_pids_and_range_ports_only() {
        let listened = vec![(902, 57621), (48121, 3000), (50001, 55100)];
        let tree: HashSet<u32> = HashSet::from([48121]);
        let names = vec![(48121, "node".to_string())];
        let pid_ws = vec![(48121, Some("ws1".to_string()))];
        let ranges = vec![("ws2".to_string(), 55100, 10)];
        let ports = filter_ports(&listened, &tree, &names, &pid_ws, &ranges);
        assert_eq!(ports.len(), 2);
        let p3000 = ports.iter().find(|p| p.port == 3000).unwrap();
        assert_eq!(p3000.workspace_id.as_deref(), Some("ws1"));
        assert_eq!(p3000.pid, Some(48121));
        let p55100 = ports.iter().find(|p| p.port == 55100).unwrap();
        assert_eq!(p55100.workspace_id.as_deref(), Some("ws2"));
        assert_eq!(p55100.pid, None); // 50001 not in tree
        assert!(!ports.iter().any(|p| p.port == 57621)); // Spotify dropped
    }
}
```

Add `pub mod ports;` to `src-tauri/src/resources/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test resources::ports`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/
git commit -m "feat(resources): lsof parsing and Helmor-scoped port filtering"
```

---

### Task 5: Attribution — PID cwd → workspace (TDD)

**Files:**
- Create: `src-tauri/src/resources/attribution.rs`
- Modify: `src-tauri/src/resources/mod.rs`

- [ ] **Step 1: Write tests + implementation**

Create `src-tauri/src/resources/attribution.rs`:

```rust
use std::path::Path;

/// Map a process cwd to a workspace id. `workspace_dirs` =
/// (workspace_id, absolute dir). Longest-prefix match wins so nested
/// checkout dirs don't mis-attribute.
pub fn workspace_for_cwd(
    cwd: Option<&Path>,
    workspace_dirs: &[(String, std::path::PathBuf)],
) -> Option<String> {
    let cwd = cwd?;
    workspace_dirs
        .iter()
        .filter(|(_, dir)| cwd.starts_with(dir))
        .max_by_key(|(_, dir)| dir.components().count())
        .map(|(id, _)| id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dirs() -> Vec<(String, PathBuf)> {
        vec![
            ("ws1".into(), PathBuf::from("/data/workspaces/alpha")),
            ("ws2".into(), PathBuf::from("/data/workspaces/alpha-two")),
        ]
    }

    #[test]
    fn matches_cwd_inside_workspace() {
        let got = workspace_for_cwd(Some(Path::new("/data/workspaces/alpha/src")), &dirs());
        assert_eq!(got.as_deref(), Some("ws1"));
    }

    #[test]
    fn sibling_prefix_does_not_leak() {
        // `/alpha-two` must not match workspace `/alpha` (starts_with is
        // component-wise on Path, so this guards against string matching).
        let got = workspace_for_cwd(Some(Path::new("/data/workspaces/alpha-two/x")), &dirs());
        assert_eq!(got.as_deref(), Some("ws2"));
    }

    #[test]
    fn none_when_outside_all_workspaces() {
        assert_eq!(workspace_for_cwd(Some(Path::new("/tmp")), &dirs()), None);
        assert_eq!(workspace_for_cwd(None, &dirs()), None);
    }
}
```

Add `pub mod attribution;` to `src-tauri/src/resources/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test resources::attribution`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/
git commit -m "feat(resources): cwd-based workspace attribution"
```

---

### Task 6: Storage breakdown (TDD over tempdir)

**Files:**
- Create: `src-tauri/src/resources/storage.rs`
- Modify: `src-tauri/src/resources/mod.rs`

- [ ] **Step 1: Write tests + implementation**

Create `src-tauri/src/resources/storage.rs`:

```rust
use std::fs;
use std::path::Path;

use anyhow::Result;

use super::types::{StorageBreakdown, WorkspaceStorage};

/// Recursive dir size; symlinks not followed. Errors on individual
/// entries are skipped (size degrades, never fails the scan).
pub fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let Ok(meta) = entry.metadata() else { return 0 };
            if meta.is_dir() {
                dir_size(&entry.path())
            } else if meta.is_file() {
                meta.len()
            } else {
                0
            }
        })
        .sum()
}

/// Row from the workspaces table the breakdown needs.
pub struct WorkspaceRow {
    pub id: String,
    pub directory_name: String,
    pub state: String,
    pub branch: Option<String>,
}

/// Pure assembly: takes pre-fetched DB rows + on-disk roots so tests
/// run against a tempdir with no DB.
pub fn build_breakdown(
    rows: &[WorkspaceRow],
    workspaces_dir: &Path,
    db_path: &Path,
    logs_dir: &Path,
    chats_dir: &Path,
) -> StorageBreakdown {
    let workspaces: Vec<WorkspaceStorage> = rows
        .iter()
        .map(|row| {
            let dir = workspaces_dir.join(&row.directory_name);
            let dir_present = dir.is_dir();
            let size_bytes = dir_present.then(|| dir_size(&dir));
            let archived = row.state == "archived";
            WorkspaceStorage {
                id: row.id.clone(),
                name: row.directory_name.clone(),
                branch: row.branch.clone(),
                state: if dir_present { row.state.clone() } else { "dead".into() },
                size_bytes,
                dir_present,
                reclaimable: dir_present && archived,
            }
        })
        .collect();

    let db_bytes = fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    let logs_bytes = dir_size(logs_dir);
    let chats_bytes = dir_size(chats_dir);
    let workspace_bytes: u64 = workspaces.iter().filter_map(|w| w.size_bytes).sum();

    StorageBreakdown {
        total_bytes: db_bytes + logs_bytes + chats_bytes + workspace_bytes,
        db_bytes,
        logs_bytes,
        chats_bytes,
        workspaces,
    }
}

/// Full scan against the live data dir + DB. Wrap in `spawn_blocking`
/// at the command layer — this walks the disk.
pub fn storage_breakdown() -> Result<StorageBreakdown> {
    let connection = crate::models::db::read_conn()?;
    let mut statement =
        connection.prepare("SELECT id, directory_name, state, branch FROM workspaces")?;
    let rows: Vec<WorkspaceRow> = statement
        .query_map([], |row| {
            Ok(WorkspaceRow {
                id: row.get(0)?,
                directory_name: row.get(1)?,
                state: row.get(2)?,
                branch: row.get(3)?,
            })
        })?
        .flatten()
        .collect();
    Ok(build_breakdown(
        &rows,
        &crate::data_dir::workspaces_dir()?,
        &crate::data_dir::db_path()?,
        &crate::data_dir::logs_dir()?,
        &crate::data_dir::data_dir()?.join("chats"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    #[test]
    fn breakdown_sums_components_and_flags_states() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("workspaces/alive/file.txt"), 100);
        write(&root.join("workspaces/old/file.txt"), 50);
        write(&root.join("helmor.db"), 10);
        write(&root.join("logs/a.jsonl"), 5);
        write(&root.join("chats/c.json"), 3);

        let rows = vec![
            WorkspaceRow {
                id: "w1".into(),
                directory_name: "alive".into(),
                state: "ready".into(),
                branch: Some("main".into()),
            },
            WorkspaceRow {
                id: "w2".into(),
                directory_name: "old".into(),
                state: "archived".into(),
                branch: None,
            },
            WorkspaceRow {
                id: "w3".into(),
                directory_name: "gone".into(),
                state: "ready".into(),
                branch: None,
            },
        ];
        let b = build_breakdown(
            &rows,
            &root.join("workspaces"),
            &root.join("helmor.db"),
            &root.join("logs"),
            &root.join("chats"),
        );
        assert_eq!(b.db_bytes, 10);
        assert_eq!(b.logs_bytes, 5);
        assert_eq!(b.chats_bytes, 3);
        assert_eq!(b.total_bytes, 10 + 5 + 3 + 150);

        let w1 = b.workspaces.iter().find(|w| w.id == "w1").unwrap();
        assert!(!w1.reclaimable);
        assert_eq!(w1.size_bytes, Some(100));

        let w2 = b.workspaces.iter().find(|w| w.id == "w2").unwrap();
        assert!(w2.reclaimable); // archived + dir present

        let w3 = b.workspaces.iter().find(|w| w.id == "w3").unwrap();
        assert_eq!(w3.state, "dead"); // dir missing
        assert_eq!(w3.size_bytes, None);
        assert!(!w3.reclaimable);
    }

    #[test]
    fn dir_size_missing_dir_is_zero() {
        assert_eq!(dir_size(Path::new("/nonexistent/helmor-test")), 0);
    }
}
```

If `tempfile` is not already a dev-dependency in `src-tauri/Cargo.toml`, add under `[dev-dependencies]`: `tempfile = "3"`.

Verify the SQL column names against `src-tauri/src/schema.rs` (`workspaces` table: `id`, `directory_name`, `state`, `branch`) — adjust the query if schema differs.

Add `pub mod storage;` to `src-tauri/src/resources/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test resources::storage`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/ src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(resources): storage breakdown with dead/reclaimable workspace detection"
```

---

### Task 7: Cleanup actions (TDD over tempdir) + kill

**Files:**
- Create: `src-tauri/src/resources/cleanup.rs`
- Modify: `src-tauri/src/resources/mod.rs`

- [ ] **Step 1: Write tests + implementation**

Create `src-tauri/src/resources/cleanup.rs`:

```rust
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

use anyhow::{bail, Context, Result};
use sysinfo::{ProcessesToUpdate, System};

/// Delete a workspace's directory. DB rows are untouched — the caller
/// flips workspace state to `archived` afterwards.
pub fn delete_workspace_dir(workspaces_dir: &Path, directory_name: &str) -> Result<u64> {
    // Refuse anything that could escape the workspaces root.
    if directory_name.is_empty()
        || directory_name.contains('/')
        || directory_name.contains("..")
    {
        bail!("invalid workspace directory name: {directory_name}");
    }
    let dir = workspaces_dir.join(directory_name);
    if !dir.is_dir() {
        return Ok(0);
    }
    let freed = super::storage::dir_size(&dir);
    fs::remove_dir_all(&dir)
        .with_context(|| format!("Failed to delete workspace dir {}", dir.display()))?;
    Ok(freed)
}

/// Delete log files older than `days`. Returns bytes freed.
pub fn clear_logs(logs_dir: &Path, days: u64) -> Result<u64> {
    let cutoff = SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60);
    let mut freed = 0u64;
    let Ok(entries) = fs::read_dir(logs_dir) else {
        return Ok(0);
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if modified < cutoff {
            freed += meta.len();
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(freed)
}

/// VACUUM the SQLite DB; returns bytes reclaimed (size before - after).
pub fn vacuum_db() -> Result<u64> {
    let db_path = crate::data_dir::db_path()?;
    let before = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let connection = crate::models::db::write_conn()?;
    connection.execute_batch("VACUUM;")?;
    let after = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    Ok(before.saturating_sub(after))
}

/// SIGTERM `pid` and all descendants after verifying identity via
/// `start_time` (PID-reuse guard). Refuses the app and sidecar PIDs.
pub fn kill_process_tree(pid: u32, start_time: u64, sidecar_pid: Option<u32>) -> Result<()> {
    if pid == std::process::id() || Some(pid) == sidecar_pid {
        bail!("refusing to kill a Helmor core process");
    }
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let target = sysinfo::Pid::from_u32(pid);
    let Some(proc_) = system.process(target) else {
        return Ok(()); // already dead — idempotent
    };
    if proc_.start_time() != start_time {
        bail!("process identity changed (PID was reused); refresh and retry");
    }
    let pairs: Vec<(u32, Option<u32>)> = system
        .processes()
        .iter()
        .map(|(p, pr)| (p.as_u32(), pr.parent().map(|x| x.as_u32())))
        .collect();
    let tree = super::tree::collect_descendants(pid, &pairs);
    // Children first, root last, so parents can't respawn handlers mid-kill.
    let mut pids: Vec<u32> = tree.into_iter().filter(|p| *p != pid).collect();
    pids.push(pid);
    for p in pids {
        if let Some(proc_) = system.process(sysinfo::Pid::from_u32(p)) {
            proc_.kill_with(sysinfo::Signal::Term);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_workspace_dir_removes_and_reports_bytes() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().join("ws-a");
        fs::create_dir_all(ws.join("nested")).unwrap();
        fs::write(ws.join("nested/f.bin"), vec![0u8; 64]).unwrap();
        let freed = delete_workspace_dir(tmp.path(), "ws-a").unwrap();
        assert_eq!(freed, 64);
        assert!(!ws.exists());
    }

    #[test]
    fn delete_workspace_dir_missing_is_zero_and_ok() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(delete_workspace_dir(tmp.path(), "nope").unwrap(), 0);
    }

    #[test]
    fn delete_workspace_dir_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(delete_workspace_dir(tmp.path(), "../escape").is_err());
        assert!(delete_workspace_dir(tmp.path(), "a/b").is_err());
        assert!(delete_workspace_dir(tmp.path(), "").is_err());
    }

    #[test]
    fn clear_logs_removes_only_old_files() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old.jsonl");
        let fresh = tmp.path().join("fresh.jsonl");
        fs::write(&old, vec![0u8; 32]).unwrap();
        fs::write(&fresh, vec![0u8; 16]).unwrap();
        // Backdate `old` by 10 days via filetime-free approach: set mtime
        // using the `filetime` pattern is overkill — instead pass days=0
        // cutoff (now) so both are "old", then days=36500 so none are.
        assert_eq!(clear_logs(tmp.path(), 36_500).unwrap(), 0);
        let freed = clear_logs(tmp.path(), 0).unwrap();
        assert_eq!(freed, 48);
        assert!(!old.exists());
        assert!(!fresh.exists());
    }

    #[test]
    fn kill_refuses_own_pid() {
        let err = kill_process_tree(std::process::id(), 0, None).unwrap_err();
        assert!(err.to_string().contains("core process"));
    }
}
```

Add `pub mod cleanup;` to `src-tauri/src/resources/mod.rs`. Check `crate::models::db` for the write-connection helper name (`write_conn` assumed — mirror whatever `read_conn`'s sibling is; if only `read_conn` exists, look at how mutations get a connection in `models/workspaces.rs` and use that).

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test resources::cleanup`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/resources/
git commit -m "feat(resources): cleanup actions — workspace dir delete, log pruning, vacuum, guarded kill"
```

---

### Task 8: Tauri commands + `StorageChanged` event + registration

**Files:**
- Create: `src-tauri/src/commands/resources_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/ui_sync/events.rs`
- Modify: `src-tauri/src/lib.rs` (`.manage`, `generate_handler!`)

- [ ] **Step 1: Add StorageChanged event variant + test**

In `src-tauri/src/ui_sync/events.rs`, add to the `UiMutationEvent` enum:

```rust
    /// Helmor's disk footprint changed (cleanup ran, workspace dirs
    /// deleted, logs pruned, DB vacuumed). Frontends invalidate the
    /// `storageBreakdown` query.
    StorageChanged,
```

Add to the `variant_names_are_camel_case` test's `cases` array in the same file:

```rust
            (UiMutationEvent::StorageChanged, "storageChanged"),
```

Run: `cd src-tauri && cargo test ui_sync` — Expected: PASS.

- [ ] **Step 2: Implement the commands**

Create `src-tauri/src/commands/resources_commands.rs`:

```rust
use std::collections::HashSet;

use tauri::{AppHandle, State};

use crate::resources::{attribution, cleanup, ports, sampler::ResourceSampler, storage, types};
use crate::sidecar::ManagedSidecar;
use crate::ui_sync;

use super::common::{run_blocking, CmdResult};

/// Workspace dirs for attribution: (id, absolute path). Best-effort —
/// failure means processes stay unattributed, never a snapshot error.
fn workspace_dirs() -> Vec<(String, std::path::PathBuf)> {
    let Ok(root) = crate::data_dir::workspaces_dir() else {
        return Vec::new();
    };
    let Ok(connection) = crate::models::db::read_conn() else {
        return Vec::new();
    };
    let Ok(mut statement) = connection.prepare("SELECT id, directory_name FROM workspaces") else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) else {
        return Vec::new();
    };
    rows.flatten()
        .map(|(id, dir)| (id, root.join(dir)))
        .collect()
}

#[tauri::command]
pub fn get_resource_snapshot(
    sampler: State<'_, ResourceSampler>,
    sidecar: State<'_, ManagedSidecar>,
) -> CmdResult<types::ResourceSnapshot> {
    let mut snapshot = sampler.snapshot(sidecar.current_pid());

    // Attribution (best-effort).
    let dirs = workspace_dirs();
    for process in &mut snapshot.processes {
        let cwd = sampler.process_cwd(process.pid);
        process.workspace_id = attribution::workspace_for_cwd(cwd.as_deref(), &dirs);
    }

    // Ports (collector failure degrades, never errors).
    match ports::list_listening_ports() {
        Ok(listened) => {
            let tree_pids: HashSet<u32> = snapshot.processes.iter().map(|p| p.pid).collect();
            let pid_names: Vec<(u32, String)> = snapshot
                .processes
                .iter()
                .map(|p| (p.pid, p.name.clone()))
                .collect();
            let pid_workspaces: Vec<(u32, Option<String>)> = snapshot
                .processes
                .iter()
                .map(|p| (p.pid, p.workspace_id.clone()))
                .collect();
            let ranges: Vec<(String, u16, u16)> = dirs
                .iter()
                .filter_map(|(id, _)| {
                    crate::workspace::port_allocation::ensure_workspace_port_range(id)
                        .ok()
                        .flatten()
                        .map(|r| (id.clone(), r.base, r.count))
                })
                .collect();
            snapshot.ports =
                ports::filter_ports(&listened, &tree_pids, &pid_names, &pid_workspaces, &ranges);
        }
        Err(_) => snapshot.ports_unavailable = true,
    }

    Ok(snapshot)
}

#[tauri::command]
pub async fn get_storage_breakdown() -> CmdResult<types::StorageBreakdown> {
    run_blocking(storage::storage_breakdown).await
}

#[tauri::command]
pub async fn kill_resource_process(
    app: AppHandle,
    sidecar: State<'_, ManagedSidecar>,
    pid: u32,
    start_time: u64,
) -> CmdResult<()> {
    let sidecar_pid = sidecar.current_pid();
    run_blocking(move || cleanup::kill_process_tree(pid, start_time, sidecar_pid)).await?;
    ui_sync::publish(&app, ui_sync::events::UiMutationEvent::StorageChanged);
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace_storage(
    app: AppHandle,
    workspace_ids: Vec<String>,
) -> CmdResult<u64> {
    let freed = run_blocking(move || {
        let root = crate::data_dir::workspaces_dir()?;
        let connection = crate::models::db::write_conn()?;
        let mut freed = 0u64;
        for id in &workspace_ids {
            let dir_name: Option<String> = connection
                .query_row(
                    "SELECT directory_name FROM workspaces WHERE id = ?1",
                    [id],
                    |row| row.get(0),
                )
                .ok();
            if let Some(dir_name) = dir_name {
                freed += cleanup::delete_workspace_dir(&root, &dir_name)?;
                connection.execute(
                    "UPDATE workspaces SET state = 'archived' WHERE id = ?1",
                    [id],
                )?;
            }
        }
        Ok(freed)
    })
    .await?;
    ui_sync::publish(&app, ui_sync::events::UiMutationEvent::StorageChanged);
    ui_sync::publish(&app, ui_sync::events::UiMutationEvent::WorkspaceListChanged);
    Ok(freed)
}

#[tauri::command]
pub async fn clear_old_logs(app: AppHandle, days: u64) -> CmdResult<u64> {
    let freed =
        run_blocking(move || cleanup::clear_logs(&crate::data_dir::logs_dir()?, days)).await?;
    ui_sync::publish(&app, ui_sync::events::UiMutationEvent::StorageChanged);
    Ok(freed)
}

#[tauri::command]
pub async fn vacuum_database(app: AppHandle) -> CmdResult<u64> {
    let freed = run_blocking(cleanup::vacuum_db).await?;
    ui_sync::publish(&app, ui_sync::events::UiMutationEvent::StorageChanged);
    Ok(freed)
}
```

Adjust to local reality while implementing:
- `ui_sync::publish` — match the real signature used elsewhere (grep `ui_sync::publish(` for a callsite; CLAUDE.md documents `crate::ui_sync::publish(&app, ...)`).
- `run_blocking` error type — `CmdResult` mapping follows whatever `commands/common.rs` does; copy an existing async command's shape from `system_commands.rs`.
- `models::db::write_conn` — same caveat as Task 7.
- `resources` module visibility: `mod resources;` from Task 1 must be reachable from `commands/` — it is (both are crate-level modules); make `pub(crate)` if the compiler complains.

Add to `src-tauri/src/commands/mod.rs` (alphabetical order):

```rust
pub(crate) mod resources_commands;
```

- [ ] **Step 3: Register state + commands in lib.rs**

In `src-tauri/src/lib.rs`, where managed state is registered (near the existing `.manage(...)` calls):

```rust
.manage(crate::resources::sampler::ResourceSampler::default())
```

In the `generate_handler!` list (keep grouping style — next to `commands::system_commands::*` entries):

```rust
commands::resources_commands::get_resource_snapshot,
commands::resources_commands::get_storage_breakdown,
commands::resources_commands::kill_resource_process,
commands::resources_commands::delete_workspace_storage,
commands::resources_commands::clear_old_logs,
commands::resources_commands::vacuum_database,
```

- [ ] **Step 4: Full Rust check**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test`
Expected: clean clippy, all tests pass (including the untouched pipeline snapshots — this change must not affect them).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/ui_sync/events.rs src-tauri/src/lib.rs src-tauri/src/resources/
git commit -m "feat(resources): tauri commands for snapshot, storage breakdown, cleanup, kill + StorageChanged event"
```

---

### Task 9: Frontend API wrappers, query keys, ui-sync bridge

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/query-client.ts`
- Modify: `src/shell/hooks/use-ui-sync-bridge.ts`

- [ ] **Step 1: Add types + wrappers to api.ts**

In `src/lib/api.ts` (new section near other domain wrappers):

```typescript
// ---- Resource monitor ----

export type ProcessKind =
	| "app"
	| "sidecar"
	| "agent"
	| "devServer"
	| "shell"
	| "other";

export type ProcessInfo = {
	pid: number;
	parentPid: number | null;
	name: string;
	cpuPercent: number;
	memoryBytes: number;
	startTime: number;
	workspaceId: string | null;
	kind: ProcessKind;
	killable: boolean;
};

export type PortInfo = {
	port: number;
	pid: number | null;
	processName: string | null;
	workspaceId: string | null;
};

export type ResourceSnapshot = {
	totalCpuPercent: number;
	totalMemoryBytes: number;
	processes: ProcessInfo[];
	ports: PortInfo[];
	portsUnavailable: boolean;
};

export type WorkspaceStorage = {
	id: string;
	name: string;
	branch: string | null;
	state: string;
	sizeBytes: number | null;
	dirPresent: boolean;
	reclaimable: boolean;
};

export type StorageBreakdown = {
	totalBytes: number;
	dbBytes: number;
	logsBytes: number;
	chatsBytes: number;
	workspaces: WorkspaceStorage[];
};

export async function getResourceSnapshot(): Promise<ResourceSnapshot> {
	return invoke<ResourceSnapshot>("get_resource_snapshot");
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
	return invoke<StorageBreakdown>("get_storage_breakdown");
}

export async function killResourceProcess(
	pid: number,
	startTime: number,
): Promise<void> {
	return invoke("kill_resource_process", { pid, startTime });
}

export async function deleteWorkspaceStorage(
	workspaceIds: string[],
): Promise<number> {
	return invoke<number>("delete_workspace_storage", { workspaceIds });
}

export async function clearOldLogs(days: number): Promise<number> {
	return invoke<number>("clear_old_logs", { days });
}

export async function vacuumDatabase(): Promise<number> {
	return invoke<number>("vacuum_database");
}
```

Add to the `UiMutationEvent` union in the same file (lines ~2171-2203):

```typescript
	| { type: "storageChanged" }
```

- [ ] **Step 2: Query keys + options in query-client.ts**

Add to `helmorQueryKeys`:

```typescript
	resourceSnapshot: ["resourceSnapshot"] as const,
	storageBreakdown: ["storageBreakdown"] as const,
```

Add factories (same style as `workspaceGroupsQueryOptions`):

```typescript
export function resourceSnapshotQueryOptions(intervalMs: number) {
	return queryOptions({
		queryKey: helmorQueryKeys.resourceSnapshot,
		queryFn: getResourceSnapshot,
		refetchInterval: intervalMs,
		staleTime: 0,
		gcTime: 5_000,
	});
}

export function storageBreakdownQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.storageBreakdown,
		queryFn: getStorageBreakdown,
		staleTime: 30_000,
	});
}
```

(Import `getResourceSnapshot`, `getStorageBreakdown` from `@/lib/api` at the top.)

- [ ] **Step 3: Bridge case**

In `src/shell/hooks/use-ui-sync-bridge.ts`, add to the switch:

```typescript
	case "storageChanged":
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.storageBreakdown,
		});
		return;
```

- [ ] **Step 4: Typecheck + commit**

Run: `bun run typecheck`
Expected: clean.

```bash
git add src/lib/api.ts src/lib/query-client.ts src/shell/hooks/use-ui-sync-bridge.ts
git commit -m "feat(resources): typed IPC wrappers, query options, storageChanged bridge"
```

---

### Task 10: `use-resource-snapshot` hook with sample history (TDD)

**Files:**
- Create: `src/features/resources/hooks/use-resource-snapshot.ts`
- Create: `src/features/resources/hooks/history.ts`
- Test: `src/features/resources/hooks/history.test.ts`

- [ ] **Step 1: Write failing test for the ring buffer**

Create `src/features/resources/hooks/history.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { pushSample, type ResourceSample } from "./history";

describe("pushSample", () => {
	it("appends and caps at 60 samples", () => {
		let history: ResourceSample[] = [];
		for (let i = 0; i < 70; i++) {
			history = pushSample(history, { cpuPercent: i, memoryBytes: i * 10 });
		}
		expect(history).toHaveLength(60);
		expect(history[0].cpuPercent).toBe(10); // oldest 10 dropped
		expect(history[59].cpuPercent).toBe(69);
	});

	it("returns a new array (no mutation)", () => {
		const history: ResourceSample[] = [];
		const next = pushSample(history, { cpuPercent: 1, memoryBytes: 1 });
		expect(history).toHaveLength(0);
		expect(next).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/resources/hooks/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/resources/hooks/history.ts`:

```typescript
export type ResourceSample = {
	cpuPercent: number;
	memoryBytes: number;
};

export const HISTORY_CAPACITY = 60;

export function pushSample(
	history: ResourceSample[],
	sample: ResourceSample,
): ResourceSample[] {
	const next = [...history, sample];
	return next.length > HISTORY_CAPACITY
		? next.slice(next.length - HISTORY_CAPACITY)
		: next;
}
```

Create `src/features/resources/hooks/use-resource-snapshot.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { resourceSnapshotQueryOptions } from "@/lib/query-client";
import { pushSample, type ResourceSample } from "./history";

/** Poll the Helmor resource snapshot. 2s idle, 1s while the popover is
 * open. Keeps a 60-sample client-side history for sparklines. */
export function useResourceSnapshot(popoverOpen: boolean) {
	const query = useQuery(resourceSnapshotQueryOptions(popoverOpen ? 1000 : 2000));
	const [history, setHistory] = useState<ResourceSample[]>([]);

	useEffect(() => {
		if (!query.data) return;
		setHistory((prev) =>
			pushSample(prev, {
				cpuPercent: query.data.totalCpuPercent,
				memoryBytes: query.data.totalMemoryBytes,
			}),
		);
	}, [query.data]);

	return { ...query, history };
}
```

- [ ] **Step 4: Run tests**

Run: `bun x vitest run src/features/resources/hooks/history.test.ts`
Expected: PASS (2 tests). Then `bun run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/resources/
git commit -m "feat(resources): snapshot polling hook with sparkline history"
```

---

### Task 11: ResourceWidget + popover, wired into the sidebar footer

**Files:**
- Create: `src/features/resources/index.tsx` (widget button)
- Create: `src/features/resources/popover.tsx`
- Create: `src/features/resources/format.ts`
- Test: `src/features/resources/format.test.ts`
- Test: `src/features/resources/index.test.tsx`
- Modify: `src/shell/components/shell-sidebar-pane.tsx:271-277`

- [ ] **Step 1: Formatting helpers (TDD)**

Create `src/features/resources/format.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatBytes, formatCpu } from "./format";

describe("formatBytes", () => {
	it("scales units", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
		expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
	});
});

describe("formatCpu", () => {
	it("rounds to whole percent", () => {
		expect(formatCpu(3.4)).toBe("3%");
		expect(formatCpu(0.2)).toBe("0%");
	});
});
```

Run: `bun x vitest run src/features/resources/format.test.ts` — Expected: FAIL (module missing).

Create `src/features/resources/format.ts`:

```typescript
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatCpu(percent: number): string {
	return `${Math.round(percent)}%`;
}
```

Run again — Expected: PASS.

- [ ] **Step 2: Widget button**

Create `src/features/resources/index.tsx` (mirrors `FeedbackButton` structure, `src/features/feedback/index.tsx:12-34`):

```tsx
import { Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBytes, formatCpu } from "./format";
import { useResourceSnapshot } from "./hooks/use-resource-snapshot";
import { ResourcePopoverContent } from "./popover";

export function ResourceWidget() {
	const [open, setOpen] = useState(false);
	const { data, history, isError } = useResourceSnapshot(open);

	const cpu = data?.totalCpuPercent ?? 0;
	const tone =
		cpu > 80
			? "text-red-500"
			: cpu > 50
				? "text-amber-500"
				: "text-muted-foreground";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"w-auto gap-1 px-1.5 text-muted-foreground hover:text-foreground",
								tone,
							)}
							aria-label="Helmor resource usage"
						>
							<Activity className="size-[15px]" strokeWidth={1.8} />
							{data && !isError ? (
								<span className="text-mini tabular-nums leading-none">
									{formatCpu(data.totalCpuPercent)} ·{" "}
									{formatBytes(data.totalMemoryBytes)}
								</span>
							) : null}
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					sideOffset={6}
					className="flex h-[22px] items-center rounded-md px-1.5 text-mini leading-none"
				>
					<span className="leading-none">Helmor resource usage</span>
				</TooltipContent>
			</Tooltip>
			<PopoverContent side="top" align="start" className="w-[340px] p-0">
				<ResourcePopoverContent
					snapshot={data}
					history={history}
					isError={isError}
					onClose={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 3: Popover content**

Create `src/features/resources/popover.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Bot,
	Copy,
	Cpu,
	Server,
	SquareTerminal,
	X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	killResourceProcess,
	type ProcessInfo,
	type ProcessKind,
	type ResourceSnapshot,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { publishShellEvent } from "@/shell/event-bus";
import { formatBytes, formatCpu } from "./format";
import type { ResourceSample } from "./hooks/history";

const KIND_ICONS: Record<ProcessKind, typeof Cpu> = {
	app: Cpu,
	sidecar: Server,
	agent: Bot,
	devServer: Server,
	shell: SquareTerminal,
	other: Cpu,
};

function Sparkline({ values }: { values: number[] }) {
	if (values.length < 2) return null;
	const max = Math.max(...values, 1);
	const points = values
		.map(
			(v, i) =>
				`${(i / (values.length - 1)) * 100},${24 - (v / max) * 22}`,
		)
		.join(" ");
	return (
		<svg viewBox="0 0 100 24" className="h-6 w-full" preserveAspectRatio="none">
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function ProcessRow({ process }: { process: ProcessInfo }) {
	const [confirming, setConfirming] = useState(false);
	const queryClient = useQueryClient();
	const kill = useMutation({
		mutationFn: () => killResourceProcess(process.pid, process.startTime),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.resourceSnapshot,
			}),
	});
	const Icon = KIND_ICONS[process.kind];
	return (
		<div className="flex items-center gap-2 px-3 py-1 text-small">
			<Icon className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate">{process.name}</span>
			<span className="text-mini tabular-nums text-muted-foreground">
				{process.pid}
			</span>
			<span className="w-10 text-right text-mini tabular-nums">
				{formatCpu(process.cpuPercent)}
			</span>
			<span className="w-14 text-right text-mini tabular-nums">
				{formatBytes(process.memoryBytes)}
			</span>
			{process.killable ? (
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={confirming ? `Confirm kill ${process.name}` : `Kill ${process.name}`}
					className={confirming ? "text-red-500" : "text-muted-foreground"}
					onClick={() => {
						if (confirming) {
							kill.mutate();
							setConfirming(false);
						} else {
							setConfirming(true);
							setTimeout(() => setConfirming(false), 3000);
						}
					}}
				>
					<X className="size-3" />
				</Button>
			) : (
				<span className="w-6" />
			)}
		</div>
	);
}

export function ResourcePopoverContent({
	snapshot,
	history,
	isError,
	onClose,
}: {
	snapshot: ResourceSnapshot | undefined;
	history: ResourceSample[];
	isError: boolean;
	onClose: () => void;
}) {
	if (isError || !snapshot) {
		return (
			<div className="p-4 text-small text-muted-foreground">
				Resource data unavailable.
			</div>
		);
	}

	const groups = new Map<string, ProcessInfo[]>();
	for (const process of snapshot.processes) {
		const key = process.workspaceId ?? "__core__";
		groups.set(key, [...(groups.get(key) ?? []), process]);
	}

	return (
		<div className="flex max-h-[420px] flex-col">
			<div className="border-b px-3 py-2">
				<div className="flex items-baseline justify-between text-small">
					<span className="font-medium">Helmor</span>
					<span className="tabular-nums text-muted-foreground">
						{formatCpu(snapshot.totalCpuPercent)} ·{" "}
						{formatBytes(snapshot.totalMemoryBytes)}
					</span>
				</div>
				<div className="text-muted-foreground/60">
					<Sparkline values={history.map((s) => s.cpuPercent)} />
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				{[...groups.entries()].map(([workspaceId, processes]) => (
					<div key={workspaceId}>
						<div className="px-3 pb-0.5 pt-1.5 text-mini font-medium text-muted-foreground">
							{workspaceId === "__core__" ? "Helmor core" : workspaceId}
						</div>
						{processes.map((process) => (
							<ProcessRow key={process.pid} process={process} />
						))}
					</div>
				))}
				{snapshot.processes.length === 0 ? (
					<div className="px-3 py-2 text-small text-muted-foreground">
						No active agents
					</div>
				) : null}
				<div className="px-3 pb-0.5 pt-1.5 text-mini font-medium text-muted-foreground">
					Ports
				</div>
				{snapshot.portsUnavailable ? (
					<div className="px-3 py-1 text-small text-muted-foreground">
						Ports unavailable
					</div>
				) : snapshot.ports.length === 0 ? (
					<div className="px-3 py-1 text-small text-muted-foreground">
						No open ports
					</div>
				) : (
					snapshot.ports.map((port) => (
						<button
							key={port.port}
							type="button"
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-small hover:bg-accent"
							onClick={() =>
								navigator.clipboard.writeText(`localhost:${port.port}`)
							}
						>
							<span className="tabular-nums font-medium">:{port.port}</span>
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								{port.processName ?? "unknown"}
								{port.pid != null ? ` (${port.pid})` : ""}
							</span>
							{port.workspaceId ? (
								<span className="rounded bg-accent px-1 text-mini">
									{port.workspaceId}
								</span>
							) : null}
							<Copy className="size-3 text-muted-foreground" />
						</button>
					))
				)}
			</div>
			<button
				type="button"
				className="cursor-pointer border-t px-3 py-2 text-left text-small text-muted-foreground hover:text-foreground"
				onClick={() => {
					onClose();
					publishShellEvent({ type: "open-settings", section: "storage" });
				}}
			>
				Storage &amp; cleanup…
			</button>
		</div>
	);
}
```

Notes while implementing:
- Workspace group headers show the workspace *id* above — resolve to display names by joining against the already-cached sidebar workspace groups query if a cheap accessor exists (`useQueryClient().getQueryData(helmorQueryKeys.workspaceGroups)`); otherwise leave id (follow-up polish, don't block).
- `publishShellEvent({ type: "open-settings", section: "storage" })` requires Task 12's `"storage"` section to exist in `SettingsSection`; tasks 11+12 must land together before that link works — fine within one branch.
- `text-mini` / `text-small` / `size="icon-xs"` all exist in this codebase (used by FeedbackButton/sidebar buttons).

- [ ] **Step 4: Widget render test**

Create `src/features/resources/index.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResourceWidget } from "./index";

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	getResourceSnapshot: vi.fn().mockResolvedValue({
		totalCpuPercent: 3.4,
		totalMemoryBytes: 1.2 * 1024 ** 3,
		processes: [],
		ports: [],
		portsUnavailable: false,
	}),
}));

function renderWidget() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<ResourceWidget />
			</TooltipProvider>
		</QueryClientProvider>,
	);
}

describe("ResourceWidget", () => {
	it("renders cpu and memory readout once data arrives", async () => {
		renderWidget();
		expect(await screen.findByText(/3% · 1\.2 GB/)).toBeInTheDocument();
	});

	it("has an accessible label", async () => {
		renderWidget();
		expect(
			await screen.findByLabelText("Helmor resource usage"),
		).toBeInTheDocument();
	});
});
```

(If `TooltipProvider` is mounted globally in this codebase's test setup, drop the local wrapper — copy whatever `src/features/feedback` or sidebar tests do.)

Run: `bun x vitest run src/features/resources` — Expected: PASS.

- [ ] **Step 5: Wire into sidebar footer**

In `src/shell/components/shell-sidebar-pane.tsx`, add the import:

```tsx
import { ResourceWidget } from "@/features/resources";
```

Change the footer row (lines 271-277) to:

```tsx
					<div className="flex shrink-0 items-center px-3 pb-3 pt-1">
						<SettingsButton
							onClick={onOpenSettings}
							shortcut={getShortcut(appSettings.shortcuts, "settings.open")}
						/>
						<FeedbackButton onClick={onOpenFeedback} />
						<div className="ml-auto">
							<ResourceWidget />
						</div>
					</div>
```

(`ml-auto` right-aligns the widget in the row, per the request "bottom right aligned with the settings and feedback icons".)

- [ ] **Step 6: Full frontend check + commit**

Run: `bun run typecheck && bun x vitest run src/features/resources && bun run lint`
Expected: all clean.

```bash
git add src/features/resources/ src/shell/components/shell-sidebar-pane.tsx
git commit -m "feat(resources): sidebar resource widget with process/port popover"
```

---

### Task 12: Storage settings panel

**Files:**
- Modify: `src/features/settings/types.ts`
- Modify: `src/features/settings/index.tsx` (section list, import, render)
- Create: `src/features/settings/panels/storage.tsx`
- Test: `src/features/settings/panels/storage.test.tsx`

- [ ] **Step 1: Register the section**

In `src/features/settings/types.ts` add `| "storage"` to `SettingsSection` (after `"general"`).

In `src/features/settings/index.tsx`:
- import: `import { StoragePanel } from "./panels/storage";`
- add `"storage"` to the `fixedSections` array (place after `"experimental"`, before dev-only sections);
- add the render branch next to the other panels: `{activeSection === "storage" && <StoragePanel />}` (match the exact conditional style used by siblings);
- the nav label falls out of `sidebarSectionLabel`'s default capitalization → "Storage" (no override needed). If sections have icons in the nav, add `HardDrive` from lucide following the existing icon map.

- [ ] **Step 2: Panel implementation**

Create `src/features/settings/panels/storage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
} from "@/components/ui/dialog";
import {
	clearOldLogs,
	deleteWorkspaceStorage,
	vacuumDatabase,
	type StorageBreakdown,
} from "@/lib/api";
import {
	helmorQueryKeys,
	storageBreakdownQueryOptions,
} from "@/lib/query-client";
import { formatBytes } from "@/features/resources/format";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

const SEGMENT_COLORS = [
	"bg-chart-1",
	"bg-chart-2",
	"bg-chart-3",
	"bg-chart-4",
	"bg-chart-5",
];

function UsageBar({ breakdown }: { breakdown: StorageBreakdown }) {
	const workspaceBytes = breakdown.workspaces.reduce(
		(sum, w) => sum + (w.sizeBytes ?? 0),
		0,
	);
	const segments = [
		{ label: "Workspaces", bytes: workspaceBytes },
		{ label: "Database", bytes: breakdown.dbBytes },
		{ label: "Logs", bytes: breakdown.logsBytes },
		{ label: "Chats", bytes: breakdown.chatsBytes },
	].filter((s) => s.bytes > 0);
	const total = Math.max(breakdown.totalBytes, 1);
	return (
		<div className="space-y-2">
			<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
				{segments.map((segment, i) => (
					<div
						key={segment.label}
						className={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
						style={{ width: `${(segment.bytes / total) * 100}%` }}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-mini text-muted-foreground">
				{segments.map((segment, i) => (
					<span key={segment.label} className="flex items-center gap-1">
						<span
							className={`size-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
						/>
						{segment.label} · {formatBytes(segment.bytes)}
					</span>
				))}
			</div>
		</div>
	);
}

export function StoragePanel() {
	const queryClient = useQueryClient();
	const query = useQuery(storageBreakdownQueryOptions());
	const [confirm, setConfirm] = useState<{
		title: string;
		detail: string;
		action: () => void;
	} | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.storageBreakdown,
		});

	const deleteDirs = useMutation({
		mutationFn: deleteWorkspaceStorage,
		onSettled: invalidate,
	});
	const clearLogs = useMutation({
		mutationFn: () => clearOldLogs(7),
		onSettled: invalidate,
	});
	const vacuum = useMutation({
		mutationFn: vacuumDatabase,
		onSettled: invalidate,
	});

	const breakdown = query.data;
	const reclaimable =
		breakdown?.workspaces.filter((w) => w.reclaimable) ?? [];
	const reclaimableBytes = reclaimable.reduce(
		(sum, w) => sum + (w.sizeBytes ?? 0),
		0,
	);

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow
					title="Disk usage"
					description={
						breakdown
							? `Helmor is using ${formatBytes(breakdown.totalBytes)}`
							: "Scanning…"
					}
					align="start"
				>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Refresh storage info"
						onClick={() => void query.refetch()}
					>
						<RefreshCw className="size-3.5" />
					</Button>
				</SettingsRow>
				{breakdown ? <UsageBar breakdown={breakdown} /> : null}
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow
					title="Workspaces"
					description={
						reclaimable.length > 0
							? `${reclaimable.length} archived workspace folder(s) can be removed — frees ${formatBytes(reclaimableBytes)}`
							: "No reclaimable workspace folders"
					}
					align="start"
				>
					{reclaimable.length > 0 ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setConfirm({
									title: "Delete archived workspace folders?",
									detail: `Removes ${reclaimable.length} folder(s), freeing ${formatBytes(reclaimableBytes)}. Chat history and database records are kept.`,
									action: () =>
										deleteDirs.mutate(reclaimable.map((w) => w.id)),
								})
							}
						>
							Clean up
						</Button>
					) : null}
				</SettingsRow>
				{breakdown ? (
					<div className="space-y-0.5">
						{breakdown.workspaces.map((workspace) => (
							<div
								key={workspace.id}
								className="flex items-center gap-2 py-1 text-small"
							>
								<span className="min-w-0 flex-1 truncate">
									{workspace.name}
								</span>
								{workspace.branch ? (
									<span className="truncate text-mini text-muted-foreground">
										{workspace.branch}
									</span>
								) : null}
								<span className="rounded bg-accent px-1 text-mini">
									{workspace.state}
								</span>
								<span className="w-16 text-right text-mini tabular-nums text-muted-foreground">
									{workspace.sizeBytes != null
										? formatBytes(workspace.sizeBytes)
										: "—"}
								</span>
								{workspace.reclaimable ? (
									<Button
										variant="ghost"
										size="sm"
										className="text-mini"
										onClick={() =>
											setConfirm({
												title: `Delete files for "${workspace.name}"?`,
												detail: `Frees ${formatBytes(workspace.sizeBytes ?? 0)}. Chat history is kept.`,
												action: () => deleteDirs.mutate([workspace.id]),
											})
										}
									>
										Delete files
									</Button>
								) : null}
							</div>
						))}
					</div>
				) : null}
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow
					title="Clear old logs"
					description={
						breakdown
							? `Logs use ${formatBytes(breakdown.logsBytes)} — removes files older than 7 days`
							: undefined
					}
				>
					<Button
						variant="outline"
						size="sm"
						disabled={clearLogs.isPending}
						onClick={() => clearLogs.mutate()}
					>
						Clear logs
					</Button>
				</SettingsRow>
				<SettingsRow
					title="Compact database"
					description={
						breakdown
							? `Database is ${formatBytes(breakdown.dbBytes)} — runs SQLite VACUUM`
							: undefined
					}
				>
					<Button
						variant="outline"
						size="sm"
						disabled={vacuum.isPending}
						onClick={() => vacuum.mutate()}
					>
						Compact
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
				<DialogContent className="max-w-sm">
					<div className="space-y-3">
						<div className="font-medium">{confirm?.title}</div>
						<div className="text-small text-muted-foreground">
							{confirm?.detail}
						</div>
						<div className="flex justify-end gap-2">
							<DialogClose asChild>
								<Button variant="ghost" size="sm">
									Cancel
								</Button>
							</DialogClose>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => {
									confirm?.action();
									setConfirm(null);
								}}
							>
								Delete
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
```

Implementation notes:
- Match `DialogContent` usage to how other panels build confirm dialogs (grep `DialogContent` in `src/features/settings/panels/` and copy the local idiom — title/description subcomponents may exist).
- `bg-chart-*` tokens: verify they exist in the Tailwind theme (`rg "chart-1" src`); if not, use `bg-app-accent`-style semantic tokens that do.
- If the file exceeds ~300 lines, split `UsageBar` + workspace rows into `panels/storage/` sub-files per repo rules.

- [ ] **Step 3: Panel test**

Create `src/features/settings/panels/storage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoragePanel } from "./storage";

const deleteWorkspaceStorage = vi.fn().mockResolvedValue(123);

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	getStorageBreakdown: vi.fn().mockResolvedValue({
		totalBytes: 1024 * 1024,
		dbBytes: 1024,
		logsBytes: 2048,
		chatsBytes: 0,
		workspaces: [
			{
				id: "w1",
				name: "old-ws",
				branch: "feat/x",
				state: "archived",
				sizeBytes: 512 * 1024,
				dirPresent: true,
				reclaimable: true,
			},
		],
	}),
	deleteWorkspaceStorage: (ids: string[]) => deleteWorkspaceStorage(ids),
	clearOldLogs: vi.fn().mockResolvedValue(0),
	vacuumDatabase: vi.fn().mockResolvedValue(0),
}));

function renderPanel() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<StoragePanel />
		</QueryClientProvider>,
	);
}

describe("StoragePanel", () => {
	it("renders breakdown and reclaimable workspace", async () => {
		renderPanel();
		expect(await screen.findByText("old-ws")).toBeInTheDocument();
		expect(screen.getByText("archived")).toBeInTheDocument();
	});

	it("deletes workspace files only after confirm", async () => {
		const user = userEvent.setup();
		renderPanel();
		await user.click(await screen.findByText("Delete files"));
		expect(deleteWorkspaceStorage).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(deleteWorkspaceStorage).toHaveBeenCalledWith(["w1"]);
	});
});
```

Run: `bun x vitest run src/features/settings/panels/storage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/
git commit -m "feat(settings): storage panel — disk breakdown, workspace cleanup, maintenance actions"
```

---

### Task 13: Process hygiene rows in Storage panel (stuck agents)

**Files:**
- Create: `src/features/settings/panels/storage-processes.tsx`
- Modify: `src/features/settings/panels/storage.tsx` (render the section)
- Test: `src/features/settings/panels/storage-processes.test.tsx`

Stuck = `kind === "agent"` process whose `workspaceId` has no active stream (frontend correlates against the existing `list_active_streams` query) **or** uptime > 1h with no active stream. All data already exists — no new backend.

- [ ] **Step 1: Implementation**

Create `src/features/settings/panels/storage-processes.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { killResourceProcess, type ProcessInfo } from "@/lib/api";
import {
	helmorQueryKeys,
	resourceSnapshotQueryOptions,
} from "@/lib/query-client";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

/** Agent processes with no matching active stream — candidates for cleanup. */
export function findStuckAgents(
	processes: ProcessInfo[],
	activeWorkspaceIds: Set<string>,
): ProcessInfo[] {
	return processes.filter(
		(process) =>
			process.kind === "agent" &&
			process.killable &&
			(process.workspaceId === null ||
				!activeWorkspaceIds.has(process.workspaceId)),
	);
}

export function StorageProcessesSection({
	activeWorkspaceIds,
}: {
	activeWorkspaceIds: Set<string>;
}) {
	const queryClient = useQueryClient();
	const snapshot = useQuery(resourceSnapshotQueryOptions(5000));
	const kill = useMutation({
		mutationFn: (process: ProcessInfo) =>
			killResourceProcess(process.pid, process.startTime),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.resourceSnapshot,
			}),
	});

	const stuck = findStuckAgents(
		snapshot.data?.processes ?? [],
		activeWorkspaceIds,
	);
	if (stuck.length === 0) return null;

	return (
		<SettingsGroup>
			<SettingsRow
				title="Idle agent processes"
				description={`${stuck.length} agent process(es) running with no active stream`}
				align="start"
			>
				<Button
					variant="outline"
					size="sm"
					onClick={() => stuck.forEach((process) => kill.mutate(process))}
				>
					Kill all
				</Button>
			</SettingsRow>
			{stuck.map((process) => (
				<div
					key={process.pid}
					className="flex items-center gap-2 py-1 text-small"
				>
					<span className="min-w-0 flex-1 truncate">{process.name}</span>
					<span className="text-mini tabular-nums text-muted-foreground">
						PID {process.pid}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="text-mini"
						onClick={() => kill.mutate(process)}
					>
						Kill
					</Button>
				</div>
			))}
		</SettingsGroup>
	);
}
```

In `storage.tsx`, render `<StorageProcessesSection activeWorkspaceIds={...} />` between the Workspaces and Maintenance groups. For `activeWorkspaceIds`: read the active-streams query the app already maintains (grep `list_active_streams` / `activeStreams` in `src/lib/query-client.ts` for the key; map stream entries to their workspace ids into a `Set`). If wiring that query into the settings dialog is invasive, pass `new Set()` (treats every agent as potentially idle — conservative but honest; note it in the row description).

- [ ] **Step 2: Test the pure selector**

Create `src/features/settings/panels/storage-processes.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import type { ProcessInfo } from "@/lib/api";
import { findStuckAgents } from "./storage-processes";

function proc(overrides: Partial<ProcessInfo>): ProcessInfo {
	return {
		pid: 1,
		parentPid: null,
		name: "claude",
		cpuPercent: 0,
		memoryBytes: 0,
		startTime: 0,
		workspaceId: null,
		kind: "agent",
		killable: true,
		...overrides,
	};
}

describe("findStuckAgents", () => {
	it("keeps agents without an active stream", () => {
		const procs = [
			proc({ pid: 1, workspaceId: "active-ws" }),
			proc({ pid: 2, workspaceId: "idle-ws" }),
			proc({ pid: 3, workspaceId: null }),
			proc({ pid: 4, kind: "devServer", workspaceId: "idle-ws" }),
			proc({ pid: 5, killable: false, workspaceId: "idle-ws" }),
		];
		const stuck = findStuckAgents(procs, new Set(["active-ws"]));
		expect(stuck.map((p) => p.pid)).toEqual([2, 3]);
	});
});
```

Run: `bun x vitest run src/features/settings/panels/storage-processes.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/settings/panels/
git commit -m "feat(settings): idle agent process hygiene in storage panel"
```

---

### Task 14: Auto-cleanup policy (settings keys + Rust daily task)

**Files:**
- Modify: `src/lib/settings.ts` (AppSettings keys, defaults, key map)
- Modify: `src/features/settings/panels/storage.tsx` (toggles)
- Create: `src-tauri/src/resources/auto_cleanup.rs`
- Modify: `src-tauri/src/resources/mod.rs`
- Modify: `src-tauri/src/lib.rs` (spawn in setup hook)

- [ ] **Step 1: Frontend settings keys**

In `src/lib/settings.ts`:
- add to `AppSettings` (line ~254): `autoCleanLogsDays: number;` (0 = off) and `autoDeleteDeadWorkspaceFiles: boolean;`
- add to `DEFAULT_SETTINGS` (line ~380): `autoCleanLogsDays: 0,` and `autoDeleteDeadWorkspaceFiles: false,`
- add to the key map (line ~566 area): `autoCleanLogsDays: "app.auto_clean_logs_days",` and `autoDeleteDeadWorkspaceFiles: "app.auto_delete_dead_workspace_files",`
- mirror whatever (de)serialization the map's number/boolean siblings use (`notifications`, `chatFontSize` are the patterns to copy).

- [ ] **Step 2: Panel toggles**

In `storage.tsx`, add an "Auto-cleanup" `SettingsGroup` using the settings context the other panels use (`useSettings()` — copy the import + update pattern from `panels/appearance.tsx`):

```tsx
<SettingsGroup>
	<SettingsRow
		title="Auto-prune logs"
		description="Delete log files older than the selected age, once a day"
	>
		{/* Select with options Off / 7 / 14 / 30 days bound to
		    settings.autoCleanLogsDays via updateSettings — use the same
		    Select component other panels use */}
	</SettingsRow>
	<SettingsRow
		title="Auto-delete dead workspace files"
		description="When a workspace is archived with files left on disk, remove them during daily cleanup"
	>
		{/* Switch bound to settings.autoDeleteDeadWorkspaceFiles */}
	</SettingsRow>
</SettingsGroup>
```

Fill the two controls with the codebase's `Select`/`Switch` components exactly as `panels/appearance.tsx` does (copy a working binding, swap the key).

- [ ] **Step 3: Rust daily task**

Create `src-tauri/src/resources/auto_cleanup.rs`:

```rust
use std::time::Duration;

use crate::models::settings::load_setting_value;

/// One cleanup pass driven by the persisted policy. Safe to call any
/// time; no-ops when both policies are off.
pub fn run_once() {
    let days: u64 = load_setting_value("app.auto_clean_logs_days")
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    if days > 0 {
        if let Ok(logs_dir) = crate::data_dir::logs_dir() {
            if let Err(error) = super::cleanup::clear_logs(&logs_dir, days) {
                tracing::warn!(?error, "auto-cleanup: log pruning failed");
            }
        }
    }

    let delete_dead = load_setting_value("app.auto_delete_dead_workspace_files")
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(false);
    if delete_dead {
        if let Err(error) = delete_archived_workspace_dirs() {
            tracing::warn!(?error, "auto-cleanup: workspace dir pruning failed");
        }
    }
}

fn delete_archived_workspace_dirs() -> anyhow::Result<()> {
    let root = crate::data_dir::workspaces_dir()?;
    let connection = crate::models::db::read_conn()?;
    let mut statement = connection
        .prepare("SELECT directory_name FROM workspaces WHERE state = 'archived'")?;
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))?
        .flatten()
        .collect();
    for name in names {
        let _ = super::cleanup::delete_workspace_dir(&root, &name);
    }
    Ok(())
}

/// Spawn the daily loop. First pass runs 5 minutes after startup so it
/// never competes with app boot.
pub fn spawn(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5 * 60)).await;
        loop {
            run_once();
            crate::ui_sync::publish(
                &app,
                crate::ui_sync::events::UiMutationEvent::StorageChanged,
            );
            tokio::time::sleep(Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}
```

Add `pub mod auto_cleanup;` to `resources/mod.rs`. In `lib.rs`'s setup hook (where other startup tasks spawn — near the `purge_orphaned_workspaces` call at ~line 264):

```rust
crate::resources::auto_cleanup::spawn(app.handle().clone());
```

Match the real `tracing` import style (the codebase uses structured logging via `logging.rs` — copy a `warn!` callsite's idiom) and `load_setting_value`'s actual return type (`Result<Option<String>>` per `models/settings.rs:62-77`).

- [ ] **Step 4: Verify + commit**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test && cd .. && bun run typecheck`
Expected: clean.

```bash
git add src/lib/settings.ts src/features/settings/panels/storage.tsx src-tauri/src/resources/ src-tauri/src/lib.rs
git commit -m "feat(resources): auto-cleanup policy — daily log pruning and dead workspace removal"
```

---

### Task 15: Full verification + changeset

**Files:**
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Run everything**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: all three suites pass (frontend, sidecar, rust), lint clean. Pipeline snapshots must show zero drift (`cargo test --tests` ran in `bun run test:rust`) — this feature touches none of `pipeline/`, `schema.rs`, or the storage shape.

- [ ] **Step 2: Manual smoke (dev app)**

Run `bun run dev`, then verify via Tauri MCP (debug build): widget renders in the sidebar footer right-aligned; popover opens with the app/sidecar processes listed; Settings → Storage shows the breakdown. (`driver_session action=status` first, then `webview_screenshot`.)

- [ ] **Step 3: Changeset**

Create `.changeset/resource-monitor-storage.md` (minor — two user-visible features):

```markdown
---
"helmor": minor
---

Resource monitor and storage management

- New sidebar widget showing Helmor's live CPU and memory usage, with a popover listing every Helmor process (PIDs, per-workspace grouping, kill actions) and the ports they hold open
- New Storage settings page with a disk-usage breakdown, archived-workspace cleanup, log pruning, database compaction, idle-agent cleanup, and optional daily auto-cleanup
```

(Verify the package name in an existing `.changeset/*.md` file and match it.)

- [ ] **Step 4: Final commit**

```bash
git add .changeset/
git commit -m "chore: changeset for resource monitor and storage management"
```

---

## Self-review notes (already applied)

- Spec coverage: widget (T11), popover process tree/PIDs/icons/kill (T2,T3,T11), ports incl. workspace ranges (T4,T8,T11), per-workspace attribution (T5), storage breakdown (T6,T12), dead-workspace cleanup (T7,T8,T12), process hygiene (T13), maintenance (T7,T12), auto-cleanup (T14), `StorageChanged` event via the UiMutationEvent bridge (T8,T9), error degradation (T4 ports / T6 sizes / T7 idempotent kill), PID-reuse guard (T3,T7), core-process kill refusal (T7).
- Known adapt-points are called out inline where the plan depends on local API names (`write_conn`, `ui_sync::publish` signature, sysinfo 0.33 method shapes, Dialog idiom, chart color tokens). These are lookups, not design decisions.
