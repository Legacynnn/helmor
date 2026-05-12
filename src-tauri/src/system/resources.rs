//! Real-time resource usage snapshot for the sidebar's resource pill.
//!
//! `ResourceCollector` owns a long-lived [`sysinfo::System`] so successive
//! ticks can compute valid CPU% deltas. Each call to [`collect_snapshot`]:
//!
//!   1. Refreshes process + memory state.
//!   2. BFS-walks the process tree from `helmor_pid` to find every
//!      descendant (renderers, sidecar, agent CLIs, terminals, scripts).
//!   3. Tags each PID with a [`ProcessKind`] and attempts to attribute it
//!      to a workspace via the `ScriptProcessManager` snapshot or the
//!      sidecar PID. Unattributable Helmor descendants land in `orphans`.
//!   4. Rolls up CPU + memory per workspace, per repo, and across the
//!      whole Helmor process group.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::workspace::scripts::ScriptPidEntry;

/// Synthetic repo id used to bucket sidecar-spawned agent CLIs that we
/// cannot map deterministically to a workspace.
pub const SIDECAR_AGENTS_REPO_ID: &str = "__helmor_sidecar";
const SIDECAR_AGENTS_REPO_LABEL: &str = "Sidecar agents";
const SIDECAR_AGENTS_WORKSPACE_ID: &str = "__sidecar_agents";
const SIDECAR_AGENTS_WORKSPACE_TITLE: &str = "Active agents";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    pub captured_at_ms: u64,
    pub system: SystemTotals,
    pub helmor: HelmorRollup,
    pub repositories: Vec<RepoGroup>,
    pub orphans: Vec<ProcessNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemTotals {
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub cpu_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmorRollup {
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    /// Fraction of physical RAM held by Helmor's process group (0.0–1.0).
    pub ram_share: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoGroup {
    pub repo_id: String,
    pub repo_label: String,
    pub repo_icon_src: Option<String>,
    pub repo_initials: Option<String>,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub workspaces: Vec<WorkspaceUsage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUsage {
    pub workspace_id: String,
    pub workspace_title: String,
    pub branch: Option<String>,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub processes: Vec<ProcessNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNode {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    /// Friendly display name.
    pub name: String,
    /// Raw sysinfo executable name, for tooltip / disambiguation.
    pub raw_name: String,
    pub kind: ProcessKind,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ProcessKind {
    /// The Helmor app process itself.
    Main,
    /// A WebKit / WKWebView renderer child of the Helmor app.
    Renderer,
    /// The Bun sidecar.
    Sidecar,
    /// An agent CLI (claude-code, codex) spawned by the sidecar.
    Cli { provider: String },
    /// A repo script (setup / run) tracked by `ScriptProcessManager`.
    Script { script_type: String },
    /// A shell / pty process — usually the parent of a script.
    Pty,
    /// Anything else under Helmor's tree.
    Other,
}

/// Metadata about a workspace, indexed by workspace id, supplied by the
/// caller. Lets the collector stay free of database calls.
#[derive(Debug, Clone)]
pub struct WorkspaceMeta {
    pub repo_id: String,
    pub repo_label: String,
    pub repo_icon_src: Option<String>,
    pub repo_initials: Option<String>,
    pub title: String,
    pub branch: Option<String>,
}

/// All inputs needed to build a snapshot. Caller fills this from app
/// state (sidecar manager, script process manager, workspace db) on
/// every tick — keeps `collect_snapshot` a pure function.
pub struct CollectorContext<'a> {
    pub helmor_pid: u32,
    pub sidecar_pid: Option<u32>,
    pub script_pids: Vec<ScriptPidEntry>,
    pub workspace_index: HashMap<String, WorkspaceMeta>,
    pub system: &'a Mutex<System>,
}

/// Long-lived sysinfo holder. One instance per app, shared across
/// snapshot calls so CPU% deltas are valid.
pub struct ResourceCollector {
    pub system: Mutex<System>,
}

impl Default for ResourceCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl ResourceCollector {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(System::new()),
        }
    }
}

pub fn collect_snapshot(ctx: &CollectorContext) -> ResourceSnapshot {
    let mut system = ctx
        .system
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());

    // Refresh process info (cmd, name, parent, cpu, mem) and global memory.
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything().with_cpu().with_memory(),
    );
    system.refresh_memory();

    let total_memory = system.total_memory();
    let used_memory = system.used_memory();
    let available_memory = system.available_memory();
    let cpu_count = system.cpus().len();

    let helmor_pid = Pid::from_u32(ctx.helmor_pid);

    // ------------------------------------------------------------------
    // 1. Walk descendants of helmor_pid.
    // ------------------------------------------------------------------
    let mut descendants: HashSet<Pid> = HashSet::new();
    descendants.insert(helmor_pid);

    // Build reverse parent->children adjacency to BFS without rescanning.
    let mut children_of: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children_of.entry(parent).or_default().push(*pid);
        }
    }
    let mut queue: VecDeque<Pid> = VecDeque::new();
    queue.push_back(helmor_pid);
    while let Some(p) = queue.pop_front() {
        if let Some(children) = children_of.get(&p) {
            for child in children {
                if descendants.insert(*child) {
                    queue.push_back(*child);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 2. Index script pids by leader and by pgid for workspace lookup.
    // ------------------------------------------------------------------
    let mut script_by_pid: HashMap<u32, ScriptPidEntry> = HashMap::new();
    let mut script_by_pgid: HashMap<u32, ScriptPidEntry> = HashMap::new();
    for entry in &ctx.script_pids {
        script_by_pid.insert(entry.pid, entry.clone());
        script_by_pgid.insert(entry.pgid, entry.clone());
    }

    let sidecar_pid_pid = ctx.sidecar_pid.map(Pid::from_u32);

    // ------------------------------------------------------------------
    // 3. Build a typed ProcessNode for each descendant.
    // ------------------------------------------------------------------
    struct Tagged {
        node: ProcessNode,
        attribution: Attribution,
    }
    enum Attribution {
        Workspace {
            repo_id: String,
            workspace_id: String,
        },
        SidecarAgents,
        Orphan,
    }

    let mut nodes: Vec<Tagged> = Vec::with_capacity(descendants.len());

    for pid in &descendants {
        let Some(process) = system.process(*pid) else {
            continue;
        };
        let raw_name = process.name().to_string_lossy().to_string();
        let parent_pid = process.parent().map(|p| p.as_u32());
        let cpu_percent = process.cpu_usage();
        let memory_bytes = process.memory();

        let is_main = *pid == helmor_pid;
        let is_sidecar = sidecar_pid_pid.is_some_and(|s| s == *pid);
        let script_entry = script_by_pid.get(&pid.as_u32());

        let (kind, friendly_name) = if is_main {
            (ProcessKind::Main, "Main".to_string())
        } else if is_sidecar {
            (ProcessKind::Sidecar, "Sidecar".to_string())
        } else if let Some(entry) = script_entry {
            let label = format!("Script: {}", entry.script_type);
            (
                ProcessKind::Script {
                    script_type: entry.script_type.clone(),
                },
                label,
            )
        } else {
            classify_by_name(&raw_name, parent_pid, sidecar_pid_pid.map(|p| p.as_u32()))
        };

        let attribution = if let Some(entry) = script_entry {
            match &entry.workspace_id {
                Some(ws) => Attribution::Workspace {
                    repo_id: entry.repo_id.clone(),
                    workspace_id: ws.clone(),
                },
                None => Attribution::Orphan,
            }
        } else if matches!(kind, ProcessKind::Cli { .. }) {
            Attribution::SidecarAgents
        } else {
            // Pty children of a script — same workspace as their parent.
            let parent_script = parent_pid.and_then(|p| script_by_pid.get(&p));
            if let Some(parent_entry) = parent_script {
                if let Some(ws) = &parent_entry.workspace_id {
                    Attribution::Workspace {
                        repo_id: parent_entry.repo_id.clone(),
                        workspace_id: ws.clone(),
                    }
                } else {
                    Attribution::Orphan
                }
            } else {
                Attribution::Orphan
            }
        };

        nodes.push(Tagged {
            node: ProcessNode {
                pid: pid.as_u32(),
                parent_pid,
                name: friendly_name,
                raw_name,
                kind,
                cpu_percent,
                memory_bytes,
            },
            attribution,
        });
    }

    // ------------------------------------------------------------------
    // 4. Aggregate.
    // ------------------------------------------------------------------
    let mut helmor_cpu: f32 = 0.0;
    let mut helmor_memory: u64 = 0;

    // BTreeMap so we can do a deterministic post-sort by memory after build.
    let mut repos: BTreeMap<String, RepoBucket> = BTreeMap::new();
    let mut orphans: Vec<ProcessNode> = Vec::new();

    struct RepoBucket {
        label: String,
        icon_src: Option<String>,
        initials: Option<String>,
        cpu_percent: f32,
        memory_bytes: u64,
        workspaces: HashMap<String, WorkspaceBucket>,
    }
    struct WorkspaceBucket {
        title: String,
        branch: Option<String>,
        cpu_percent: f32,
        memory_bytes: u64,
        processes: Vec<ProcessNode>,
    }

    for Tagged { node, attribution } in nodes {
        helmor_cpu += node.cpu_percent;
        helmor_memory += node.memory_bytes;

        match attribution {
            Attribution::Workspace {
                repo_id,
                workspace_id,
            } => {
                let meta = ctx.workspace_index.get(&workspace_id);
                let repo_label = meta
                    .map(|m| m.repo_label.clone())
                    .unwrap_or_else(|| repo_id.clone());
                let repo_icon_src = meta.and_then(|m| m.repo_icon_src.clone());
                let repo_initials = meta.and_then(|m| m.repo_initials.clone());
                let workspace_title = meta
                    .map(|m| m.title.clone())
                    .unwrap_or_else(|| workspace_id.clone());
                let workspace_branch = meta.and_then(|m| m.branch.clone());

                let repo = repos.entry(repo_id.clone()).or_insert_with(|| RepoBucket {
                    label: repo_label,
                    icon_src: repo_icon_src,
                    initials: repo_initials,
                    cpu_percent: 0.0,
                    memory_bytes: 0,
                    workspaces: HashMap::new(),
                });
                repo.cpu_percent += node.cpu_percent;
                repo.memory_bytes += node.memory_bytes;

                let ws = repo
                    .workspaces
                    .entry(workspace_id)
                    .or_insert_with(|| WorkspaceBucket {
                        title: workspace_title,
                        branch: workspace_branch,
                        cpu_percent: 0.0,
                        memory_bytes: 0,
                        processes: Vec::new(),
                    });
                ws.cpu_percent += node.cpu_percent;
                ws.memory_bytes += node.memory_bytes;
                ws.processes.push(node);
            }
            Attribution::SidecarAgents => {
                let repo = repos
                    .entry(SIDECAR_AGENTS_REPO_ID.to_string())
                    .or_insert_with(|| RepoBucket {
                        label: SIDECAR_AGENTS_REPO_LABEL.to_string(),
                        icon_src: None,
                        initials: None,
                        cpu_percent: 0.0,
                        memory_bytes: 0,
                        workspaces: HashMap::new(),
                    });
                repo.cpu_percent += node.cpu_percent;
                repo.memory_bytes += node.memory_bytes;
                let ws = repo
                    .workspaces
                    .entry(SIDECAR_AGENTS_WORKSPACE_ID.to_string())
                    .or_insert_with(|| WorkspaceBucket {
                        title: SIDECAR_AGENTS_WORKSPACE_TITLE.to_string(),
                        branch: None,
                        cpu_percent: 0.0,
                        memory_bytes: 0,
                        processes: Vec::new(),
                    });
                ws.cpu_percent += node.cpu_percent;
                ws.memory_bytes += node.memory_bytes;
                ws.processes.push(node);
            }
            Attribution::Orphan => {
                orphans.push(node);
            }
        }
    }

    // Flatten into ordered Vec, sorted by descending memory.
    let mut repositories: Vec<RepoGroup> = repos
        .into_iter()
        .map(|(repo_id, bucket)| {
            let mut workspaces: Vec<WorkspaceUsage> = bucket
                .workspaces
                .into_iter()
                .map(|(workspace_id, ws_bucket)| {
                    let mut processes = ws_bucket.processes;
                    processes.sort_by_key(|p| std::cmp::Reverse(p.memory_bytes));
                    WorkspaceUsage {
                        workspace_id,
                        workspace_title: ws_bucket.title,
                        branch: ws_bucket.branch,
                        cpu_percent: ws_bucket.cpu_percent,
                        memory_bytes: ws_bucket.memory_bytes,
                        processes,
                    }
                })
                .collect();
            workspaces.sort_by_key(|w| std::cmp::Reverse(w.memory_bytes));
            RepoGroup {
                repo_id,
                repo_label: bucket.label,
                repo_icon_src: bucket.icon_src,
                repo_initials: bucket.initials,
                cpu_percent: bucket.cpu_percent,
                memory_bytes: bucket.memory_bytes,
                workspaces,
            }
        })
        .collect();
    repositories.sort_by_key(|r| std::cmp::Reverse(r.memory_bytes));

    orphans.sort_by_key(|p| std::cmp::Reverse(p.memory_bytes));

    // sysinfo reports cpu_usage as percent-of-one-core summed per-process;
    // divide by core count to get the fraction-of-machine that matches
    // Activity Monitor's per-process column intuitively.
    let normalised_cpu = if cpu_count > 0 {
        helmor_cpu / cpu_count as f32
    } else {
        helmor_cpu
    };

    let ram_share = if total_memory > 0 {
        helmor_memory as f32 / total_memory as f32
    } else {
        0.0
    };

    ResourceSnapshot {
        captured_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        system: SystemTotals {
            total_memory_bytes: total_memory,
            used_memory_bytes: used_memory,
            available_memory_bytes: available_memory,
            cpu_count,
        },
        helmor: HelmorRollup {
            cpu_percent: normalised_cpu,
            memory_bytes: helmor_memory,
            ram_share,
        },
        repositories,
        orphans,
    }
}

/// Heuristic name-based tagging for descendants that aren't the main
/// process, sidecar, or a known script. Returns (kind, friendly_name).
fn classify_by_name(
    raw_name: &str,
    parent_pid: Option<u32>,
    sidecar_pid: Option<u32>,
) -> (ProcessKind, String) {
    let lower = raw_name.to_ascii_lowercase();
    let from_sidecar = parent_pid == sidecar_pid && sidecar_pid.is_some();

    if lower.contains("renderer") || lower.contains("helper") || lower.contains("webcontent") {
        return (ProcessKind::Renderer, "Renderer".to_string());
    }
    if lower.contains("claude") {
        let provider = if lower.contains("codex") {
            "codex"
        } else {
            "claude-code"
        };
        return (
            ProcessKind::Cli {
                provider: provider.to_string(),
            },
            "claude-code".to_string(),
        );
    }
    if lower.contains("codex") {
        return (
            ProcessKind::Cli {
                provider: "codex".to_string(),
            },
            "codex".to_string(),
        );
    }
    if from_sidecar {
        return (
            ProcessKind::Cli {
                provider: "unknown".to_string(),
            },
            raw_name.to_string(),
        );
    }
    if matches!(
        lower.as_str(),
        "bash" | "zsh" | "fish" | "sh" | "dash" | "ksh"
    ) || lower.contains("pty")
        || lower.contains("login")
    {
        return (ProcessKind::Pty, raw_name.to_string());
    }
    (ProcessKind::Other, raw_name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(pid: u32, pgid: u32, repo: &str, ws: Option<&str>) -> ScriptPidEntry {
        ScriptPidEntry {
            pid,
            pgid,
            repo_id: repo.to_string(),
            script_type: "run".to_string(),
            workspace_id: ws.map(|s| s.to_string()),
        }
    }

    #[test]
    fn classify_by_name_buckets_known_executables() {
        let (k, _) = classify_by_name("claude-code", Some(10), Some(10));
        assert!(matches!(k, ProcessKind::Cli { .. }));

        let (k, _) = classify_by_name("codex", Some(10), Some(10));
        assert!(matches!(k, ProcessKind::Cli { provider } if provider == "codex"));

        let (k, _) = classify_by_name("Helmor Helper (Renderer)", None, None);
        assert!(matches!(k, ProcessKind::Renderer));

        let (k, _) = classify_by_name("zsh", None, None);
        assert!(matches!(k, ProcessKind::Pty));

        let (k, _) = classify_by_name("ripgrep", None, None);
        assert!(matches!(k, ProcessKind::Other));

        // Unknown-name child of the sidecar still classifies as a CLI.
        let (k, _) = classify_by_name("agentd", Some(10), Some(10));
        assert!(matches!(k, ProcessKind::Cli { .. }));
    }

    #[test]
    fn script_pid_index_round_trip() {
        let entries = [
            entry(100, 100, "repoA", Some("wsA")),
            entry(200, 200, "repoB", None),
        ];
        let by_pid: HashMap<u32, ScriptPidEntry> =
            entries.iter().cloned().map(|e| (e.pid, e)).collect();
        assert_eq!(
            by_pid.get(&100).and_then(|e| e.workspace_id.clone()),
            Some("wsA".to_string())
        );
        assert!(by_pid.get(&200).unwrap().workspace_id.is_none());
    }
}
