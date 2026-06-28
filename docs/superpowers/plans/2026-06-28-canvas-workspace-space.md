# Canvas Workspace Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote canvas from a transient per-workspace view toggle into a strict workspace *type* (`normal` | `canvas`), chosen at creation, with a segmented sidebar space-switch that slides between a Normal world (today's 3-column layout) and an immersive Canvas world (mission-control overview + full-bleed canvas).

**Architecture:** Add a persisted `space` column to `workspaces` (DB source of truth for *what kind*), surfaced as a Rust `WorkspaceSpace` enum and a TS `WorkspaceSpace` type. A small frontend `useSpaceStore` tracks the *active space* (which world is shown) + last-selected workspace per space, replacing the localStorage `useCanvasModeStore`. `app-shell-layout.tsx` branches on active space: Normal renders the existing layout; Canvas renders a new `CanvasWorld` (mission-control overview of live tiles + the existing `CanvasSurface`). The create-workspace tab gets an inline Normal/Canvas toggle. Old entry points (per-row "Open in canvas", `canvasModeEnabled` setting) are removed.

**Tech Stack:** Rust (Tauri v2, rusqlite, serde, insta snapshots), React 19 + TypeScript + Zustand + TanStack Query, Vitest + Testing Library, Tailwind v4.

---

## File Structure

**Backend (Rust):**
- `src-tauri/src/workspace/state.rs` — add `WorkspaceSpace` enum (mirrors `WorkspaceMode` shape).
- `src-tauri/src/schema.rs` — idempotent migration: add `workspaces.space TEXT NOT NULL DEFAULT 'normal'`.
- `src-tauri/src/models/workspaces.rs` — add `space: WorkspaceSpace` to `WorkspaceRecord`, row mapping, and insert; thread `space` through create impls.
- `src-tauri/src/commands/workspace_commands.rs` — accept `space` in `prepare_workspace_from_repo` / `prepare_chat_workspace`.
- `src-tauri/tests/` — migration + round-trip coverage.

**Frontend (TS/React):**
- `src/lib/api.ts` — `WorkspaceSpace` type, `WorkspaceRow.space`, `space` param on create wrappers.
- `src/features/canvas/use-space-store.ts` — **new**: active-space + last-selected-per-space store (replaces `use-canvas-mode.ts`).
- `src/features/navigation/space-switch.tsx` — **new**: segmented "Workspaces | Canvas" control.
- `src/shell/components/app-shell-layout.tsx` — branch on active space; mount `CanvasWorld`.
- `src/shell/components/canvas-world/index.tsx` — **new**: Canvas world shell (overview ⇄ in-workspace + slide).
- `src/shell/components/canvas-world/mission-control.tsx` — **new**: tile grid + "+ New canvas".
- `src/features/workspace-start/index.tsx` + `create-workspace.ts` — inline mode toggle; pass `space`.
- Removals: `src/features/navigation/row-item.tsx` (open-in-canvas button/menu), `src/features/settings/panels/canvas-mode.tsx` + `src/lib/settings.ts` (`canvasModeEnabled`), `src/features/canvas/use-canvas-mode.ts` (delete).

---

## Phase 1 — Data model (Rust + DB)

### Task 1: `WorkspaceSpace` enum

**Files:**
- Modify: `src-tauri/src/workspace/state.rs` (append after `WorkspaceMode` block, before `WorkspaceBranchIntent`)
- Test: `src-tauri/src/workspace/state.rs` (inline `#[cfg(test)]` module — follow existing test style in this file)

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` block in `state.rs` (create the module if absent, mirroring sibling enum tests):

```rust
#[test]
fn workspace_space_round_trips() {
    use super::WorkspaceSpace;
    assert_eq!(WorkspaceSpace::default(), WorkspaceSpace::Normal);
    assert_eq!(WorkspaceSpace::Normal.as_str(), "normal");
    assert_eq!(WorkspaceSpace::Canvas.as_str(), "canvas");
    assert_eq!("canvas".parse::<WorkspaceSpace>().unwrap(), WorkspaceSpace::Canvas);
    assert!("bogus".parse::<WorkspaceSpace>().is_err());
    assert_eq!(
        serde_json::to_string(&WorkspaceSpace::Canvas).unwrap(),
        "\"canvas\""
    );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --lib workspace_space_round_trips`
Expected: FAIL — `cannot find type WorkspaceSpace`.

- [ ] **Step 3: Implement the enum**

Insert into `src-tauri/src/workspace/state.rs` (after the `WorkspaceMode` `impl ToSql` block):

```rust
/// Which "space" a workspace lives in. `Normal` = the classic 3-column
/// chat/inspector layout. `Canvas` = the full-bleed infinite-canvas world.
/// Strictly 1:1 with a workspace, chosen at creation. Distinct from
/// [`WorkspaceMode`] (filesystem provisioning) — a Canvas workspace can
/// still be worktree/local/chat under the hood.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSpace {
    #[default]
    Normal,
    Canvas,
}

