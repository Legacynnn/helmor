# Per-Core CPU + Richer Process Classification — Implementation Plan (Phase 2 of Resources Refactor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the resource monitor real per-core CPU + system-memory data, and classify the `gh`/`glab` (forge) and build-tool processes so "the code running" and the gh pile-up are legible in the UI.

**Architecture:** Extend the existing flat `resources/` module in place (sysinfo-only, no new deps): add per-core CPU + system memory to the snapshot in `sampler.rs`/`types.rs`, and add `Forge`/`BuildTool` variants to `ProcessKind` with matching `classify()` rules in `tree.rs`. Frontend: extend the `ResourceSnapshot` type, render a per-core CPU section, and give the new kinds icons. The existing client-side workspace grouping stays as-is.

**Tech Stack:** Rust + `sysinfo 0.33` (already a dep), React 19 + TanStack Query, Vitest.

---

## Scope decision (read first)

The approved spec listed Phase 2 as "expanded types + workspace grouping + per-core CPU". Two refinements based on the current code:

1. **`gh`/`glab` are already sampled.** They are direct children of the Rust host (`app_pid`), so `collect_descendants(app_pid)` already includes them — they just classify as `Other`. So the "make the gh pile-up visible" goal is a **classification** change, not a tree change.
2. **Workspace grouping already happens client-side** (`popover.tsx` groups by `workspaceId`). Moving grouping into a backend `grouping.rs` with a `WorkspaceResourceGroup` snapshot shape only pays off when **containers** need to live inside each group (Phase 3 Docker). Doing it now would reshape `ResourceSnapshot` twice. **Therefore the backend grouping restructure moves to Phase 3.** Phase 2 keeps the flat `processes: Vec<ProcessInfo>` shape and only adds fields.

This keeps Phase 2 small, sysinfo-only, and independently shippable.

## File Structure

- **Modify** `src-tauri/src/resources/types.rs` — add `ProcessKind::{Forge, BuildTool}`; add per-core CPU + system-memory fields to `ResourceSnapshot`; extend serde tests.
- **Modify** `src-tauri/src/resources/tree.rs` — extend `classify()` with forge + build-tool rules; extend tests.
- **Modify** `src-tauri/src/resources/sampler.rs` — refresh + populate per-core CPU and system memory in `snapshot()`.
- **Modify** `src/lib/api.ts` — extend the `ProcessKind` union + `ResourceSnapshot` type.
- **Create** `src/features/resources/cpu-section.tsx` — per-core mini-bars + system memory readout.
- **Modify** `src/features/resources/popover.tsx` — render `<CpuSection>`; add icons for the new kinds.
- **Create** `src/features/resources/cpu-section.test.tsx` — Vitest coverage.

---

## Task 1: Add `Forge` + `BuildTool` process kinds and classify them

**Files:**
- Modify: `src-tauri/src/resources/types.rs` (`ProcessKind`, ~lines 5-12, and the camelCase test)
- Modify: `src-tauri/src/resources/tree.rs` (`classify`, ~lines 27-44, and tests)

- [ ] **Step 1: Write the failing classification tests**

In `src-tauri/src/resources/tree.rs`, replace the existing `classifies_by_name` test with the version below and add a new `classifies_forge_and_build_tools` test (inside the existing `#[cfg(test)] mod tests`):

```rust
    #[test]
    fn classifies_by_name() {
        assert_eq!(classify("claude", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("codex", 5, 1, None), ProcessKind::Agent);
        assert_eq!(classify("node", 5, 1, None), ProcessKind::DevServer);
        assert_eq!(classify("fish", 5, 1, None), ProcessKind::Shell);
        assert_eq!(classify("anything", 5, 1, None), ProcessKind::Other);
    }

    #[test]
    fn classifies_forge_and_build_tools() {
        // Forge CLIs — the gh/glab pile-up should be legible.
        assert_eq!(classify("gh", 5, 1, None), ProcessKind::Forge);
        assert_eq!(classify("glab", 5, 1, None), ProcessKind::Forge);
        // Build/compile tools — "the code running".
        assert_eq!(classify("cargo", 5, 1, None), ProcessKind::BuildTool);
        assert_eq!(classify("rustc", 5, 1, None), ProcessKind::BuildTool);
        assert_eq!(classify("tsc", 5, 1, None), ProcessKind::BuildTool);
        assert_eq!(classify("esbuild", 5, 1, None), ProcessKind::BuildTool);
        // Case-insensitive.
        assert_eq!(classify("GH", 5, 1, None), ProcessKind::Forge);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib resources::tree`
