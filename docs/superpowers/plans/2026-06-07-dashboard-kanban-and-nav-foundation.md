# Dashboard + Kanban & Nav-Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three top-level sidebar screen nav buttons (Dashboard / Tasks / History) above the untouched workspace list, and ship the Dashboard as a full-pane Kanban board over existing workspace data with drag-to-set-status.

**Architecture:** A new orthogonal `activeScreen` state (`"none" | "dashboard" | "tasks" | "history"`) lives in a dedicated `useScreenController` hook, threaded from `app-shell.tsx` into the layout. When `activeScreen !== "none"`, the center column renders a `ScreenHost` (switching Dashboard/Tasks/History) instead of `WorkspacePaneSurface`; the right inspector is hidden. The Dashboard reuses the existing `workspaceGroupsQueryOptions()` + `activeStreamsQueryOptions()` queries and the existing `moveWorkspaceInSidebar` mutation, so it never diverges from the sidebar.

**Tech Stack:** React 19, TypeScript, TanStack React Query, Zustand-style controllers, Vitest + @testing-library/react, Tailwind v4. No new dependencies; reuse the sidebar's hand-rolled pointer DnD pattern and `HelmorLogoAnimated`.

**Spec:** `docs/superpowers/specs/2026-06-07-dashboard-kanban-and-nav-foundation-design.md`

---

## File Structure

**Create:**
- `src/shell/controllers/use-screen-controller.ts` — `activeScreen` state + localStorage persistence + actions.
- `src/shell/controllers/use-screen-controller.test.ts` — controller tests.
- `src/shell/components/screen-host.tsx` — switches on `activeScreen`, renders the active screen full-pane.
- `src/features/dashboard/index.tsx` — `<DashboardScreen/>` (summary header + board).
- `src/features/dashboard/container.tsx` — wires queries to the screen (data layer).
- `src/features/dashboard/hooks/use-dashboard-board.ts` — derives columns + running set from queries.
- `src/features/dashboard/hooks/use-dashboard-board.test.ts` — board-derivation tests.
- `src/features/dashboard/kanban-card.tsx` — `<WorkspaceKanbanCard/>`.
- `src/features/dashboard/kanban-card.test.tsx` — card tests.
- `src/features/dashboard/dashboard-screen.test.tsx` — screen render + DnD tests.
- `src/features/tasks/index.tsx` — placeholder `<TasksScreen/>` (stub for later spec).
- `src/features/history/index.tsx` — placeholder `<HistoryScreen/>` (stub for later spec).

**Modify:**
- `src/shell/components/app-shell.tsx` — instantiate `useScreenController`, pass `activeScreen` + `screenActions` to layout + sidebar.
- `src/shell/components/app-shell-layout.tsx` — branch center column on `activeScreen`; hide inspector when a screen is active.
- `src/shell/components/shell-sidebar-pane.tsx` — render the three nav buttons above `WorkspacesSidebarContainer`.

---

## Task 1: `useScreenController` — activeScreen state + persistence

**Files:**
- Create: `src/shell/controllers/use-screen-controller.ts`
- Test: `src/shell/controllers/use-screen-controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shell/controllers/use-screen-controller.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScreenController } from "./use-screen-controller";

describe("useScreenController", () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => localStorage.clear());

	it("defaults to 'none'", () => {
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("none");
	});

	it("sets and persists the active screen", () => {
		const { result } = renderHook(() => useScreenController());
		act(() => result.current.screenActions.setActiveScreen("dashboard"));
		expect(result.current.activeScreen).toBe("dashboard");
		expect(localStorage.getItem("helmor.activeScreen")).toBe("dashboard");
	});

	it("rehydrates a persisted screen on mount", () => {
		localStorage.setItem("helmor.activeScreen", "tasks");
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("tasks");
	});

	it("ignores an invalid persisted value", () => {
		localStorage.setItem("helmor.activeScreen", "bogus");
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("none");
	});

	it("openWorkspaceView resets to 'none'", () => {
		const { result } = renderHook(() => useScreenController());
		act(() => result.current.screenActions.setActiveScreen("history"));
		act(() => result.current.screenActions.openWorkspaceView());
		expect(result.current.activeScreen).toBe("none");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/shell/controllers/use-screen-controller.test.ts`
Expected: FAIL — cannot find module `./use-screen-controller`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shell/controllers/use-screen-controller.ts
import { useCallback, useMemo, useState } from "react";

export type ActiveScreen = "none" | "dashboard" | "tasks" | "history";

const STORAGE_KEY = "helmor.activeScreen";
const VALID: readonly ActiveScreen[] = [
	"none",
	"dashboard",
	"tasks",
	"history",
];

