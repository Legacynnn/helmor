# Resources Monitoring Refactor — Design

**Date:** 2026-06-11
**Status:** Approved (brainstorming) — ready for implementation planning
**Branch:** `feat/resource-monitor-storage`

## Goal

Refactor Helmor's resource-usage feature into a richer, workspace-centric monitor that surfaces:

1. **All running processes** tied to a workspace — agents, dev servers, build tools, and the forge CLIs (`gh`/`glab`) — not just the app→sidecar tree.
2. **Docker containers** (read-only stats).
3. **Real GPU/CPU data** — per-core CPU + accurate GPU utilization.
4. A fix for the **`gh` process pile-up**.

## Background / root-cause findings

- **`gh` pile-up:** The live `gh` processes are children of the **Rust backend** (`target/debug/helmor`, the Tauri host), not the sidecar or agents. They come from PR/CI-status polling in `src-tauri/src/forge/`. Each poll cycle spawns ~3 `gh` calls (`auth status`, `api /user`, a large `statusCheckRollup` GraphQL query) per workspace on an interval. Observed instances were 13–14s old, so they accumulate faster than they finish (slow GraphQL, no dedup/cache/throttle). `forge/command.rs` spawns each fresh with a 15s timeout.
- **Current monitor** (`src-tauri/src/resources/` + `src/features/resources/`): `sysinfo`-based sampler, process classification (App/Sidecar/Agent/DevServer/Shell/Other), `lsof` ports, longest-prefix-cwd workspace attribution, kill-process tree, storage/cleanup commands. **No GPU, total CPU% only, no Docker.** These forge `gh` processes are invisible to it because it only walks the app→sidecar descendant tree.

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Scope | All four areas, one unified design. |
| Platforms | **macOS + Windows** first-class; Linux degrades gracefully to sysinfo. |
| GPU depth | **Full utilization via `powermetrics`** (macOS). |
| GPU elevation | **Privileged helper installed once** (one admin consent), then silent. |
| Docker | **Read-only stats** (no lifecycle control this round). |
| Process view | **Workspace-centric grouping** (attribute all related processes by cwd). |
| `gh` fix | **In-flight dedup + short-TTL cache + concurrency cap.** |
| Collection model | **Hybrid (Approach C):** cheap data on-demand; expensive streams (powermetrics, docker) run only while the popover is open, into a shared cache. |

## Architecture

```
forge/ (gh fix) ──────────── independent, ships first
resources/collectors/ ────── per-core CPU, processes, ports, docker, gpu
resources/service.rs ─────── background streams (powermetrics, docker) + shared cache
helmor-metrics-helper ────── privileged macOS helper (powermetrics)
features/resources/ (UI) ─── workspace-grouped popover + GPU/CPU/Docker sections
```

### Collection model — Hybrid (Approach C)

- **Cheap data on-demand per snapshot** (unchanged cadence): sysinfo CPU/mem/processes, `lsof` ports.
- **Expensive sources via long-lived streams** that run **only while the resource popover is open / window focused**, writing into an `Arc<RwLock<MetricsCache>>`:
  - `powermetrics` GPU stream (via the privileged helper).
  - `docker stats` stream (slow cadence).
- The frontend signals open/close via a `set_resource_streaming(active)` command; streams stop after a short grace period so quick reopens don't thrash. This isolates expensive collectors, gives `powermetrics` a proper long-lived stream (no repeated ~1–2s cold-starts), and avoids battery drain when idle.

## Backend module layout (`src-tauri/src/resources/`)

Convert the flat module into focused collectors (every file < 300 lines, per repo rules):