Expected: FAIL to compile — `ProcessKind::Forge` / `ProcessKind::BuildTool` don't exist yet.

- [ ] **Step 3: Add the enum variants**

In `src-tauri/src/resources/types.rs`, change the `ProcessKind` enum to:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessKind {
    App,
    Sidecar,
    Agent,
    DevServer,
    Forge,
    BuildTool,
    Shell,
    Other,
}
```

- [ ] **Step 4: Extend `classify()` with the new rules**

In `src-tauri/src/resources/tree.rs`, replace the name-based branch of `classify` (the `let lower = ...` block onward) with:

```rust
    let lower = name.to_ascii_lowercase();
    if lower.contains("claude") || lower.contains("codex") {
        ProcessKind::Agent
    } else if ["gh", "glab"].contains(&lower.as_str()) {
        ProcessKind::Forge
    } else if ["cargo", "rustc", "tsc", "esbuild", "webpack", "go"]
        .contains(&lower.as_str())
    {
        ProcessKind::BuildTool
    } else if ["node", "bun", "deno", "vite"].iter().any(|n| lower == *n) {
        ProcessKind::DevServer
    } else if ["zsh", "bash", "fish", "sh"].contains(&lower.as_str()) {
        ProcessKind::Shell
    } else {
        ProcessKind::Other
    }
```

- [ ] **Step 5: Add a camelCase serde test for the new kinds**

In `src-tauri/src/resources/types.rs`, add to the `#[cfg(test)] mod tests` block:

```rust
    #[test]
    fn new_process_kinds_serialize_camel_case() {
        assert_eq!(serde_json::to_string(&ProcessKind::Forge).unwrap(), "\"forge\"");
        assert_eq!(
            serde_json::to_string(&ProcessKind::BuildTool).unwrap(),
            "\"buildTool\""
        );
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib resources::`
Expected: PASS (tree + types tests).

- [ ] **Step 7: Verify clippy is clean (lib scope)**

Run: `cd src-tauri && cargo clippy --lib -- -D warnings`
Expected: no warnings.

> Note: `cargo clippy --all-targets` may fail due to unrelated in-progress code elsewhere in the tree (Copilot WIP). Use `--lib` to scope to library code for this resources work.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/resources/types.rs src-tauri/src/resources/tree.rs
git commit -m "feat(resources): classify forge (gh/glab) and build-tool processes"
```

---

## Task 2: Add per-core CPU + system memory to the snapshot

**Files:**
- Modify: `src-tauri/src/resources/types.rs` (`ResourceSnapshot`, ~lines 37-45, and the snapshot serde test)
- Modify: `src-tauri/src/resources/sampler.rs` (`snapshot`, ~lines 26-75)

- [ ] **Step 1: Extend the `ResourceSnapshot` type + its serde test**

In `src-tauri/src/resources/types.rs`, change `ResourceSnapshot` to add four fields (keep the existing ones — the widget still reads `total_cpu_percent`/`total_memory_bytes`, which remain the Helmor-tree sums):

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    /// Sum of CPU% across the Helmor process tree (can exceed 100% — it is
    /// not normalised by core count).
    pub total_cpu_percent: f32,
    /// Sum of RSS across the Helmor process tree.
    pub total_memory_bytes: u64,
    /// Overall system CPU utilisation, 0–100.
    pub system_cpu_percent: f32,
    /// Per-logical-core utilisation, each 0–100.
    pub per_core_cpu: Vec<f32>,
    /// System-wide used / total physical memory.
    pub system_memory_used_bytes: u64,
    pub system_memory_total_bytes: u64,
    pub processes: Vec<ProcessInfo>,
    pub ports: Vec<PortInfo>,
    pub ports_unavailable: bool,
}
```

Update the existing `snapshot_fields_serialize_camel_case` test to construct the new fields and assert the new camelCase keys:

```rust
    #[test]
    fn snapshot_fields_serialize_camel_case() {
        let snap = ResourceSnapshot {
            total_cpu_percent: 1.5,
            total_memory_bytes: 1024,
            system_cpu_percent: 12.0,
            per_core_cpu: vec![10.0, 20.0],
            system_memory_used_bytes: 2048,
            system_memory_total_bytes: 4096,
            processes: vec![],
            ports: vec![],
            ports_unavailable: false,
        };
        let json = serde_json::to_value(&snap).unwrap();
        assert!(json.get("totalCpuPercent").is_some());
        assert!(json.get("systemCpuPercent").is_some());
        assert!(json.get("perCoreCpu").is_some());
        assert!(json.get("systemMemoryUsedBytes").is_some());
        assert!(json.get("systemMemoryTotalBytes").is_some());
        assert!(json.get("portsUnavailable").is_some());
        assert!(json.get("total_cpu_percent").is_none());
    }
```

- [ ] **Step 2: Run the type test to verify it fails**

Run: `cd src-tauri && cargo test --lib resources::types`
Expected: FAIL to compile — the snapshot construction in `sampler.rs` is missing the new fields, and the test references new fields.

- [ ] **Step 3: Populate the new fields in `sampler.rs`**

In `src-tauri/src/resources/sampler.rs`, inside `snapshot()`, after `system.refresh_processes(...)` (line 32) add CPU + memory refreshes:

```rust
        system.refresh_processes(ProcessesToUpdate::All, true);
        system.refresh_cpu_usage();
        system.refresh_memory();
```

Then change the final `ResourceSnapshot { ... }` construction (lines 68-74) to:

```rust
        let per_core_cpu: Vec<f32> = system.cpus().iter().map(|c| c.cpu_usage()).collect();

        ResourceSnapshot {
            total_cpu_percent: processes.iter().map(|p| p.cpu_percent).sum(),
            total_memory_bytes: processes.iter().map(|p| p.memory_bytes).sum(),
            system_cpu_percent: system.global_cpu_usage(),
            per_core_cpu,
            system_memory_used_bytes: system.used_memory(),
            system_memory_total_bytes: system.total_memory(),
            processes,
            ports: Vec::new(),
            ports_unavailable: false,
        }
```

- [ ] **Step 4: Add a sampler smoke test**