impl WorkspaceSpace {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Canvas => "canvas",
        }
    }
}

impl fmt::Display for WorkspaceSpace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug)]
pub struct UnknownWorkspaceSpace(pub String);

impl fmt::Display for UnknownWorkspaceSpace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown workspace space: {:?}", self.0)
    }
}

impl std::error::Error for UnknownWorkspaceSpace {}

impl FromStr for WorkspaceSpace {
    type Err = UnknownWorkspaceSpace;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "normal" => Ok(Self::Normal),
            "canvas" => Ok(Self::Canvas),
            other => Err(UnknownWorkspaceSpace(other.to_string())),
        }
    }
}

impl FromSql for WorkspaceSpace {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let s = value.as_str()?;
        s.parse()
            .map_err(|e: UnknownWorkspaceSpace| FromSqlError::Other(Box::new(e)))
    }
}

impl ToSql for WorkspaceSpace {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::Text(
            self.as_str().as_bytes(),
        )))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test --lib workspace_space_round_trips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workspace/state.rs
git commit -m "feat(workspace): add WorkspaceSpace enum (normal|canvas)"
```

---

### Task 2: Schema migration — add `space` column

**Files:**
- Modify: `src-tauri/src/schema.rs` — table DDL (`CREATE TABLE IF NOT EXISTS workspaces`) + `run_migrations`
- Test: `src-tauri/src/schema.rs` (existing `#[cfg(test)]` — `ensure_schema_*` tests already there)

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)]` module in `schema.rs`:

```rust
#[test]
fn workspaces_has_space_column_defaulting_normal() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    // Simulate a legacy row inserted without `space`.
    conn.execute(
        "INSERT INTO workspaces (id, repository_id, directory_name) VALUES ('w1','r1','dir')",
        [],
    )
    .unwrap();
    let space: String = conn
        .query_row("SELECT space FROM workspaces WHERE id = 'w1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(space, "normal");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --lib workspaces_has_space_column_defaulting_normal`
Expected: FAIL — `no such column: space`.

- [ ] **Step 3: Add the column to DDL + migration**

In `schema.rs`, add `space TEXT NOT NULL DEFAULT 'normal',` to the `CREATE TABLE IF NOT EXISTS workspaces (...)` block (next to `mode TEXT DEFAULT 'worktree',`).

Then add to `run_migrations` (next to the `parent_workspace_id` migration, mirroring its guard):

```rust
// Canvas-as-a-space: workspaces are strictly Normal or Canvas, chosen at
// creation. DEFAULT 'normal' backfills all existing rows. Distinct from
// the `mode` column (filesystem provisioning).
if has_table(connection, "workspaces")
    && !has_column(connection, "workspaces", "space")
{
    connection
        .execute_batch("ALTER TABLE workspaces ADD COLUMN space TEXT NOT NULL DEFAULT 'normal'")
        .context("Failed to add workspaces.space column")?;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib workspaces_has_space_column_defaulting_normal ensure_schema_is_idempotent`
Expected: PASS (both — idempotency proves the migration guard works on re-run).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/schema.rs
git commit -m "feat(schema): add workspaces.space column with normal backfill"
```

---

### Task 3: `WorkspaceRecord.space` + read/write threading

**Files:**
- Modify: `src-tauri/src/models/workspaces.rs` (struct, row mapping, SELECT column list, insert fn + INSERT statements)

- [ ] **Step 1: Add the struct field**

In `WorkspaceRecord` (after `pub mode: WorkspaceMode,`):

```rust
    pub space: WorkspaceSpace,
```

Update the import on line 10:

```rust
    workspace_state::{WorkspaceBranchIntent, WorkspaceMode, WorkspaceSpace, WorkspaceState},
```

- [ ] **Step 2: Thread through the SELECT + row mapping**

Find the SELECT that maps into `WorkspaceRecord` (the query feeding `row.get(15)? // mode`). Add `w.space` to the column list (append at the **end** of the selected columns to avoid renumbering existing positional `row.get(N)` calls), then read it with the next index. Example (adjust `N` to the new last index):

```rust
        // ...existing columns...
        space: row.get::<_, WorkspaceSpace>(N)?,
```

> Use the existing positional pattern in this file. If the mapper uses a trailing index, `space` becomes the new highest index; if it uses named columns, add `space` by name. Verify by reading the SELECT immediately above the mapping closure before editing.

- [ ] **Step 3: Thread through inserts**

In `insert_initializing_workspace_and_session_with_mode`, add a `space: WorkspaceSpace` parameter (after `mode: WorkspaceMode,`), add `space,` to the INSERT column list and a new `?N` placeholder, and pass `space` in the params tuple. Repeat for the second INSERT block (line ~412) if it also creates workspace rows.

```rust
pub(crate) fn insert_initializing_workspace_and_session_with_mode(
    repository: &repos::RepositoryRecord,
    workspace_id: &str,
    session_id: &str,
    directory_name: &str,
    branch: &str,
    default_branch: &str,
    mode: WorkspaceMode,
    space: WorkspaceSpace,
    branch_intent: WorkspaceBranchIntent,
    status: WorkspaceStatus,
    timestamp: &str,
) -> Result<()> {
```

Add `space,` to the column list right after `mode,`, add a placeholder, and insert `space` into the params tuple right after `mode`.

- [ ] **Step 4: Fix all call sites**

Run: `cd src-tauri && cargo build` — the compiler lists every caller of the changed signature. For each create path, pass the caller's `space` (added in Task 4) or `WorkspaceSpace::default()` for paths that don't yet thread it (e.g. internal/test helpers).

- [ ] **Step 5: Run build + workspace model tests**

Run: `cd src-tauri && cargo test --lib models::workspaces`
Expected: PASS / compiles clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models/workspaces.rs
git commit -m "feat(workspace): persist and read workspace space on WorkspaceRecord"
```

---

### Task 4: Accept `space` in create commands

**Files:**
- Modify: `src-tauri/src/commands/workspace_commands.rs` (`prepare_workspace_from_repo`, `prepare_chat_workspace`)
- Modify: `src-tauri/src/models/workspaces.rs` (create impls thread `space` into the insert)

- [ ] **Step 1: Add `space` param to `prepare_workspace_from_repo`**

```rust
pub async fn prepare_workspace_from_repo(
    app: AppHandle,
    repo_id: String,
    source_branch: Option<String>,
    mode: Option<crate::workspace_state::WorkspaceMode>,
    space: Option<crate::workspace_state::WorkspaceSpace>,
    branch_intent: Option<crate::workspace_state::WorkspaceBranchIntent>,
    initial_status: Option<WorkspaceStatus>,
    seed_session_id: Option<String>,
) -> CmdResult<workspaces::PrepareWorkspaceResponse> {
    let mode = mode.unwrap_or_default();
    let space = space.unwrap_or_default();
    // ...thread `space` into each create impl call below...
}
```

Thread `space` into the `prepare_worktree_workspace_from_repo` / `prepare_local_workspace_from_repo` impls so it reaches `insert_initializing_workspace_and_session_with_mode`. Do the same in `prepare_chat_workspace` (canvas chat workspaces are valid — pass the caller's `space`).

- [ ] **Step 2: Build to surface the impl signatures**

Run: `cd src-tauri && cargo build`
Expected: errors pointing at each impl that needs a `space` param added — add it and pass through to the insert.

- [ ] **Step 3: Run clippy**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: zero warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/workspace_commands.rs src-tauri/src/models/workspaces.rs
git commit -m "feat(workspace): thread space through create commands"
```

---

### Task 5: Integration test — `space` round-trips through create

**Files:**
- Test: add to the existing workspace persistence integration tests (`src-tauri/tests/` — find the test module that creates workspaces and asserts on `WorkspaceRecord`; follow `tests/common/mod.rs` helpers)

- [ ] **Step 1: Write the test**

```rust
#[test]
fn canvas_space_persists_through_create_and_list() {
    let _db = common::test_db(); // use existing harness helper
    let repo = common::seed_repo();
    workspaces::insert_initializing_workspace_and_session_with_mode(
        &repo, "ws-canvas", "sess-1", "dir", "branch", "main",
        WorkspaceMode::Worktree, WorkspaceSpace::Canvas,
        WorkspaceBranchIntent::FromBranch, WorkspaceStatus::default(), "2026-06-28T00:00:00Z",
    ).unwrap();
    let rec = workspaces::get_workspace_record("ws-canvas").unwrap();
    assert_eq!(rec.space, WorkspaceSpace::Canvas);
}
```

> Adapt helper names (`test_db`, `seed_repo`, `get_workspace_record`) to the real ones in `tests/common/mod.rs` — read it first.

- [ ] **Step 2: Run + verify pass**

Run: `cd src-tauri && cargo test --test <module_name> canvas_space_persists_through_create_and_list`
Expected: PASS.

- [ ] **Step 3: Run full pipeline snapshots (schema-change rule)**

Run: `cd src-tauri && cargo test --tests`
Expected: PASS. If a snapshot drifts, inspect the diff; accept only if the new shape is the intended `space` addition (`cargo insta review`).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests
git commit -m "test(workspace): cover space round-trip through create"
```

---

## Phase 2 — Frontend types + active-space state + space switch

### Task 6: `WorkspaceSpace` TS type + create wrappers

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts` (or co-located; create if none for this area)

- [ ] **Step 1: Add the type + field + param**

After the `WorkspaceMode` type definition in `api.ts`:

```ts
/** Mirror of the Rust `WorkspaceSpace` enum (`src-tauri/src/workspace/state.rs`). */
export type WorkspaceSpace = "normal" | "canvas";
```

Add to `WorkspaceRow`:

```ts
	space?: WorkspaceSpace;
```

Add `space` to `prepareWorkspaceFromRepo` (after `mode`):

```ts
export async function prepareWorkspaceFromRepo(
	repoId: string,
	sourceBranch?: string | null,
	mode?: WorkspaceMode | null,
	space?: WorkspaceSpace | null,
	branchIntent?: WorkspaceBranchIntent | null,
	initialStatus?: WorkspaceStatus | null,
	seedSessionId?: string | null,
): Promise<PrepareWorkspaceResponse> {
	return invoke<PrepareWorkspaceResponse>("prepare_workspace_from_repo", {
		repoId,
		sourceBranch: sourceBranch ?? null,
		mode: mode ?? null,
		space: space ?? null,
		branchIntent: branchIntent ?? null,
		initialStatus: initialStatus ?? null,
		seedSessionId: seedSessionId ?? null,
	});
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes (fix any call site of `prepareWorkspaceFromRepo` that passes positional args after `mode` — they shift by one; named/optional callers are unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): add WorkspaceSpace type and space create param"
```

---

### Task 7: `useSpaceStore` (active space + last-selected per space)

**Files:**
- Create: `src/features/canvas/use-space-store.ts`
- Test: `src/features/canvas/use-space-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSpaceStore } from "./use-space-store";

describe("useSpaceStore", () => {
	beforeEach(() => {
		localStorage.clear();
		useSpaceStore.setState({ activeSpace: "normal", lastSelected: {} });
	});

	it("defaults to normal", () => {
		expect(useSpaceStore.getState().activeSpace).toBe("normal");
	});

	it("switches space and remembers last selected per space", () => {
		act(() => useSpaceStore.getState().rememberSelection("normal", "wn"));
		act(() => useSpaceStore.getState().setActiveSpace("canvas"));
		act(() => useSpaceStore.getState().rememberSelection("canvas", "wc"));
		expect(useSpaceStore.getState().lastSelected).toEqual({ normal: "wn", canvas: "wc" });
		expect(useSpaceStore.getState().activeSpace).toBe("canvas");
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun x vitest run src/features/canvas/use-space-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```ts
import { create } from "zustand";
import type { WorkspaceSpace } from "@/lib/api";

const ACTIVE_KEY = "helmor.active_space";
const SELECTED_KEY = "helmor.space_last_selected";

function loadActive(): WorkspaceSpace {
	try {
		const v = localStorage.getItem(ACTIVE_KEY);
		return v === "canvas" ? "canvas" : "normal";
	} catch {
		return "normal";
	}
}

function loadSelected(): Partial<Record<WorkspaceSpace, string>> {
	try {
		const raw = localStorage.getItem(SELECTED_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

type SpaceStore = {
	activeSpace: WorkspaceSpace;
	lastSelected: Partial<Record<WorkspaceSpace, string>>;
	setActiveSpace: (space: WorkspaceSpace) => void;
	rememberSelection: (space: WorkspaceSpace, workspaceId: string) => void;
};

export const useSpaceStore = create<SpaceStore>((set) => ({
	activeSpace: loadActive(),
	lastSelected: loadSelected(),
	setActiveSpace: (space) =>
		set(() => {
			try {
				localStorage.setItem(ACTIVE_KEY, space);
			} catch {}
			return { activeSpace: space };
		}),
	rememberSelection: (space, workspaceId) =>
		set((s) => {
			const next = { ...s.lastSelected, [space]: workspaceId };
			try {
				localStorage.setItem(SELECTED_KEY, JSON.stringify(next));
			} catch {}
			return { lastSelected: next };
		}),
}));

/** Reactive: which world is currently shown. */
export function useActiveSpace(): WorkspaceSpace {
	return useSpaceStore((s) => s.activeSpace);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun x vitest run src/features/canvas/use-space-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/use-space-store.ts src/features/canvas/use-space-store.test.ts
git commit -m "feat(canvas): add useSpaceStore for active-space view state"
```

---

### Task 8: Space switch segmented control

**Files:**
- Create: `src/features/navigation/space-switch.tsx`
- Test: `src/features/navigation/space-switch.test.tsx`
- Modify: `src/features/navigation/index.tsx` (mount the switch at the top of the sidebar)

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { SpaceSwitch } from "./space-switch";

describe("SpaceSwitch", () => {
	it("switches active space on click", () => {
		useSpaceStore.setState({ activeSpace: "normal", lastSelected: {} });
		render(<SpaceSwitch />);
		fireEvent.click(screen.getByRole("tab", { name: /canvas/i }));
		expect(useSpaceStore.getState().activeSpace).toBe("canvas");
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun x vitest run src/features/navigation/space-switch.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { LayoutGrid, PanelsTopLeft } from "lucide-react";
import { useActiveSpace, useSpaceStore } from "@/features/canvas/use-space-store";
import { cn } from "@/lib/utils";

const TABS = [
	{ id: "normal" as const, label: "Workspaces", Icon: PanelsTopLeft },
	{ id: "canvas" as const, label: "Canvas", Icon: LayoutGrid },
];

export function SpaceSwitch() {
	const active = useActiveSpace();
	const setActiveSpace = useSpaceStore((s) => s.setActiveSpace);
	return (
		<div role="tablist" className="flex gap-1 rounded-lg bg-app-muted p-1">
			{TABS.map(({ id, label, Icon }) => (
				<button
					key={id}
					role="tab"
					aria-selected={active === id}
					onClick={() => setActiveSpace(id)}
					className={cn(
						"flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
						active === id
							? "bg-app-base text-app-foreground shadow-sm"
							: "text-app-muted-foreground hover:text-app-foreground",
					)}
				>
					<Icon className="size-3.5" />
					{label}
				</button>
			))}
		</div>
	);
}
```

Mount it at the top of the sidebar in `src/features/navigation/index.tsx` (above the workspace list). Filter the rendered workspace rows by `active === "normal"` so only normal workspaces show in the normal sidebar (canvas workspaces are shown by mission-control, not here).

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `bun x vitest run src/features/navigation/space-switch.test.tsx && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/navigation/space-switch.tsx src/features/navigation/space-switch.test.tsx src/features/navigation/index.tsx
git commit -m "feat(navigation): add Workspaces|Canvas space switch"
```

---

## Phase 3 — Canvas world layout + mission control

### Task 9: Layout branch on active space

**Files:**
- Modify: `src/shell/components/app-shell-layout.tsx`
- Modify: `src/shell/components/app-shell.tsx` and `src/shell/hooks/use-app-shell-state.tsx` (replace `canvasActive` derivation)

- [ ] **Step 1: Replace the `canvasActive` derivation**

In `app-shell.tsx` and `use-app-shell-state.tsx`, replace:

```ts
const canvasActive =
    useIsCanvasMode(selectedWorkspaceId) && s.appSettings.canvasModeEnabled;
```

with:

```ts
const canvasActive = useActiveSpace() === "canvas";
```

(import `useActiveSpace` from `@/features/canvas/use-space-store`).

- [ ] **Step 2: Branch the layout**

In `app-shell-layout.tsx`, when `canvasActive`, render the new `<CanvasWorld />` (Task 10) **instead of** the `CanvasSurface`-only branch, and hide the normal left sidebar (it is already conditional on `!canvasActive`). The Normal branch is unchanged.

```tsx
{canvasActive ? (
	<CanvasWorld />
) : (
	/* existing normal layout (WorkspacePaneSurface / ScreenHost + inspector) */
)}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: passes (will still fail to find `CanvasWorld` until Task 10 — do Task 10 in the same working session before committing).

- [ ] **Step 4: Commit (after Task 10 compiles)**

```bash
git add src/shell/components/app-shell.tsx src/shell/components/app-shell-layout.tsx src/shell/hooks/use-app-shell-state.tsx
git commit -m "feat(shell): branch layout on active space"
```

---

### Task 10: Canvas world shell + mission-control overview

**Files:**
- Create: `src/shell/components/canvas-world/index.tsx`
- Create: `src/shell/components/canvas-world/mission-control.tsx`
- Test: `src/shell/components/canvas-world/mission-control.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MissionControl } from "./mission-control";

describe("MissionControl", () => {
	it("renders a tile per canvas workspace plus a new-canvas tile", () => {
		render(
			<MissionControl
				workspaces={[
					{ id: "a", title: "Alpha" },
					{ id: "b", title: "Beta" },
				]}
				onOpen={vi.fn()}
				onCreate={vi.fn()}
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /new canvas/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun x vitest run src/shell/components/canvas-world/mission-control.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mission-control.tsx`**

```tsx
import { Plus } from "lucide-react";

export type CanvasTile = { id: string; title: string };

export function MissionControl({
	workspaces,
	onOpen,
	onCreate,
}: {
	workspaces: CanvasTile[];
	onOpen: (id: string) => void;
	onCreate: () => void;
}) {
	return (
		<div className="grid size-full auto-rows-[180px] grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 overflow-auto bg-app-base p-6">
			{workspaces.map((w) => (
				<button
					key={w.id}
					onClick={() => onOpen(w.id)}
					className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-app-border bg-app-muted text-left transition-shadow hover:shadow-md"
				>
					<div className="flex-1 bg-app-base/40" aria-hidden />
					<div className="border-app-border border-t px-3 py-2 text-app-foreground text-sm">
						{w.title}
					</div>
				</button>
			))}
			<button
				onClick={onCreate}
				aria-label="New canvas"
				className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-app-border border-dashed text-app-muted-foreground transition-colors hover:text-app-foreground"
			>
				<Plus className="size-6" />
				<span className="text-sm">New canvas</span>
			</button>
		</div>
	);
}
```

> The tile preview area is a placeholder background for now. Live thumbnail rendering is a deliberate follow-up (see spec "Open questions"). Wire a static preview first; do not block this task on thumbnails.

- [ ] **Step 4: Implement `index.tsx` (world shell)**

`CanvasWorld` owns overview ⇄ in-workspace state. It:
- queries the workspace list, filters `space === "canvas"`, maps to `CanvasTile[]`;
- shows `MissionControl` when no canvas workspace is selected, else the existing `CanvasSurface` (lazy) for the selected one;
- on mount, restores `lastSelected.canvas` from `useSpaceStore` (else overview);
- on tile open → `rememberSelection("canvas", id)` + set local selected; provides a zoom-out control to clear selection back to overview;
- "+ New canvas" → calls the create flow with `space: "canvas"` (Task 12 helper) then opens the new id.

```tsx
import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { workspaceGroupsQueryOptions } from "@/lib/query-client"; // adjust to real key
import { MissionControl } from "./mission-control";

const CanvasSurface = lazy(() => import("@/features/canvas"));

export function CanvasWorld() {
	const remembered = useSpaceStore((s) => s.lastSelected.canvas ?? null);
	const remember = useSpaceStore((s) => s.rememberSelection);
	const [selected, setSelected] = useState<string | null>(remembered);
	const { data } = useQuery(workspaceGroupsQueryOptions());
	const tiles = (data ?? [])
		.flatMap((g) => g.rows)
		.filter((r) => r.space === "canvas")
		.map((r) => ({ id: r.id, title: r.title ?? r.directoryName ?? r.id }));

	if (!selected) {
		return (
			<MissionControl
				workspaces={tiles}
				onOpen={(id) => {
					remember("canvas", id);
					setSelected(id);
				}}
				onCreate={() => {
					/* call create-canvas helper (Task 12), then setSelected(newId) */
				}}
			/>
		);
	}

	return (
		<div className="relative size-full">
			<button
				onClick={() => setSelected(null)}
				aria-label="Back to canvas overview"
				className="absolute top-3 left-3 z-10 flex cursor-pointer items-center gap-1 rounded-md bg-app-base/80 px-2 py-1 text-app-foreground text-xs shadow-sm backdrop-blur"
			>
				<ArrowLeft className="size-3.5" /> Overview
			</button>
			<Suspense fallback={<div className="flex size-full items-center justify-center text-app-muted-foreground text-sm">Loading canvas…</div>}>
				<CanvasSurface workspaceId={selected} />
			</Suspense>
		</div>
	);
}
```

> Adjust `workspaceGroupsQueryOptions` / row field names (`title`, `directoryName`) to the real ones in `src/lib/query-client.ts` and `WorkspaceRow` — read them before editing. `CanvasSurface`'s `onSelectWorkspace` prop is no longer needed (mission-control replaces the in-canvas switcher); drop it.

- [ ] **Step 5: Run tests + typecheck**

Run: `bun x vitest run src/shell/components/canvas-world/mission-control.test.tsx && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shell/components/canvas-world
git commit -m "feat(canvas): mission-control overview + canvas world shell"
```

---

### Task 11: Slide transition between worlds

**Files:**
- Modify: `src/shell/components/app-shell-layout.tsx` (wrap the two branches in a sliding container)
- Test: manual (visual) — covered by verification step below

- [ ] **Step 1: Add the slide container**

Wrap Normal + Canvas branches in a horizontal track that translates on `activeSpace`. Keep it CSS-only (Tailwind `transition-transform`) to avoid a new dependency:

```tsx
<div className="relative size-full overflow-hidden">
	<div
		className="flex size-full transition-transform duration-300 ease-out"
		style={{ transform: canvasActive ? "translateX(-100%)" : "translateX(0)" }}
	>
		<div className="size-full shrink-0">{/* normal layout */}</div>
		<div className="size-full shrink-0">{canvasActive && <CanvasWorld />}</div>
	</div>
</div>
```

> Mount `CanvasWorld` only when `canvasActive` (or has been activated once) to avoid running canvas queries while in Normal. Keep the normal layout mounted so returning is instant.

- [ ] **Step 2: Typecheck + run app to verify slide**

Run: `bun run typecheck` then `bun run dev`; click the space switch and confirm the slide animates both directions and the canvas world appears.

- [ ] **Step 3: Commit**

```bash
git add src/shell/components/app-shell-layout.tsx
git commit -m "feat(shell): slide transition between Normal and Canvas worlds"
```

---

## Phase 4 — Creation UI

### Task 12: Inline Normal/Canvas toggle in create-workspace tab

**Files:**
- Modify: `src/features/workspace-start/index.tsx` (inline toggle on the title line, styled like the repo selector)
- Modify: `src/features/workspace-start/create-workspace.ts` (pass `space` to `prepareWorkspaceFromRepo`)
- Test: `src/features/workspace-start/create-workspace.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Extend `create-workspace.test.ts` to assert the create helper forwards `space`:

```ts
it("passes the selected space to prepareWorkspaceFromRepo", async () => {
	const spy = vi.spyOn(api, "prepareWorkspaceFromRepo").mockResolvedValue(/* fake resp */);
	await createWorkspace({ repoId: "r1", space: "canvas" /* ...other required args */ });
	expect(spy).toHaveBeenCalledWith(
		"r1", expect.anything(), expect.anything(), "canvas",
		expect.anything(), expect.anything(), expect.anything(),
	);
});
```

> Match `createWorkspace`'s real argument shape (read `create-workspace.ts` first) — add a `space?: WorkspaceSpace` field to its options object, defaulting to the active space.

- [ ] **Step 2: Run to verify fail**

Run: `bun x vitest run src/features/workspace-start/create-workspace.test.ts`
Expected: FAIL — `space` not forwarded.

- [ ] **Step 3: Thread `space` through the create helper**

In `create-workspace.ts`, add `space` to the options and pass it as the new 4th positional arg to `prepareWorkspaceFromRepo` (default `useSpaceStore.getState().activeSpace`).

- [ ] **Step 4: Add the inline toggle UI**

In `workspace-start/index.tsx`, add a compact inline control on the title line (mirror the repo selector's styling — find the existing repo selector JSX in this file and reuse its trigger classes). Two segments Normal/Canvas; default from `useActiveSpace()`. Store selection in local state and pass to `createWorkspace`.

- [ ] **Step 5: Run tests + typecheck**

Run: `bun x vitest run src/features/workspace-start && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Wire "+ New canvas" in mission-control**

Back in `canvas-world/index.tsx` `onCreate`, call the create helper with `space: "canvas"` and `setSelected(newId)` on success. Verify in `bun run dev`.

- [ ] **Step 7: Commit**

```bash
git add src/features/workspace-start src/shell/components/canvas-world/index.tsx
git commit -m "feat(workspace-start): inline Normal/Canvas mode toggle on create"
```

---

## Phase 5 — Removals & cleanup

### Task 13: Remove per-row "Open in canvas" button + menu

**Files:**
- Modify: `src/features/navigation/row-item.tsx` (remove hover button ~line 526-550, context-menu item ~line 664, and the `canvasModeEnabled` read ~line 183)

- [ ] **Step 1: Remove the UI**

Delete the `LayoutGrid` hover button block, the "Open in canvas" `ContextMenuItem`, and the `canvasModeEnabled` variable + its guards. Remove now-unused imports (`useCanvasModeStore`, `LayoutGrid` if unused).

- [ ] **Step 2: Run row-item tests + typecheck**

Run: `bun x vitest run src/features/navigation && bun run typecheck`
Expected: PASS (update/remove any test asserting the old button).

- [ ] **Step 3: Commit**

```bash
git add src/features/navigation/row-item.tsx
git commit -m "refactor(navigation): remove per-row open-in-canvas entry points"
```

---

### Task 14: Remove `canvasModeEnabled` setting + panel

**Files:**
- Delete: `src/features/settings/panels/canvas-mode.tsx`
- Modify: `src/lib/settings.ts` (remove `canvasModeEnabled` field ~357, default ~467, storage key ~663)
- Modify: settings panel index/registry that mounts `canvas-mode.tsx` (grep for the import)

- [ ] **Step 1: Remove references**

Run: `grep -rn "canvasModeEnabled\|canvas-mode\|CanvasMode" src/` and remove every hit (setting field, default, storage key, panel file, panel registration).

- [ ] **Step 2: Typecheck + settings tests**

Run: `bun run typecheck && bun x vitest run src/features/settings src/lib/settings.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(settings): remove canvasModeEnabled flag (canvas is always-on)"
```

---

### Task 15: Delete `use-canvas-mode.ts`

**Files:**
- Delete: `src/features/canvas/use-canvas-mode.ts`

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "use-canvas-mode\|useCanvasModeStore\|useIsCanvasMode" src/`
Expected: no hits (all replaced by `use-space-store` in Tasks 7-9). Fix any stragglers.

- [ ] **Step 2: Delete + typecheck**

Run: `rm src/features/canvas/use-canvas-mode.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(canvas): delete legacy use-canvas-mode store"
```

---

## Phase 6 — Full verification

### Task 16: Full suite + lint + manual smoke

- [ ] **Step 1: Run everything**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: all green (frontend + sidecar + rust). Address any failures before proceeding.

- [ ] **Step 2: Manual smoke in dev build**

Run: `bun run dev`. Verify:
- Sidebar shows the Workspaces|Canvas switch; clicking Canvas slides to the canvas world.
- Mission-control lists existing canvas workspaces (none initially — all legacy rows are Normal) and a "+ New canvas" tile.
- "+ New canvas" creates a canvas workspace and opens its canvas; "Overview" returns to the grid.
- Create tab's inline toggle defaults to the active space and creates into the right space.
- Switching back to Workspaces slides to the normal 3-column layout; normal rows only (no canvas rows leaking in).
- No "Open in canvas" button/menu anywhere; no Canvas setting in Settings.

- [ ] **Step 3: Changeset**

Add a `.changeset/*.md` (see `helmor-release` skill) — a single prose sentence, e.g. *"Canvas is now a first-class workspace space: switch between Normal and Canvas worlds from the sidebar, with a mission-control overview for canvas workspaces."*

- [ ] **Step 4: Final commit**

```bash
git add .changeset
git commit -m "chore: changeset for canvas workspace space"
```

---

## Self-Review Notes

- **Spec coverage:** data model (T1-T5), active-space state + switch + slide (T6-T9, T11), mission-control + canvas world (T10), creation toggle (T12), all three removals (T13-T15), tests woven throughout + full pass (T16). ✓
- **Deferred per spec:** cross-space migration UI (not built); live thumbnails (static preview placeholder in T10, flagged). ✓
- **Type consistency:** `WorkspaceSpace` ("normal"|"canvas") used identically across Rust enum, TS type, store, switch, create wrappers. `space` column/param name consistent end-to-end. `activeSpace` (view state) kept distinct from a workspace's `space` (identity). ✓
- **Known discovery points** (read-before-edit, not placeholders): exact positional `row.get(N)` index in `models/workspaces.rs`; real query-key/field names in `query-client.ts`/`WorkspaceRow`; `createWorkspace` option shape in `create-workspace.ts`; repo-selector JSX classes in `workspace-start/index.tsx`; `tests/common/mod.rs` helper names. Each task names the file to read and what to match.