- `collectors/cpu.rs` — sysinfo per-core CPU `Vec<f32>` + memory (used/total/pressure). On-demand.
- `collectors/process.rs` — existing tree + classification, **extended** to also capture direct Rust-host children (where `gh`/`glab` live) and richer kinds (e.g. `BuildTool`, `Forge`, `DevServer`).
- `collectors/ports.rs` — moved as-is (`lsof`).
- `collectors/docker.rs` — `docker stats --no-stream --format {{json}}` + `docker ps`; parses container CPU/mem/status; stream-backed. Hidden if Docker absent/not running.
- `collectors/gpu/` — `mod.rs` (trait + `GpuSnapshot`), `macos.rs` (reads from the privileged helper stream), `windows.rs` (NVML → `nvidia-smi` fallback; PDH counters for integrated GPUs), `noop.rs` (Linux/unavailable).
- `service.rs` — owns the long-lived `powermetrics` + `docker stats` streams and the shared `MetricsCache`; start/stop tied to `set_resource_streaming`.
- `grouping.rs` — **workspace-centric grouping**: attributes processes + containers + ports by cwd (extends today's longest-prefix attribution); produces `WorkspaceResourceGroup`s plus one "Unattributed" group.
- `types.rs` — expanded snapshot (below). `cleanup.rs` / `auto_cleanup.rs` unchanged.

## Data shape (`get_resource_snapshot`)

```
ResourceSnapshot {
  system: {
    totalCpuPercent,
    perCoreCpu: f32[],
    memory { used, total, pressure },
    gpu?: {
      source: "helper" | "windows" | "unavailable",
      devices: [{ name, utilPercent, memUsed, memTotal, power? }]
    }
  },
  workspaces: WorkspaceResourceGroup[] {
    workspaceId, name, aggCpuPercent, aggMemoryBytes,
    processes: ProcessInfo[],     // agents, dev servers, gh/glab, build tools
    containers: ContainerInfo[],  // docker, attributed by cwd/compose
    ports: PortInfo[]
  },
  unattributed: WorkspaceResourceGroup,
  dockerAvailable: bool,
  gpuSource,
  portsUnavailable
}
```

GPU + Docker fields are served from the cache (populated by streams while the popover is open). When streams are cold, the snapshot returns last-known values plus a freshness flag rather than blocking or erroring. Serde `camelCase` so JSON matches the TS types directly.

## Privileged GPU helper (heaviest piece — its own phase/PR)

A small separate signed/notarized binary `helmor-metrics-helper` (new Cargo target). Installed **once** via `SMAppService` (macOS 13+ daemon registration; one admin-consent prompt), then runs silently. It executes `powermetrics --samplers gpu_power -i 1000 -f plist` and streams parsed GPU util/power samples to the host over a local socket.

The host treats it as **optional**: if not installed → `gpuSource: "unavailable"` and the UI shows an "Enable precise GPU monitoring" button that triggers registration. **Windows needs no helper** (GPU counters are user-accessible). Because of notarization weight, the rest of the monitor must work fully without the helper.

## Forge `gh` fix (`src-tauri/src/forge/`)

New `forge/throttle.rs` wrapping `run_command`:

- **In-flight dedup** — identical concurrent `(program, args)` calls share one subprocess + result.
- **Short-TTL cache** — ~5–8s cache for idempotent read calls (`auth status`, PR-status GraphQL); rapid re-polls reuse results.
- **Concurrency cap** — a semaphore limiting total concurrent `gh`/`glab` spawns (e.g. 4).

PR/CI-status polling routes through this layer. Net effect: the deep `gh` pile-up collapses to at most a handful, most polls hit cache. This change is independent of the sampler and ships first.

## Frontend (`src/features/resources/`)

`popover.tsx` decomposed into focused sub-components (< 300 lines each):

- `workspace-group.tsx` — one workspace's processes + containers + ports + aggregates.
- `process-row.tsx` — single process row (reuses existing kill-button pattern).
- `cpu-section.tsx` — per-core mini-bars + total.
- `gpu-section.tsx` — devices, util/mem/power; "Enable precise GPU" CTA when `gpuSource == "unavailable"`.
- `docker-section.tsx` — read-only container list.
- `hooks/use-resource-streaming.ts` — calls `set_resource_streaming(true/false)` on popover open/close.

Widget (`index.tsx`) gains an optional GPU% readout alongside CPU/mem. Docker is read-only (no controls this round).

## Error handling & graceful degradation

- No Docker / daemon down → Docker section hidden, `dockerAvailable: false`.
- Helper not installed → `gpuSource: "unavailable"` + CTA; never blocks.
- `lsof` / `powermetrics` / helper failure → flags set, logged, never a hard error.
- Windows without supported GPU → GPU section shows what PDH provides or hides.
- Linux → sysinfo-only; GPU/helper noop.

## Testing

- **Rust unit tests:** grouping/attribution; `powermetrics` plist parse (fixture); `docker stats` JSON parse (fixture); forge throttle (dedup, cache TTL, semaphore cap).
- **Snapshot-shape coverage:** insta snapshot of the serialized `ResourceSnapshot` (resources is not in `pipeline/`, so no pipeline-snapshot mandate, but lock the JSON contract the TS types depend on).
- **Frontend vitest:** new sections + `use-resource-streaming` hook (streaming toggles on open/close).

## Build sequence

1. **Forge `gh` fix** — immediate, isolated value.
2. **Expanded types + workspace grouping + per-core CPU** — sysinfo only, no new deps.
3. **Docker read-only stats** — stream + parse + UI section.
4. **GPU** — privileged helper (macOS) + Windows backend + UI section/CTA.
5. **UI rework** — decompose popover into sections.

## Out of scope (this round)

- Docker lifecycle control (start/stop/restart) — read-only only.
- Linux first-class GPU.
- Historical/persisted metrics beyond the existing client-side sparkline buffer.
- Network/disk I/O metrics.