function readStored(): ActiveScreen {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return VALID.includes(raw as ActiveScreen) ? (raw as ActiveScreen) : "none";
	} catch {
		return "none";
	}
}

export type ScreenActions = {
	setActiveScreen(screen: ActiveScreen): void;
	openWorkspaceView(): void;
};

export type ScreenController = {
	activeScreen: ActiveScreen;
	screenActions: ScreenActions;
};

export function useScreenController(): ScreenController {
	const [activeScreen, setActiveScreenState] =
		useState<ActiveScreen>(readStored);

	const setActiveScreen = useCallback((screen: ActiveScreen) => {
		setActiveScreenState(screen);
		try {
			localStorage.setItem(STORAGE_KEY, screen);
		} catch {
			// ignore persistence failures (private mode, etc.)
		}
	}, []);

	const openWorkspaceView = useCallback(
		() => setActiveScreen("none"),
		[setActiveScreen],
	);

	const screenActions = useMemo<ScreenActions>(
		() => ({ setActiveScreen, openWorkspaceView }),
		[setActiveScreen, openWorkspaceView],
	);

	return { activeScreen, screenActions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/shell/controllers/use-screen-controller.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shell/controllers/use-screen-controller.ts src/shell/controllers/use-screen-controller.test.ts
git commit -m "feat(shell): add useScreenController for top-level screen state"
```

---

## Task 2: Placeholder screens + `ScreenHost`

**Files:**
- Create: `src/features/tasks/index.tsx`
- Create: `src/features/history/index.tsx`
- Create: `src/features/dashboard/index.tsx` (temporary placeholder; replaced in Task 6)
- Create: `src/shell/components/screen-host.tsx`

- [ ] **Step 1: Create the three placeholder screens**

```tsx
// src/features/tasks/index.tsx
export function TasksScreen() {
	return (
		<div
			aria-label="Tasks screen"
			className="flex min-h-0 flex-1 items-center justify-center text-app-foreground/60"
		>
			Tasks — coming soon
		</div>
	);
}
```

```tsx
// src/features/history/index.tsx
export function HistoryScreen() {
	return (
		<div
			aria-label="History screen"
			className="flex min-h-0 flex-1 items-center justify-center text-app-foreground/60"
		>
			History — coming soon
		</div>
	);
}
```

```tsx
// src/features/dashboard/index.tsx  (temporary; replaced in Task 6)
export function DashboardScreen() {
	return (
		<div
			aria-label="Dashboard screen"
			className="flex min-h-0 flex-1 items-center justify-center text-app-foreground/60"
		>
			Dashboard — coming soon
		</div>
	);
}
```

- [ ] **Step 2: Create `ScreenHost`**

```tsx
// src/shell/components/screen-host.tsx
import { DashboardScreen } from "@/features/dashboard";
import { HistoryScreen } from "@/features/history";
import { TasksScreen } from "@/features/tasks";
import type { ActiveScreen } from "@/shell/controllers/use-screen-controller";

type Props = {
	activeScreen: Exclude<ActiveScreen, "none">;
};

export function ScreenHost({ activeScreen }: Props) {
	return (
		<section
			aria-label="Top-level screen"
			className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
			style={{ contain: "layout style" }}
		>
			<div
				aria-label="Screen drag region"
				className="absolute inset-x-0 top-0 z-10 h-9 bg-transparent"
				data-tauri-drag-region
			/>
			{activeScreen === "dashboard" && <DashboardScreen />}
			{activeScreen === "tasks" && <TasksScreen />}
			{activeScreen === "history" && <HistoryScreen />}
		</section>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors from the new files).

- [ ] **Step 4: Commit**

```bash
git add src/features/tasks/index.tsx src/features/history/index.tsx src/features/dashboard/index.tsx src/shell/components/screen-host.tsx
git commit -m "feat(shell): add ScreenHost and placeholder Dashboard/Tasks/History screens"
```

---

## Task 3: Thread `activeScreen` into the layout + render branch

**Files:**
- Modify: `src/shell/components/app-shell.tsx`
- Modify: `src/shell/components/app-shell-layout.tsx`

- [ ] **Step 1: Instantiate the controller in `app-shell.tsx`**

Near the other controller hook calls in `AppShell` (where `sel`, `panels`, etc. are obtained), add:

```tsx
import { useScreenController } from "@/shell/controllers/use-screen-controller";
// ...inside the component body, with the other hooks:
const screen = useScreenController();
```

Then pass two new props to `<AppShellLayout>` (alongside `workspaceViewMode={sel.selection.viewMode}`):

```tsx
activeScreen={screen.activeScreen}
screenActions={screen.screenActions}
```

- [ ] **Step 2: Accept + branch in `app-shell-layout.tsx`**

Add imports:

```tsx
import { ScreenHost } from "./screen-host";
import type {
	ActiveScreen,
	ScreenActions,
} from "@/shell/controllers/use-screen-controller";
```

Add to the layout `Props` type (near `workspaceViewMode: ShellViewMode;`):

```tsx
	activeScreen: ActiveScreen;
	screenActions: ScreenActions;
```

Destructure `activeScreen` and `screenActions` in the component signature.

Replace the center-column render `<WorkspacePaneSurface {...workspacePane} />` (currently line ~112) with:

```tsx
{activeScreen === "none" ? (
	<WorkspacePaneSurface {...workspacePane} />
) : (
	<ScreenHost activeScreen={activeScreen} />
)}
```

Hide the inspector while a screen is active. Find the inspector render guard (the right-column conditional) and AND it with `activeScreen === "none"`. Likewise the existing `workspaceViewMode !== "editor" &&` drag-region guard near line 98 should also require `activeScreen === "none"` so the screen owns its own drag region:

```tsx
{activeScreen === "none" && workspaceViewMode !== "editor" && (
	// existing drag region node
)}
```

- [ ] **Step 3: Pass `screenActions` to the sidebar pane**

In `app-shell.tsx`, the `sidebar={{ ... }}` object passed to `AppShellLayout` (line ~107) feeds `ShellSidebarPane`. Add `screenActions: screen.screenActions` and `activeScreen: screen.activeScreen` to that object (these are consumed in Task 4).

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (Sidebar prop additions will be consumed in Task 4; if the `sidebar` object is strongly typed against `ShellSidebarPane` Props, complete Task 4's Props change first or do Steps 3–4 together with Task 4 Step 1.)

- [ ] **Step 5: Commit**

```bash
git add src/shell/components/app-shell.tsx src/shell/components/app-shell-layout.tsx
git commit -m "feat(shell): render ScreenHost in center column when a screen is active"
```

---

## Task 4: Sidebar nav buttons (Dashboard / Tasks / History)

**Files:**
- Modify: `src/shell/components/shell-sidebar-pane.tsx`

- [ ] **Step 1: Extend `ShellSidebarPane` Props**

Add to the `Props` type:

```tsx
import type {
	ActiveScreen,
	ScreenActions,
} from "@/shell/controllers/use-screen-controller";
// ...
	activeScreen: ActiveScreen;
	screenActions: ScreenActions;
```

Destructure `activeScreen` and `screenActions` in the component signature.

- [ ] **Step 2: Render the nav buttons above the workspace list**

Immediately before `<WorkspacesSidebarContainer .../>` (line ~173), insert a nav group. Use `lucide-react` icons already available in the codebase:

```tsx
import { Columns3, ListTodo, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCREEN_NAV_ITEMS = [
	{ id: "dashboard", label: "Dashboard", Icon: Columns3 },
	{ id: "tasks", label: "Tasks", Icon: ListTodo },
	{ id: "history", label: "History", Icon: HistoryIcon },
] as const;
```

```tsx
<nav aria-label="Screens" className="flex flex-col gap-0.5 px-2 pb-2">
	{SCREEN_NAV_ITEMS.map(({ id, label, Icon }) => {
		const active = activeScreen === id;
		return (
			<Button
				key={id}
				type="button"
				variant="ghost"
				aria-current={active ? "page" : undefined}
				className={cn(
					"h-8 w-full justify-start gap-2 px-2 text-sm font-medium text-app-foreground/70 hover:text-app-foreground",
					active && "bg-app-accent/15 text-app-foreground",
				)}
				onClick={() => screenActions.setActiveScreen(id)}
			>
				<Icon className="size-4 shrink-0" />
				<span className="truncate">{label}</span>
			</Button>
		);
	})}
</nav>
```

(`Button` already includes `cursor-pointer` per the base UI convention.)

- [ ] **Step 3: Manual verification via typecheck + dev run**

Run: `bun run typecheck`
Expected: PASS.

Run the app (`bun run dev`) and confirm: three nav buttons appear above the workspace list; clicking each swaps the center pane to the matching placeholder; clicking a workspace row still opens its conversation. (Workspace-row click already calls `selectionActions.selectWorkspace`; in Task 6 we add the `openWorkspaceView()` reset so the screen closes — for now manually verify the buttons + placeholders.)

- [ ] **Step 4: Commit**

```bash
git add src/shell/components/shell-sidebar-pane.tsx
git commit -m "feat(navigation): add Dashboard/Tasks/History nav buttons above workspace list"
```

---

## Task 5: `use-dashboard-board` — derive columns + running set

**Files:**
- Create: `src/features/dashboard/hooks/use-dashboard-board.ts`
- Test: `src/features/dashboard/hooks/use-dashboard-board.test.ts`

The board reads the same grouped data the sidebar uses. We derive 5 fixed columns from `WorkspaceGroup[]` keyed by the status group ids, plus a running-workspace set.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/dashboard/hooks/use-dashboard-board.test.ts
import { describe, expect, it } from "vitest";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import { buildDashboardColumns, DASHBOARD_COLUMNS } from "./use-dashboard-board";

function row(id: string): WorkspaceRow {
	return { id, title: id } as WorkspaceRow;
}

describe("buildDashboardColumns", () => {
	it("produces the 5 status columns in fixed order", () => {
		const cols = buildDashboardColumns([]);
		expect(cols.map((c) => c.id)).toEqual([
			"progress",
			"review",
			"done",
			"backlog",
			"canceled",
		]);
		expect(DASHBOARD_COLUMNS.length).toBe(5);
	});

	it("places rows into their status column and merges pinned/chats/ai-tasks by status", () => {
		const groups: WorkspaceGroup[] = [
			{ id: "progress", label: "In progress", tone: "default", rows: [row("a")] },
			{ id: "done", label: "Done", tone: "default", rows: [row("b")] },
			{ id: "pinned", label: "Pinned", tone: "default", rows: [
				{ ...row("c"), status: "review" } as WorkspaceRow,
			] },
		] as WorkspaceGroup[];
		const cols = buildDashboardColumns(groups);
		const byId = Object.fromEntries(cols.map((c) => [c.id, c.rows.map((r) => r.id)]));
		expect(byId.progress).toEqual(["a"]);
		expect(byId.done).toEqual(["b"]);
		expect(byId.review).toEqual(["c"]); // pinned row routed by its status
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/dashboard/hooks/use-dashboard-board.test.ts`
Expected: FAIL — cannot find module `./use-dashboard-board`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/dashboard/hooks/use-dashboard-board.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import {
	activeStreamsQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import {
	buildSessionRunStates,
	deriveBusyWorkspaceIds,
} from "@/lib/session-run-state";
import { workspaceGroupIdFromStatus } from "@/lib/workspace-helpers";

export type DashboardColumnId =
	| "progress"
	| "review"
	| "done"
	| "backlog"
	| "canceled";

export const DASHBOARD_COLUMNS: ReadonlyArray<{
	id: DashboardColumnId;
	label: string;
}> = [
	{ id: "progress", label: "In progress" },
	{ id: "review", label: "Review" },
	{ id: "done", label: "Done" },
	{ id: "backlog", label: "Backlog" },
	{ id: "canceled", label: "Canceled" },
];

export type DashboardColumn = {
	id: DashboardColumnId;
	label: string;
	rows: WorkspaceRow[];
};

// Route every row to its status column. Pinned/chats/ai-tasks groups in the
// sidebar cut across statuses, so we re-bucket by each row's own status
// (mapping the "pinned" → "progress" default away via the row status).
export function buildDashboardColumns(
	groups: WorkspaceGroup[],
): DashboardColumn[] {
	const buckets: Record<DashboardColumnId, WorkspaceRow[]> = {
		progress: [],
		review: [],
		done: [],
		backlog: [],
		canceled: [],
	};
	for (const group of groups) {
		for (const r of group.rows) {
			const columnId = workspaceGroupIdFromStatus(r.status, null);
			// workspaceGroupIdFromStatus never returns "pinned" when pinnedAt is null.
			buckets[columnId as DashboardColumnId].push(r);
		}
	}
	return DASHBOARD_COLUMNS.map((c) => ({ ...c, rows: buckets[c.id] }));
}

export function useDashboardBoard() {
	const groupsQuery = useQuery(workspaceGroupsQueryOptions());
	const streamsQuery = useQuery(activeStreamsQueryOptions());

	const columns = useMemo(
		() => buildDashboardColumns(groupsQuery.data ?? []),
		[groupsQuery.data],
	);

	const runningWorkspaceIds = useMemo(
		() =>
			deriveBusyWorkspaceIds(
				buildSessionRunStates(streamsQuery.data ?? [], null),
			),
		[streamsQuery.data],
	);

	const totalRunning = useMemo(() => {
		let n = 0;
		for (const c of columns)
			for (const r of c.rows) if (runningWorkspaceIds.has(r.id)) n++;
		return n;
	}, [columns, runningWorkspaceIds]);

	return { columns, runningWorkspaceIds, totalRunning };
}
```

NOTE: confirm the exact exported names of `buildSessionRunStates` / `deriveBusyWorkspaceIds` in `src/lib/session-run-state.ts` and the query-option factory names in `src/lib/query-client.ts`; adjust imports if they differ. If `buildSessionRunStates` takes a different second argument, pass the value those existing call sites use (grep `deriveBusyWorkspaceIds` usage in `src/`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/dashboard/hooks/use-dashboard-board.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/hooks/use-dashboard-board.ts src/features/dashboard/hooks/use-dashboard-board.test.ts
git commit -m "feat(dashboard): derive kanban columns and running set from workspace queries"
```

---

## Task 6: `WorkspaceKanbanCard`

**Files:**
- Create: `src/features/dashboard/kanban-card.tsx`
- Test: `src/features/dashboard/kanban-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/dashboard/kanban-card.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { WorkspaceKanbanCard } from "./kanban-card";

function row(extra: Partial<WorkspaceRow> = {}): WorkspaceRow {
	return { id: "w1", title: "Fix login", branch: "fix/login", ...extra } as WorkspaceRow;
}

describe("WorkspaceKanbanCard", () => {
	it("renders title and branch", () => {
		render(<WorkspaceKanbanCard row={row()} running={false} onOpen={() => {}} />);
		expect(screen.getByText("Fix login")).toBeInTheDocument();
		expect(screen.getByText("fix/login")).toBeInTheDocument();
	});

	it("shows the animated Helmor logo when running", () => {
		render(<WorkspaceKanbanCard row={row()} running={true} onOpen={() => {}} />);
		expect(screen.getByLabelText("Running")).toBeInTheDocument();
	});

	it("does not show the running indicator when idle", () => {
		render(<WorkspaceKanbanCard row={row()} running={false} onOpen={() => {}} />);
		expect(screen.queryByLabelText("Running")).not.toBeInTheDocument();
	});

	it("shows a PR badge when prSyncState is not none", () => {
		render(
			<WorkspaceKanbanCard
				row={row({ prSyncState: "open", prUrl: "https://x/pull/42" })}
				running={false}
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByText(/#42/)).toBeInTheDocument();
	});

	it("calls onOpen with the workspace id when clicked", () => {
		const onOpen = vi.fn();
		render(<WorkspaceKanbanCard row={row()} running={false} onOpen={onOpen} />);
		fireEvent.click(screen.getByRole("button", { name: /Fix login/ }));
		expect(onOpen).toHaveBeenCalledWith("w1");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/dashboard/kanban-card.test.tsx`
Expected: FAIL — cannot find module `./kanban-card`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/dashboard/kanban-card.tsx
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import type { WorkspaceRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
	row: WorkspaceRow;
	running: boolean;
	onOpen: (workspaceId: string) => void;
};

function prNumber(prUrl: string | null | undefined): string | null {
	if (!prUrl) return null;
	const m = prUrl.match(/\/(\d+)(?:$|[?#])/);
	return m ? `#${m[1]}` : null;
}

export function WorkspaceKanbanCard({ row, running, onOpen }: Props) {
	const pr = row.prSyncState && row.prSyncState !== "none" ? prNumber(row.prUrl) : null;
	return (
		<button
			type="button"
			aria-label={row.title}
			onClick={() => onOpen(row.id)}
			className="flex w-full cursor-pointer flex-col gap-1.5 rounded-md border border-app-border/60 bg-app-base p-2.5 text-left transition-colors hover:border-app-border hover:bg-app-accent/5"
		>
			<div className="flex items-start gap-2">
				<WorkspaceAvatar
					iconSrc={row.repoIconSrc ?? null}
					initials={row.repoInitials ?? null}
					className="size-4 shrink-0"
				/>
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-app-foreground">
					{row.title}
				</span>
				{running && (
					<span aria-label="Running" className="shrink-0">
						<HelmorLogoAnimated size={14} className="opacity-80" />
					</span>
				)}
				{row.hasUnread && !running && (
					<span
						aria-label="Unread"
						className="mt-1 size-1.5 shrink-0 rounded-full bg-app-accent"
					/>
				)}
			</div>
			<div className="flex items-center gap-2 text-xs text-app-foreground/55">
				{row.branch && <span className="truncate">{row.branch}</span>}
				{pr && (
					<span
						className={cn(
							"ml-auto rounded px-1 py-0.5 text-[10px] font-medium",
							row.prSyncState === "merged"
								? "bg-purple-500/15 text-purple-400"
								: row.prSyncState === "closed"
									? "bg-red-500/15 text-red-400"
									: "bg-green-500/15 text-green-400",
						)}
					>
						{pr}
					</span>
				)}
			</div>
		</button>
	);
}
```

NOTE: confirm `WorkspaceAvatar`'s prop names in `src/features/navigation/avatar.tsx` (it is used by `row-item.tsx`); adjust the prop names if they differ (e.g. `src`/`fallback`). If unsure, copy the exact prop usage from `src/features/navigation/row-item.tsx`. Confirm `HelmorLogoAnimated` accepts a numeric `size` prop (it does per `helmor-logo-animated.tsx`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/dashboard/kanban-card.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/kanban-card.tsx src/features/dashboard/kanban-card.test.tsx
git commit -m "feat(dashboard): add WorkspaceKanbanCard with running logo and PR badge"
```

---

## Task 7: `DashboardScreen` — summary header + board (no DnD yet)

**Files:**
- Create: `src/features/dashboard/container.tsx`
- Modify: `src/features/dashboard/index.tsx` (replace placeholder)
- Test: `src/features/dashboard/dashboard-screen.test.tsx`

The screen is presentational (takes columns + running set + handlers); the container wires the hook + navigation. This keeps the screen testable without query mocks.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/dashboard/dashboard-screen.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { DashboardScreen } from "./index";
import type { DashboardColumn } from "./hooks/use-dashboard-board";

function col(id: DashboardColumn["id"], label: string, rows: WorkspaceRow[]): DashboardColumn {
	return { id, label, rows };
}
const r = (id: string, status: string): WorkspaceRow =>
	({ id, title: id, status } as WorkspaceRow);

const columns: DashboardColumn[] = [
	col("progress", "In progress", [r("a", "in-progress")]),
	col("review", "Review", []),
	col("done", "Done", [r("b", "done")]),
	col("backlog", "Backlog", []),
	col("canceled", "Canceled", []),
];

describe("DashboardScreen", () => {
	it("renders all five columns with labels and counts", () => {
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={() => {}}
				onMoveWorkspace={() => {}}
			/>,
		);
		for (const label of ["In progress", "Review", "Done", "Backlog", "Canceled"]) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
		expect(screen.getByText("a")).toBeInTheDocument();
		expect(screen.getByText("b")).toBeInTheDocument();
	});

	it("shows an empty placeholder in empty columns", () => {
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={() => {}}
				onMoveWorkspace={() => {}}
			/>,
		);
		expect(screen.getAllByText("No workspaces").length).toBeGreaterThanOrEqual(3);
	});

	it("invokes onOpenWorkspace when a card is clicked", () => {
		const onOpen = vi.fn();
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={onOpen}
				onMoveWorkspace={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "a" }));
		expect(onOpen).toHaveBeenCalledWith("a");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/dashboard/dashboard-screen.test.tsx`
Expected: FAIL — `DashboardScreen` does not accept these props (placeholder).

- [ ] **Step 3: Implement the presentational screen**

```tsx
// src/features/dashboard/index.tsx
import type { WorkspaceRow } from "@/lib/api";
import type { DashboardColumnId } from "./hooks/use-dashboard-board";
import type { DashboardColumn } from "./hooks/use-dashboard-board";
import { WorkspaceKanbanCard } from "./kanban-card";

export type MoveWorkspaceArgs = {
	workspaceId: string;
	targetColumnId: DashboardColumnId;
	beforeWorkspaceId: string | null;
};

type Props = {
	columns: DashboardColumn[];
	runningWorkspaceIds: Set<string>;
	totalRunning: number;
	onOpenWorkspace: (workspaceId: string) => void;
	onMoveWorkspace: (args: MoveWorkspaceArgs) => void;
};

export function DashboardScreen({
	columns,
	runningWorkspaceIds,
	totalRunning,
	onOpenWorkspace,
}: Props) {
	const total = columns.reduce((n, c) => n + c.rows.length, 0);
	return (
		<div aria-label="Dashboard screen" className="flex min-h-0 flex-1 flex-col">
			<header className="flex items-center gap-4 border-app-border/60 border-b px-4 py-3 text-sm">
				<span className="font-semibold text-app-foreground">Dashboard</span>
				<span className="text-app-foreground/55">{total} workspaces</span>
				{columns.map((c) => (
					<span key={c.id} className="text-app-foreground/55">
						{c.label}: {c.rows.length}
					</span>
				))}
				<span className="ml-auto text-app-foreground/55">
					{totalRunning} running
				</span>
			</header>
			<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
				{columns.map((column) => (
					<section
						key={column.id}
						aria-label={`${column.label} column`}
						className="flex w-72 shrink-0 flex-col rounded-lg bg-app-subtle/40"
					>
						<div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-app-foreground/70">
							<span>{column.label}</span>
							<span>{column.rows.length}</span>
						</div>
						<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
							{column.rows.length === 0 ? (
								<div className="px-2 py-6 text-center text-app-foreground/35 text-xs">
									No workspaces
								</div>
							) : (
								column.rows.map((row: WorkspaceRow) => (
									<WorkspaceKanbanCard
										key={row.id}
										row={row}
										running={runningWorkspaceIds.has(row.id)}
										onOpen={onOpenWorkspace}
									/>
								))
							)}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
```

(`onMoveWorkspace` is accepted now and wired to DnD in Task 8; leave it unused until then. If the linter rejects the unused destructure, omit it from destructuring but keep it in `Props`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/dashboard/dashboard-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the container that wires queries + navigation**

```tsx
// src/features/dashboard/container.tsx
import { useCallback } from "react";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import type { ScreenActions } from "@/shell/controllers/use-screen-controller";
import { moveWorkspaceInSidebar } from "@/lib/api";
import { DashboardScreen, type MoveWorkspaceArgs } from "./index";
import { useDashboardBoard } from "./hooks/use-dashboard-board";

type Props = {
	selectionActions: SelectionActions;
	screenActions: ScreenActions;
};

export function DashboardContainer({ selectionActions, screenActions }: Props) {
	const { columns, runningWorkspaceIds, totalRunning } = useDashboardBoard();

	const onOpenWorkspace = useCallback(
		(workspaceId: string) => {
			screenActions.openWorkspaceView();
			selectionActions.selectWorkspace(workspaceId);
		},
		[screenActions, selectionActions],
	);

	const onMoveWorkspace = useCallback((args: MoveWorkspaceArgs) => {
		// targetColumnId equals the backend status group id ("progress" | ...).
		void moveWorkspaceInSidebar(
			args.workspaceId,
			args.targetColumnId,
			args.beforeWorkspaceId,
		);
	}, []);

	return (
		<DashboardScreen
			columns={columns}
			runningWorkspaceIds={runningWorkspaceIds}
			totalRunning={totalRunning}
			onOpenWorkspace={onOpenWorkspace}
			onMoveWorkspace={onMoveWorkspace}
		/>
	);
}
```

NOTE: confirm `selectionActions.selectWorkspace` is the correct method name in `use-selection-controller.ts` (`SelectionActions` type). Adjust if it differs.

- [ ] **Step 6: Point `ScreenHost` at the container**

In `src/shell/components/screen-host.tsx`, replace the `<DashboardScreen />` placeholder usage with `<DashboardContainer .../>`. This requires `ScreenHost` to receive `selectionActions` + `screenActions`. Add them to `ScreenHost` Props and pass them from `app-shell-layout.tsx` (the layout already has `workspacePane.selectionActions`; pass `screenActions` through too):

```tsx
// screen-host.tsx imports
import { DashboardContainer } from "@/features/dashboard/container";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import type { ScreenActions } from "@/shell/controllers/use-screen-controller";
// Props add: selectionActions: SelectionActions; screenActions: ScreenActions;
// render branch:
{activeScreen === "dashboard" && (
	<DashboardContainer
		selectionActions={selectionActions}
		screenActions={screenActions}
	/>
)}
```

In `app-shell-layout.tsx`, update the `<ScreenHost .../>` render to pass `selectionActions={workspacePane.selectionActions}` and `screenActions={screenActions}`.

- [ ] **Step 7: Typecheck + run dashboard tests**

Run: `bun run typecheck && bun x vitest run src/features/dashboard`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/dashboard/index.tsx src/features/dashboard/container.tsx src/features/dashboard/dashboard-screen.test.tsx src/shell/components/screen-host.tsx src/shell/components/app-shell-layout.tsx
git commit -m "feat(dashboard): render kanban board with summary header and live data"
```

---

## Task 8: Drag-to-set-status

**Files:**
- Modify: `src/features/dashboard/index.tsx`
- Test: extend `src/features/dashboard/dashboard-screen.test.tsx`

Use the lightweight HTML5 drag events (sufficient for column-to-column moves; the sidebar's pointer DnD is for reordering with ghosts — reuse its `moveWorkspaceInSidebar` command, not its full ghost machinery). Dropping a card on a column calls `onMoveWorkspace` with that column's id as the target status group.

- [ ] **Step 1: Write the failing test**

```tsx
// append to src/features/dashboard/dashboard-screen.test.tsx
it("calls onMoveWorkspace with the target column id on drop", () => {
	const onMove = vi.fn();
	render(
		<DashboardScreen
			columns={columns}
			runningWorkspaceIds={new Set()}
			totalRunning={0}
			onOpenWorkspace={() => {}}
			onMoveWorkspace={onMove}
		/>,
	);
	const card = screen.getByRole("button", { name: "a" });
	const target = screen.getByLabelText("Done column");
	fireEvent.dragStart(card, { dataTransfer: { setData: () => {}, getData: () => "a" } });
	fireEvent.drop(target, { dataTransfer: { getData: () => "a" } });
	expect(onMove).toHaveBeenCalledWith({
		workspaceId: "a",
		targetColumnId: "done",
		beforeWorkspaceId: null,
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/dashboard/dashboard-screen.test.tsx`
Expected: FAIL — drop does not call `onMoveWorkspace`.

- [ ] **Step 3: Add drag handlers to the screen**

Make cards draggable and columns drop targets. In `DashboardScreen`, give each `WorkspaceKanbanCard` wrapper `draggable` + `onDragStart` setting the workspace id, and each column `<section>` an `onDragOver` (preventDefault) + `onDrop` calling `onMoveWorkspace`. Append-to-end semantics → `beforeWorkspaceId: null`.

Add to the column `<section>`:

```tsx
onDragOver={(e) => e.preventDefault()}
onDrop={(e) => {
	e.preventDefault();
	const workspaceId = e.dataTransfer.getData("text/workspace-id") || draggingIdRef.current;
	if (workspaceId) {
		onMoveWorkspace({
			workspaceId,
			targetColumnId: column.id,
			beforeWorkspaceId: null,
		});
	}
}}
```

Wrap each card so it is draggable:

```tsx
<div
	key={row.id}
	draggable
	onDragStart={(e) => {
		draggingIdRef.current = row.id;
		e.dataTransfer.setData("text/workspace-id", row.id);
		e.dataTransfer.effectAllowed = "move";
	}}
>
	<WorkspaceKanbanCard
		row={row}
		running={runningWorkspaceIds.has(row.id)}
		onOpen={onOpenWorkspace}
	/>
</div>
```

Add at the top of the component body: `const draggingIdRef = useRef<string | null>(null);` and `import { useRef } from "react";`. (The ref is a fallback because jsdom's `dataTransfer` is minimal; production browsers use the real `dataTransfer`.)

Restore the `onMoveWorkspace` destructure in `Props`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/dashboard/dashboard-screen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Manual verification**

Run `bun run dev`. On the Dashboard, drag a card to another column; confirm the card moves, the sidebar group for that workspace updates to the new status (UI-sync), and the change persists after refresh.

- [ ] **Step 6: Commit**

```bash
git add src/features/dashboard/index.tsx src/features/dashboard/dashboard-screen.test.tsx
git commit -m "feat(dashboard): drag cards between columns to change workspace status"
```

---

## Task 9: Full verification

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: PASS (frontend + sidecar).

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: PASS (biome + clippy; no Rust changed, so clippy is a no-op delta).

- [ ] **Step 3: Frontend tests**

Run: `bun run test:frontend`
Expected: PASS, including the new dashboard + controller suites.

- [ ] **Step 4: Manual end-to-end**

Run `bun run dev`. Verify:
- Three nav buttons (Dashboard/Tasks/History) appear above the workspace list.
- Workspace list is unchanged and always visible.
- Dashboard shows 5 columns + summary header; cards show repo badge, branch, PR badge, unread dot; running workspaces show the animated Helmor logo.
- Clicking a card opens that workspace's conversation and the screen closes.
- Dragging a card between columns updates status and syncs the sidebar.
- Tasks/History show their placeholder screens.

- [ ] **Step 5: Add a changeset**

```bash
cat > .changeset/dashboard-kanban-screen.md <<'EOF'
---
"helmor": minor
---

Add a Dashboard screen with a Kanban board of workspaces grouped by status, reachable from new Dashboard/Tasks/History nav buttons in the sidebar. Drag cards between columns to change a workspace's status; running workspaces show an animated indicator.
EOF
git add .changeset/dashboard-kanban-screen.md
git commit -m "chore: changeset for dashboard kanban screen"
```

---

## Self-Review Notes

- **Spec coverage:** Foundation (activeScreen controller, nav buttons, render branch) → Tasks 1–4; Dashboard data → Task 5; card incl. HelmorLogoAnimated + PR badge + unread → Task 6; summary header + 5 columns + empty states → Task 7; drag-to-set-status via `moveWorkspaceInSidebar` → Task 8; testing → throughout + Task 9. Tasks/History placeholders satisfy the "render branch" requirement without implementing those specs.
- **Type consistency:** `ActiveScreen`, `ScreenActions`, `DashboardColumn`, `DashboardColumnId`, `MoveWorkspaceArgs` are defined once and reused. Column ids (`progress|review|done|backlog|canceled`) match `workspaceGroupIdFromStatus` output and the backend status group ids consumed by `moveWorkspaceInSidebar`.
- **Verify-before-use flags:** Three import/prop names are marked to confirm against the live code (`buildSessionRunStates`/`deriveBusyWorkspaceIds` args, `WorkspaceAvatar` props, `selectionActions.selectWorkspace`). These are noted inline at their tasks.
- **No backend/schema/pipeline changes** in this slice → no Rust snapshot tests required (per AGENTS.md those land with the Tasks spec).