In `src-tauri/src/resources/sampler.rs`, add a `#[cfg(test)] mod tests` block at the end of the file (the sampler has no tests yet):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_reports_system_metrics() {
        let sampler = ResourceSampler::default();
        // First call primes CPU deltas; second returns real readings.
        let _ = sampler.snapshot(None);
        std::thread::sleep(std::time::Duration::from_millis(250));
        let snap = sampler.snapshot(None);

        // The host running the test always has at least one core and some RAM.
        assert!(!snap.per_core_cpu.is_empty(), "expected at least one core");
        assert!(snap.system_memory_total_bytes > 0, "expected nonzero total RAM");
        assert!(
            snap.system_memory_used_bytes <= snap.system_memory_total_bytes,
            "used must not exceed total"
        );
        // Per-core values are percentages.
        for core in &snap.per_core_cpu {
            assert!(*core >= 0.0 && *core <= 100.0, "core usage out of range: {core}");
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib resources::`
Expected: PASS (types + sampler smoke test). The sampler test takes ~0.25s due to the CPU-delta sleep.

- [ ] **Step 6: Verify clippy is clean (lib scope)**

Run: `cd src-tauri && cargo clippy --lib -- -D warnings`
Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/resources/types.rs src-tauri/src/resources/sampler.rs
git commit -m "feat(resources): add per-core CPU and system memory to snapshot"
```

---

## Task 3: Frontend — types, per-core CPU section, and kind icons

**Files:**
- Modify: `src/lib/api.ts` (the `ProcessKind` union + `ResourceSnapshot` type — search for `export type ProcessKind` and `export type ResourceSnapshot`)
- Create: `src/features/resources/cpu-section.tsx`
- Modify: `src/features/resources/popover.tsx` (render `<CpuSection>`, add icons for `forge`/`buildTool`)
- Create: `src/features/resources/cpu-section.test.tsx`

- [ ] **Step 1: Extend the TS types in `src/lib/api.ts`**

Find `export type ProcessKind = ...` and add the two new members so it reads (order irrelevant, but keep all members):

```ts
export type ProcessKind =
	| "app"
	| "sidecar"
	| "agent"
	| "devServer"
	| "forge"
	| "buildTool"
	| "shell"
	| "other";
```

Find `export type ResourceSnapshot = { ... }` and add the four new fields to match the Rust serde shape:

```ts
export type ResourceSnapshot = {
	totalCpuPercent: number;
	totalMemoryBytes: number;
	systemCpuPercent: number;
	perCoreCpu: number[];
	systemMemoryUsedBytes: number;
	systemMemoryTotalBytes: number;
	processes: ProcessInfo[];
	ports: PortInfo[];
	portsUnavailable: boolean;
};
```

(If the existing type lists fields in a different order, preserve the existing fields and simply add the four new ones — do not drop or reorder existing fields.)

- [ ] **Step 2: Write the failing test for `CpuSection`**

Create `src/features/resources/cpu-section.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CpuSection } from "./cpu-section";

describe("CpuSection", () => {
	it("renders one bar per core and the system memory readout", () => {
		render(
			<CpuSection
				systemCpuPercent={42}
				perCoreCpu={[10, 20, 30, 40]}
				systemMemoryUsedBytes={4 * 1024 ** 3}
				systemMemoryTotalBytes={16 * 1024 ** 3}
			/>,
		);
		// 4 cores -> 4 bars
		expect(screen.getAllByRole("meter")).toHaveLength(4);
		// system memory shown as used / total
		expect(screen.getByText(/4\.0 GB \/ 16\.0 GB/)).toBeInTheDocument();
	});

	it("renders nothing when there are no cores", () => {
		const { container } = render(
			<CpuSection
				systemCpuPercent={0}
				perCoreCpu={[]}
				systemMemoryUsedBytes={0}
				systemMemoryTotalBytes={0}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun x vitest run src/features/resources/cpu-section.test.tsx`
Expected: FAIL — `./cpu-section` does not exist yet.

- [ ] **Step 4: Implement `CpuSection`**

Create `src/features/resources/cpu-section.tsx`:

```tsx
import { formatBytes } from "./format";

export function CpuSection({
	systemCpuPercent,
	perCoreCpu,
	systemMemoryUsedBytes,
	systemMemoryTotalBytes,
}: {
	systemCpuPercent: number;
	perCoreCpu: number[];
	systemMemoryUsedBytes: number;
	systemMemoryTotalBytes: number;
}) {
	if (perCoreCpu.length === 0) return null;

	return (
		<div className="border-b px-3 py-2">
			<div className="flex items-baseline justify-between text-small">
				<span className="font-medium">System</span>
				<span className="tabular-nums text-muted-foreground">
					CPU {Math.round(systemCpuPercent)}%
				</span>
			</div>
			<div className="mt-1.5 flex items-end gap-0.5" aria-label="Per-core CPU usage">
				{perCoreCpu.map((usage, index) => {
					const clamped = Math.max(0, Math.min(100, usage));
					const tone =
						clamped > 80
							? "bg-red-500"
							: clamped > 50
								? "bg-amber-500"
								: "bg-muted-foreground/50";
					return (
						<div
							// Core index is a stable identity for a fixed-length core list.
							key={index}
							role="meter"
							aria-valuenow={Math.round(clamped)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label={`Core ${index}`}
							title={`Core ${index}: ${Math.round(clamped)}%`}
							className="flex h-6 flex-1 items-end overflow-hidden rounded-sm bg-accent"
						>
							<div
								className={`w-full ${tone}`}
								style={{ height: `${Math.max(4, clamped)}%` }}
							/>
						</div>
					);
				})}
			</div>
			<div className="mt-1.5 flex items-baseline justify-between text-mini text-muted-foreground">
				<span>Memory</span>
				<span className="tabular-nums">
					{formatBytes(systemMemoryUsedBytes)} /{" "}
					{formatBytes(systemMemoryTotalBytes)}
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun x vitest run src/features/resources/cpu-section.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Render `<CpuSection>` in the popover + add icons for the new kinds**

In `src/features/resources/popover.tsx`:

(a) Update the imports — add the `Hammer` and `GitPullRequest` icons and the `CpuSection` import:

```tsx
import { Bot, Copy, Cpu, GitPullRequest, Hammer, Server, SquareTerminal, X } from "lucide-react";
```

Add near the other local imports:

```tsx
import { CpuSection } from "./cpu-section";
```

(b) Extend `KIND_ICONS` to cover the new kinds (the `Record<ProcessKind, ...>` is exhaustive, so this is required to compile):

```tsx
const KIND_ICONS: Record<ProcessKind, typeof Cpu> = {
	app: Cpu,
	sidecar: Server,
	agent: Bot,
	devServer: Server,
	forge: GitPullRequest,
	buildTool: Hammer,
	shell: SquareTerminal,
	other: Cpu,
};
```

(c) Render `<CpuSection>` at the top of the scrollable body. Immediately after the header `</div>` that closes the "Helmor" sparkline block (the `<div className="border-b px-3 py-2">…</div>`), and before `<div className="min-h-0 flex-1 overflow-y-auto py-1">`, insert:

```tsx
				<CpuSection
					systemCpuPercent={snapshot.systemCpuPercent}
					perCoreCpu={snapshot.perCoreCpu}
					systemMemoryUsedBytes={snapshot.systemMemoryUsedBytes}
					systemMemoryTotalBytes={snapshot.systemMemoryTotalBytes}
				/>
```

- [ ] **Step 7: Typecheck + run the resources frontend tests**

Run: `bun run typecheck`
Expected: PASS (no TS errors from the new fields/types).

Run: `bun x vitest run src/features/resources/`
Expected: PASS (existing popover/format/history tests + the new cpu-section test).

- [ ] **Step 8: Lint**

Run: `bunx biome check src/features/resources/ src/lib/api.ts`
Expected: clean (or run `bunx biome check --write` then re-check).

- [ ] **Step 9: Commit**

```bash
git add src/lib/api.ts src/features/resources/cpu-section.tsx src/features/resources/cpu-section.test.tsx src/features/resources/popover.tsx
git commit -m "feat(resources): show per-core CPU + system memory and label forge/build processes"
```

---

## Task 4: Verification + changeset

**Files:** Create `.changeset/resources-per-core-cpu.md`

- [ ] **Step 1: Full resources test sweep**

Run: `cd src-tauri && cargo test --lib resources:: && cargo clippy --lib -- -D warnings`
Expected: PASS + clean.

Run (from repo root): `bun x vitest run src/features/resources/`
Expected: PASS.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run `bun run dev`, open the resource widget popover, and confirm: a "System" section shows per-core bars and `used / total` memory; `gh`/`glab` processes (during PR-status polling) now show the pull-request icon and `cargo`/`tsc` show the hammer icon.

- [ ] **Step 3: Add a changeset**

Create `.changeset/resources-per-core-cpu.md`:

```markdown
---
"helmor": patch
---

The resource monitor now shows per-core CPU usage and system memory, and labels forge CLI (`gh`/`glab`) and build-tool processes distinctly so background work is easier to spot.
```

- [ ] **Step 4: Commit**

```bash
git add .changeset/resources-per-core-cpu.md
git commit -m "chore: changeset for per-core CPU + process classification"
```

---

## Self-Review Notes

- **Spec coverage:** Implements the per-core CPU + "richer CPU data" and "include the code running / gh processes" parts of the resources spec. Backend workspace-grouping restructure is explicitly deferred to Phase 3 (documented in Scope decision) to avoid reshaping `ResourceSnapshot` twice.
- **Type consistency:** Rust `ResourceSnapshot` fields (`systemCpuPercent`, `perCoreCpu`, `systemMemoryUsedBytes`, `systemMemoryTotalBytes`) map 1:1 to the TS `ResourceSnapshot` via serde `camelCase`. `ProcessKind` members match between `types.rs`, `tree.rs::classify`, the TS union, and `KIND_ICONS` (exhaustive `Record` forces this).
- **No placeholders:** every code step shows complete code + exact commands.
- **sysinfo note:** `refresh_cpu_usage()` + `global_cpu_usage()` + `cpus()` + `refresh_memory()`/`used_memory()`/`total_memory()` are sysinfo 0.33 APIs already available. First snapshot returns 0% per-core (no prior delta); the persistent sampler + 1–2s poll cadence yields real values thereafter — the sampler smoke test primes with a 250ms sleep.
- **Clippy scoping:** `--lib` is used because unrelated in-progress code (Copilot WIP) currently breaks `--all-targets`; library-scoped clippy covers all code this plan touches.
