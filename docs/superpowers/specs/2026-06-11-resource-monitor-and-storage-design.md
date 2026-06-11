# Resource Monitor Widget + Storage Management Page — Design

Date: 2026-06-11
Status: Approved (pending spec review)

## Summary

Two related features:

1. **Resource widget** — a compact CPU/RAM readout in the left sidebar footer (aligned with the Settings and Feedback icons). Clicking it opens a popover showing Helmor's full process tree (PIDs, names, icons, per-process CPU/RAM), open ports owned by Helmor processes, and usage grouped by workspace, with kill actions.
2. **Storage settings page** — a new "Storage" section in the settings dialog showing Helmor's total disk footprint with a breakdown, per-workspace sizes, dead-workspace cleanup, stuck-process hygiene, maintenance actions (clear logs, vacuum DB, clear cache), and auto-cleanup policies.

## Decisions made during brainstorming

- Detail view lives in a **popover** off the widget (not a dedicated page).
- Process scope is the **Helmor process tree only** (app → sidecar → agent CLIs → their children). No system-wide process browser.
- The mini readout shows **Helmor-tree aggregate CPU% + RAM** (e.g. `3% · 1.2GB`).
- Storage page includes all four capability groups: disk breakdown, cleanup actions, process hygiene, auto-cleanup policy.
- Architecture: **frontend polling** (approach A) — no Rust background sampler for live stats; storage scans are on-demand.

## Architecture

### Backend (Rust)

New domain module `src-tauri/src/resources/` plus IPC glue in `src-tauri/src/commands/resources_commands.rs`. Add the `sysinfo` crate.

- **`resources/sampler.rs`** — owns a `sysinfo::System` in Tauri managed state behind a `Mutex` (persistent instance so CPU% deltas between refreshes are accurate). `snapshot()` refreshes processes and walks the tree from the app PID: app → sidecar (PID known from `sidecar.rs`) → agent CLIs → grandchildren (dev servers, terminals). Per-PID data: name, exe path, CPU%, RSS, parent PID, start time.
- **`resources/ports.rs`** — listening TCP ports. On macOS, parse `lsof -iTCP -sTCP:LISTEN -P -n` output filtered to tree PIDs. Additionally tag any listening port that falls inside a workspace's allocated range (`workspace/port_allocation.rs`), even if the owning PID is outside the tree. Each port entry: number, PID, process name, workspace (if attributable).
- **`resources/attribution.rs`** — maps PID → workspace: process cwd under a workspace directory, or the session registry (workspace → active agent PID). Unattributed processes group under "Helmor core".
- **`resources/storage.rs`** — `storage_breakdown()` walks the data dir and returns sizes for: per-workspace dirs, DB, logs, chats, sidecar cache. Marks workspaces *dead* (directory deleted externally) or *reclaimable* (archived but directory still present). Runs in `spawn_blocking`.
- **`resources/cleanup.rs`** — `delete_workspace_dirs(ids)`, `clear_logs(older_than)`, `vacuum_db()`, `kill_tree(pid, start_time)` (reuses `platform/process` helpers), and orphan purge (reuses existing `purge_orphaned_workspaces`).
- **Auto-cleanup** — a tokio task started at app setup reads settings keys (`autoCleanLogsDays`, `autoDeleteDeadWorkspaceFiles`) and runs at most once daily.

#### Commands

All return `CmdResult<T>` with `#[serde(rename_all = "camelCase")]`:

- `get_resource_snapshot` — process tree + ports + per-workspace aggregation (cheap, polled).
- `get_storage_breakdown` — disk usage scan (expensive, on-demand only).
- `cleanup_storage(action)` — delete workspace dirs / clear logs / vacuum DB / clear cache.
- `kill_process(pid, startTime)` — terminate a tree rooted at PID.

Registered in `lib.rs`; typed wrappers added to `src/lib/api.ts`; query keys/options in `src/lib/query-client.ts`.

#### Events

Live snapshots are pure polling — no events. Mutations (kill, cleanup) publish through the existing `UiMutationEvent` bridge: reuse `WorkspaceListChanged` where applicable and add a new `StorageChanged` variant (mirrored in `api.ts`, handled in `use-ui-sync-bridge.ts` to invalidate the storage query).

### Frontend — sidebar widget + popover

New feature folder `src/features/resources/`:

- **`index.tsx`** — `ResourceWidget`, inserted in the footer row of `src/shell/components/shell-sidebar-pane.tsx` (currently lines 271–277) between `SettingsButton` and `FeedbackButton`. Compact button: small `Activity` lucide icon + `3% · 1.2GB` text, `text-muted-foreground`, `cursor-pointer`. Color shifts: CPU > 50% amber, > 80% red. Tooltip: "Helmor resource usage".
- **`hooks/use-resource-snapshot.ts`** — React Query with `refetchInterval: 2000`, enabled only while the widget is mounted; interval tightens to 1000 ms while the popover is open. Maintains a client-side ring buffer of the last 60 samples for sparklines.
- **`popover.tsx`** — shadcn Popover, opening up-right. Sections:
  1. **Header** — Helmor total CPU/RAM with a 60-second sparkline for each.
  2. **Workspaces** — rows grouped by attribution: workspace name, process-type icon, group CPU/RAM; expandable to child processes with PID, name, CPU, RAM, and a kill button (two-step inline confirm).
  3. **Ports** — port number, owning process name + PID, workspace tag chip when inside an allocated range. Clicking a port copies `localhost:PORT`.
  4. **Footer link** — "Storage & cleanup" opens the settings dialog at the Storage section.
- **Process icons** — mapped by exe name: `claude`/`codex` → bot icon, `node`/`bun`/`vite` → server icon, shells → terminal icon, fallback → `Cpu`.
- **States** — snapshot failure: widget degrades to icon-only, popover shows a quiet error row. No processes: "No active agents".

### Frontend — Storage settings page

`src/features/settings/panels/storage.tsx`; add `"storage"` to `SettingsSection` in `src/features/settings/types.ts` and register it in the sections list in `src/features/settings/index.tsx`. Data comes from `get_storage_breakdown`, fetched when the panel opens (no polling) with a manual refresh button.

Layout, using the existing `SettingsGroup`/`SettingsRow` components:

1. **Overview** — total footprint with a horizontal stacked bar segmented into workspaces / DB / logs / chats / cache, plus a legend with sizes.
2. **Workspaces** — rows: name, branch, size, status chip (`active` / `archived` / `dead`). Dead and archived rows get a "Delete files" action showing reclaimable bytes; a bulk "Clean all dead workspaces (reclaims X GB)" action. Destructive actions use an AlertDialog confirm stating the exact byte count. Only directories are deleted — DB rows and chat history are always preserved (workspace state degrades to `archived`).
3. **Processes** — stuck-session hygiene: sessions whose agent process died, or agent processes still alive with no stream activity for over 1 hour. Rows show PID, workspace, uptime, and a Kill button (same `kill_process` command); bulk "Kill all idle agents".
4. **Maintenance** — Clear logs (shows log dir size; default "older than 7 days"), Vacuum DB (shows DB size), Clear sidecar cache.
5. **Auto-cleanup** — toggles/selects: "Auto-prune logs older than [7/14/30] days", "Auto-delete files of dead workspaces" (off by default). Persisted in app settings.

Cleanup mutations invalidate the storage query and publish `StorageChanged`.

## Error handling

- Collectors are independent: if `lsof` is missing or fails, the snapshot returns an empty port list with `portsUnavailable: true`; the UI shows "ports unavailable" while the rest renders. One collector failing never fails the snapshot.
- Kill is idempotent on already-dead PIDs. PID-reuse guard: `kill_process` takes `(pid, startTime)` and verifies the live process's start time matches before signalling.
- The UI never offers kill on the app's own PID or the sidecar PID.
- Storage walk runs in `spawn_blocking`; a per-workspace size error degrades that row to "unknown" rather than failing the scan.

## Testing

- **Rust unit tests**: PID → workspace attribution (cwd matching), `lsof` output parser against fixture strings, storage breakdown over a tempdir tree, cleanup actions over a tempdir (dead-workspace deletion preserves DB rows).
- **No pipeline/schema/storage-shape changes** → no insta snapshot coverage required. The `events.rs` change is an additive variant.
- **Frontend vitest**: widget render states (normal / hot / error), popover grouping from a mock snapshot, storage panel actions firing the right mutations behind the confirm gate.
- `cargo clippy --all-targets -- -D warnings` clean; all new files under 300 lines per repo convention.

## Out of scope

- System-wide process browser (Helmor tree only).
- Rust-side sampling history / background sampler (client-side ring buffer suffices).
- Sidecar restart controls.
- Windows/Linux port discovery (macOS `lsof` first; the ports module isolates platform code so other platforms can be added later).
