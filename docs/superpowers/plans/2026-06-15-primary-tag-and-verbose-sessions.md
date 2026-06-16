# Primary Tag + Verbose Running-Session Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Primary" pill inline on local-mode workspace rows, and add a sidebar "Verbose" toggle that expands each row to preview its running sessions live.

**Architecture:** Pure frontend changes in `src/features/navigation/` + one new setting in `src/lib/settings.ts`. The verbose preview reuses the hover card's existing live-activity machinery (`extractLiveActivity` + `readSessionThread` + `useBusySessionIds`). No backend/IPC/pipeline changes — so no Rust snapshot tests.

**Tech Stack:** React 19, TypeScript, Tailwind v4, lucide-react, TanStack Query, Vitest + @testing-library/react. Path alias `@/` → `src/`. Lint: Biome (tabs). Run a single frontend test: `bun x vitest run <file>`.

---

## File Structure

- `src/lib/settings.ts` — add `sidebarVerbose: boolean` (localStorage-mirrored, default `false`).
- `src/features/navigation/row-item.tsx` — render the "Primary" pill; render the sessions preview when `verbose`; add `verbose` prop + memo comparator entry.
- `src/features/navigation/row-sessions-preview.tsx` — **NEW** `WorkspaceRowSessionsPreview` component (live running-session lines).
- `src/features/navigation/sidebar-view-popover.tsx` — add the "Verbose" toggle UI + props.
- `src/features/navigation/index.tsx` — thread `verbose` into `SidebarViewPopover` and `WorkspaceRowItem`.
- `src/features/navigation/container.tsx` — pass `sidebarVerbose` + `onSidebarVerboseChange` through.
- `src/features/navigation/hooks/use-controller.ts` — expose `sidebarVerbose: settings.sidebarVerbose`.
- Tests: `row-item.test.tsx` (pill), `row-sessions-preview.test.tsx` (NEW).

---

## Task 1: Add `sidebarVerbose` setting

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add the field to the `AppSettings` type**

In `src/lib/settings.ts`, after the `sidebarSort: SidebarSort;` line (~383) inside the `AppSettings` type:

```typescript
	/** Sidebar view-only sort. `custom` preserves saved drag order. */
	sidebarSort: SidebarSort;
	/** Verbose sidebar: expand each row to preview its running sessions.
	 *  Persisted to localStorage for flash-free first paint. */
	sidebarVerbose: boolean;
```

- [ ] **Step 2: Add the default**

In `DEFAULT_SETTINGS` (~507), after `sidebarSort: "custom",`:

```typescript
	sidebarSort: "custom",
	sidebarVerbose: false,
```

- [ ] **Step 3: Add the storage key**

After `export const SIDEBAR_SORT_STORAGE_KEY = "helmor-sidebar-sort";` (~515):

```typescript
export const SIDEBAR_SORT_STORAGE_KEY = "helmor-sidebar-sort";
export const SIDEBAR_VERBOSE_STORAGE_KEY = "helmor-sidebar-verbose";
```

- [ ] **Step 4: Register it in `LOCALSTORAGE_KEYS`**

In the `LOCALSTORAGE_KEYS` object (~529), after `sidebarSort: SIDEBAR_SORT_STORAGE_KEY,`:

```typescript
	sidebarSort: SIDEBAR_SORT_STORAGE_KEY,
	sidebarVerbose: SIDEBAR_VERBOSE_STORAGE_KEY,
```

- [ ] **Step 5: Parse it in the sync boot reader**

In the first boot reader (the `sidebarSort` IIFE block ~598-603), add a `sidebarVerbose` const after it, then include it in the returned object (~613). Add after the `sidebarSort` IIFE:

```typescript
	const sidebarVerbose =
		readLocalStorageString(SIDEBAR_VERBOSE_STORAGE_KEY) === "true";
```

And in the returned object after `sidebarSort,`:

```typescript
		sidebarSort,
		sidebarVerbose,
```

- [ ] **Step 6: Parse it in the SQLite-merge reader**

In the second reader (~1359, the `sidebarSort` IIFE inside the big settings object), add after that IIFE's closing `})(),`:

```typescript
			sidebarVerbose:
				localStorage.getItem(SIDEBAR_VERBOSE_STORAGE_KEY) === "true",
```

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors). The `saveSettings` write path needs no change — `String(false)` → `"false"`, and `LOCALSTORAGE_KEYS` iteration writes it automatically.

- [ ] **Step 8: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat(settings): add sidebarVerbose localStorage-backed setting"
```

---

## Task 2: "Primary" pill on the workspace row

**Files:**
- Modify: `src/features/navigation/row-item.tsx`
- Test: `src/features/navigation/row-item.test.tsx`

- [ ] **Step 1: Write the failing test**

Check whether `src/features/navigation/row-item.test.tsx` exists. If it does, append the `describe` block below; if not, create the file with this content. Replace the mock row factory with the repo's existing test row helper if one is already imported in a sibling test — otherwise this inline `baseRow` is sufficient.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { WorkspaceRowItem } from "./row-item";

const baseRow: WorkspaceRow = {
	id: "ws-1",
	title: "My Workspace",
	mode: "worktree",
} as WorkspaceRow;

describe("WorkspaceRowItem primary pill", () => {
	it("shows the Primary pill for local-mode rows", () => {
		render(
			<WorkspaceRowItem
				row={{ ...baseRow, mode: "local" }}
				selected={false}
				disableHoverCard
			/>,
		);
		expect(screen.getByText("Primary")).toBeInTheDocument();
	});

	it("does not show the Primary pill for worktree-mode rows", () => {
		render(
			<WorkspaceRowItem
				row={{ ...baseRow, mode: "worktree" }}
				selected={false}
				disableHoverCard
			/>,
		);
		expect(screen.queryByText("Primary")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun x vitest run src/features/navigation/row-item.test.tsx`
Expected: FAIL — "Primary" text not found (pill not rendered yet).

- [ ] **Step 3: Add the Badge import**

In `src/features/navigation/row-item.tsx`, add near the other `@/components/ui` imports (after the `Button` import, ~24):

```tsx
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 4: Render the pill after the title**

In `row-item.tsx`, locate `titleSlot` (the `const titleSlot = (...)` block ~434-452). Immediately after that `const titleSlot` definition, add a `primaryPill` const:

```tsx
		const primaryPill =
			row.mode === "local" ? (
				<Badge
					variant="secondary"
					className="h-[15px] shrink-0 rounded px-1 text-mini font-medium leading-none"
				>
					Primary
				</Badge>
			) : null;
```

Then render `{primaryPill}` next to `{titleSlot}` in BOTH layout branches (the early-return `hideRepoAvatar || row.mode === "chat"` branch and the final branch). In the early-return branch (~462-464):

```tsx
					<div className="row-content-fade flex min-w-0 flex-1 items-center gap-2">
						{titleSlot}
						{primaryPill}
					</div>
```

In the final branch (~485-488):

```tsx
					<div className="row-content-fade flex min-w-0 flex-1 items-center gap-2">
						{branchSlot}
						{titleSlot}
						{primaryPill}
					</div>
```

(Local-mode rows never use the `chat` early return, but adding `primaryPill` to both keeps the two render paths consistent and harmless.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun x vitest run src/features/navigation/row-item.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 6: Lint**

Run: `bun run lint`
Expected: PASS (Biome clean on the changed file).

- [ ] **Step 7: Commit**

```bash
git add src/features/navigation/row-item.tsx src/features/navigation/row-item.test.tsx
git commit -m "feat(navigation): show Primary pill inline on local-mode rows"
```

---

## Task 3: `WorkspaceRowSessionsPreview` component

**Files:**
- Create: `src/features/navigation/row-sessions-preview.tsx`
- Test: `src/features/navigation/row-sessions-preview.test.tsx`

This component lists the workspace's **running** sessions (membership in `busySessionIds`), excluding hidden / action sessions. For `gui` sessions it shows a one-line live preview from the thread cache; `terminal` sessions are label-only. Renders `null` when there are no running sessions.

- [ ] **Step 1: Write the failing test**

Create `src/features/navigation/row-sessions-preview.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionSummary } from "@/lib/api";

// Stub the live-activity / busy / cache deps so the test is hermetic.
vi.mock("@/lib/session-run-state-context", () => ({
	useBusySessionIds: () => new Set(["s-gui", "s-term"]),
}));
vi.mock("@/lib/session-thread-cache", () => ({
	readSessionThread: () => [
		{
			role: "assistant",
			content: [{ type: "text", id: "t1", text: "Refactoring the parser now" }],
		},
	],
}));
vi.mock("./workspace-hover-card", () => ({
	extractLiveActivity: () => [
		{ kind: "markdown", key: "t1", text: "Refactoring the parser now", reasoning: false },
	],
}));

import { WorkspaceRowSessionsPreview } from "./row-sessions-preview";

function sess(over: Partial<WorkspaceSessionSummary>): WorkspaceSessionSummary {
	return {
		id: "s",
		workspaceId: "ws-1",
		title: "Session",
		status: "idle",
		permissionMode: "default",
		unreadCount: 0,
		fastMode: false,
		createdAt: "",
		updatedAt: "",
		isHidden: false,
		active: false,
		...over,
	} as WorkspaceSessionSummary;
}

function renderWith(sessions: WorkspaceSessionSummary[]) {
	const qc = new QueryClient();
	qc.setQueryData(["workspaceSessions", "ws-1"], sessions);
	return render(
		<QueryClientProvider client={qc}>
			<WorkspaceRowSessionsPreview workspaceId="ws-1" />
		</QueryClientProvider>,
	);
}

describe("WorkspaceRowSessionsPreview", () => {
	it("renders a line per running session and the gui live preview", () => {
		renderWith([
			sess({ id: "s-gui", title: "Agent run", sessionKind: "gui", agentType: "claude" }),
			sess({ id: "s-term", title: "npm test", sessionKind: "terminal" }),
		]);
		expect(screen.getByText("Agent run")).toBeInTheDocument();
		expect(screen.getByText("npm test")).toBeInTheDocument();
		expect(screen.getByText(/Refactoring the parser/)).toBeInTheDocument();
	});

	it("excludes hidden, action, and non-running sessions", () => {
		renderWith([
			sess({ id: "s-gui", title: "Agent run", sessionKind: "gui" }),
			sess({ id: "s-hidden", title: "Hidden", sessionKind: "gui", isHidden: true }),
			sess({ id: "s-action", title: "Create PR", sessionKind: "gui", actionKind: "create-pr" }),
			sess({ id: "s-idle", title: "Idle one", sessionKind: "gui" }), // not in busy set
		]);
		expect(screen.getByText("Agent run")).toBeInTheDocument();
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		expect(screen.queryByText("Create PR")).not.toBeInTheDocument();
		expect(screen.queryByText("Idle one")).not.toBeInTheDocument();
	});

	it("renders nothing when no sessions are running", () => {
		const { container } = renderWith([
			sess({ id: "s-idle", title: "Idle one", sessionKind: "gui" }),
		]);
		expect(container).toBeEmptyDOMElement();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun x vitest run src/features/navigation/row-sessions-preview.test.tsx`
Expected: FAIL — module `./row-sessions-preview` not found.

- [ ] **Step 3: Implement the component**

Create `src/features/navigation/row-sessions-preview.tsx`:

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, SquareTerminal } from "lucide-react";
import { memo, useMemo } from "react";
import type { WorkspaceSessionSummary } from "@/lib/api";
import { workspaceSessionsQueryOptions } from "@/lib/query-client";
import { useBusySessionIds } from "@/lib/session-run-state-context";
import { readSessionThread } from "@/lib/session-thread-cache";
import { cn } from "@/lib/utils";
import { extractLiveActivity } from "./workspace-hover-card";

/** First text/reasoning block of the latest assistant message, single line. */
function useLivePreviewText(sessionId: string): string | null {
	const queryClient = useQueryClient();
	const thread = readSessionThread(queryClient, sessionId);
	const blocks = extractLiveActivity(thread);
	for (const block of blocks) {
		if (block.kind === "markdown" && block.text.trim()) {
			return block.text.replace(/\s+/g, " ").trim();
		}
	}
	return null;
}

function SessionLine({ session }: { session: WorkspaceSessionSummary }) {
	const isTerminal = session.sessionKind === "terminal";
	// Terminals have no sidebar-accessible output source — label only.
	const preview = useLivePreviewText(isTerminal ? "" : session.id);
	const Icon = isTerminal ? SquareTerminal : Bot;
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-mini text-muted-foreground">
			<Icon className="size-3 shrink-0" strokeWidth={1.9} />
			<span className="max-w-[7rem] shrink-0 truncate font-medium text-foreground/80">
				{session.title}
			</span>
			{session.agentType ? (
				<span className="shrink-0 text-foreground/40">{session.agentType}</span>
			) : null}
			{preview ? (
				<span className="min-w-0 flex-1 truncate text-foreground/50">
					{preview}
				</span>
			) : null}
		</div>
	);
}

export const WorkspaceRowSessionsPreview = memo(
	function WorkspaceRowSessionsPreview({
		workspaceId,
		className,
	}: {
		workspaceId: string;
		className?: string;
	}) {
		const busySessionIds = useBusySessionIds();
		const { data: sessions } = useQuery(
			workspaceSessionsQueryOptions(workspaceId, { staleTime: 5_000 }),
		);
		const running = useMemo(
			() =>
				(sessions ?? [])
					.filter(
						(s) =>
							!s.isHidden && !s.actionKind && busySessionIds.has(s.id),
					)
					.sort((a, b) => a.title.localeCompare(b.title)),
			[sessions, busySessionIds],
		);
		if (running.length === 0) return null;
		return (
			<div
				className={cn(
					"flex flex-col gap-0.5 pb-1 pl-9 pr-2.5",
					className,
				)}
			>
				{running.map((session) => (
					<SessionLine key={session.id} session={session} />
				))}
			</div>
		);
	},
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun x vitest run src/features/navigation/row-sessions-preview.test.tsx`
Expected: PASS — all three tests green.

- [ ] **Step 5: Lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: PASS. If `extractLiveActivity` is not exported from `workspace-hover-card.tsx`, confirm the `export function extractLiveActivity` declaration exists (it does at ~213) — no change needed.

- [ ] **Step 6: Commit**

```bash
git add src/features/navigation/row-sessions-preview.tsx src/features/navigation/row-sessions-preview.test.tsx
git commit -m "feat(navigation): add running-session preview component"
```

---

## Task 4: Wire `verbose` into the row

**Files:**
- Modify: `src/features/navigation/row-item.tsx`

- [ ] **Step 1: Add the `verbose` prop to the type**

In `WorkspaceRowItemProps` (~76-115), add after `disableHoverCard?: boolean;`:

```tsx
	disableHoverCard?: boolean;
	/** Verbose mode: render the running-session preview under the row. */
	verbose?: boolean;
```

- [ ] **Step 2: Destructure it**

In the component signature destructure (~166), add after `disableHoverCard,`:

```tsx
		disableHoverCard,
		verbose,
```

- [ ] **Step 3: Import the preview component**

Add near the local imports (after the `WorkspaceHoverCard` import ~59):

```tsx
import { WorkspaceRowSessionsPreview } from "./row-sessions-preview";
```

- [ ] **Step 4: Render the preview under the row body**

The component returns `rowBody` wrapped in a `<ContextMenu>`/`<WorkspaceHoverCard>`. To attach the preview without disturbing those wrappers, wrap the existing returned fragment's row block. Find the final `return ( <> <ContextMenu> ... </ContextMenu> {onMoveLocalToWorktree ? (<MoveToWorktreeDialog .../>) : null} </> )` block (~590-697). Insert the preview right after the closing `</ContextMenu>`:

```tsx
				</ContextMenu>
				{verbose ? (
					<WorkspaceRowSessionsPreview workspaceId={row.id} />
				) : null}
				{onMoveLocalToWorktree ? (
```

Also handle the `dragPreview` early return (~582-584) — leave it unchanged (drag previews never show the session list).

- [ ] **Step 5: Add `verbose` to the memo comparator**

In `areWorkspaceRowItemPropsEqual` (~700-721), add a comparison line alongside the others:

```tsx
			previous.disableHoverCard === next.disableHoverCard &&
			previous.verbose === next.verbose &&
			previous.dragPreview === next.dragPreview &&
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Run the row tests**

Run: `bun x vitest run src/features/navigation/row-item.test.tsx`
Expected: PASS (Task 2 tests still green; preview renders `null` without a QueryClient/busy provider in those tests because `verbose` is unset).

- [ ] **Step 8: Commit**

```bash
git add src/features/navigation/row-item.tsx
git commit -m "feat(navigation): render session preview under row in verbose mode"
```

---

## Task 5: Verbose toggle in the view popover

**Files:**
- Modify: `src/features/navigation/sidebar-view-popover.tsx`

- [ ] **Step 1: Add props to `SidebarViewPopoverProps`**

In `sidebar-view-popover.tsx`, add to the interface (~50-61) after `sort: SidebarSort;` and after `onSortChange?`:

```tsx
	sort: SidebarSort;
	verbose: boolean;
```

and in the callbacks group:

```tsx
	onSortChange?: (sort: SidebarSort) => void;
	onVerboseChange?: (verbose: boolean) => void;
```

- [ ] **Step 2: Destructure the new props**

In the `SidebarViewPopover({ ... })` destructure (~169-180) add `verbose,` and `onVerboseChange,`.

- [ ] **Step 3: Add the `Rows4` icon import**

Add `Eye` to the lucide import list (~1-13):

```tsx
	Eye,
```

- [ ] **Step 4: Render the toggle**

After the closing `</div>` of the "Sort by" block (just before the final `</PopoverContent>`, ~278), add:

```tsx
					<div className="h-px bg-border/60" />
					<button
						type="button"
						role="switch"
						aria-checked={verbose}
						className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-ui leading-4 hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
						onClick={() => onVerboseChange?.(!verbose)}
					>
						<Eye className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">
							Verbose — preview running sessions
						</span>
						{verbose ? <Check className="size-3.5" strokeWidth={2.2} /> : null}
					</button>
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: FAIL at `index.tsx` (SidebarViewPopover now requires `verbose`) — fixed in Task 6. The file itself compiles.

- [ ] **Step 6: Commit**

```bash
git add src/features/navigation/sidebar-view-popover.tsx
git commit -m "feat(navigation): add verbose toggle to sidebar view popover"
```

---

## Task 6: Thread `verbose` through index/container/controller

**Files:**
- Modify: `src/features/navigation/hooks/use-controller.ts`
- Modify: `src/features/navigation/container.tsx`
- Modify: `src/features/navigation/index.tsx`

- [ ] **Step 1: Expose `sidebarVerbose` from the controller**

In `use-controller.ts`, in the returned object (~1759-1761) after `sidebarSort: settings.sidebarSort,`:

```typescript
		sidebarSort: settings.sidebarSort,
		sidebarVerbose: settings.sidebarVerbose,
```

- [ ] **Step 2: Destructure + pass it in the container**

In `container.tsx`, add `sidebarVerbose,` to the destructure from `useWorkspacesSidebarController` (~57, after `sidebarSort,`). Then pass to `<WorkspacesSidebar>` (~89) after `sidebarSort={sidebarSort}`:

```tsx
				sidebarSort={sidebarSort}
				sidebarVerbose={sidebarVerbose}
```

and add the change handler after `onSidebarSortChange` (~96-98):

```tsx
				onSidebarVerboseChange={(sidebarVerbose) => {
					void updateSettings({ sidebarVerbose });
				}}
```

- [ ] **Step 3: Add props to the index component type**

In `index.tsx`, add to the props type (~169-174) after `sidebarSort?: SidebarSort;`:

```tsx
	sidebarSort?: SidebarSort;
	sidebarVerbose?: boolean;
```

and after `onSidebarSortChange?`:

```tsx
	onSidebarSortChange?: (sort: SidebarSort) => void;
	onSidebarVerboseChange?: (verbose: boolean) => void;
```

- [ ] **Step 4: Destructure with default**

In the `WorkspacesSidebar({ ... })` destructure (~128-133), after `sidebarSort = "custom",`:

```tsx
	sidebarSort = "custom",
	sidebarVerbose = false,
```

and add `onSidebarVerboseChange,` near `onSidebarSortChange,` (~133).

- [ ] **Step 5: Feed the popover**

At the `<SidebarViewPopover ...>` usage (~1150-1160), add after `sort={sidebarSort}`:

```tsx
						sort={sidebarSort}
						verbose={sidebarVerbose}
```

and after `onSortChange={onSidebarSortChange}`:

```tsx
						onSortChange={onSidebarSortChange}
						onVerboseChange={onSidebarVerboseChange}
```

- [ ] **Step 6: Feed the row**

At the `<WorkspaceRowItem ...>` usage (~1054-1063), add after `hideRepoAvatar={...}`:

```tsx
						hideRepoAvatar={repoIdFromGroupId(item.groupId) !== null}
						verbose={sidebarVerbose}
```

(Leave the drag-overlay `WorkspaceRowItem` at ~1325 without `verbose` — drag previews stay compact.)

- [ ] **Step 6b: Dynamic virtual-row measurement (REQUIRED for verbose)**

The sidebar list is virtualized with `@tanstack/react-virtual` using a FIXED `estimateSize` (`ROW_HEIGHT = 32`). Verbose rows are taller (the preview adds a variable number of session lines), so without dynamic measurement the rows overlap. Add TanStack Virtual's `measureElement` so verbose rows self-measure. Scope the change so non-verbose behavior is byte-for-byte unchanged (the drag-reorder math at `index.tsx:374,488,1013` assumes fixed `ROW_HEIGHT`; only verbose rows deviate, which the user accepted).

In `index.tsx`, at the virtualized slot div (~1291-1317, the `virtualizer.getVirtualItems().map((vItem) => { ... <div style={{ position:"absolute", top:0, left:0, width:"100%", height: \`${vItem.size}px\`, transform: ... }}>{renderItem(item)}</div> })`):

1. Add a `data-index` attribute and a conditional measure ref to the slot div. Only attach the measure ref when `sidebarVerbose` is on AND the item is a `"row"` — this keeps the existing fixed-height path identical when verbose is off:

```tsx
							<div
								key={vItem.key}
								data-index={vItem.index}
								ref={
									sidebarVerbose && item.kind === "row"
										? virtualizer.measureElement
										: undefined
								}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									// Verbose rows self-measure (variable height from the
									// session preview); everything else keeps the fixed
									// estimate. `minHeight` keeps a measured row at least
									// one row tall during the first paint before measure.
									...(sidebarVerbose && item.kind === "row"
										? { minHeight: `${vItem.size}px` }
										: { height: `${vItem.size}px` }),
									transform: `translate3d(0, ${vItem.start}px, 0)`,
									transition:
										isAnyDragging && item.kind !== "drop-placeholder"
											? "transform 150ms cubic-bezier(0.16, 1, 0.3, 1)"
											: "none",
									willChange: isAnyDragging ? "transform" : "auto",
								}}
							>
								{renderItem(item)}
							</div>
```

Notes:
- `virtualizer.measureElement` uses a `ResizeObserver`, so when a session starts/stops streaming and the preview grows/shrinks, the row re-measures automatically.
- `data-index` is REQUIRED by `measureElement` to map the element back to its virtual index. Do not omit it.
- Do NOT change `estimateSize`, the drag math, or `getItemKey`. The estimate stays `ROW_HEIGHT`; measurement corrects verbose rows after first paint.
- After editing, manually verify in a debug build (`bun run dev`) that: (a) verbose OFF rows look identical to before, (b) verbose ON rows with a running session expand without overlapping the next row, (c) toggling verbose reflows cleanly.

- [ ] **Step 7: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS — all wiring resolved.

- [ ] **Step 8: Commit**

```bash
git add src/features/navigation/hooks/use-controller.ts src/features/navigation/container.tsx src/features/navigation/index.tsx
git commit -m "feat(navigation): thread sidebarVerbose through sidebar tree"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the full frontend test suite**

Run: `bun run test:frontend`
Expected: PASS (including the new row + preview tests). If any existing navigation snapshot/test asserts exact row DOM and now sees the Primary pill, update that test to expect the pill (it is intended new behavior).

- [ ] **Step 2: Typecheck + lint (frontend + sidecar + rust lint)**

Run: `bun run typecheck && bun run lint`
Expected: PASS with zero warnings.

- [ ] **Step 3: Manual smoke (optional, debug build)**

Run: `bun run dev`. Confirm: local-mode rows show the "Primary" pill; opening the sidebar filter popover shows the "Verbose" toggle; enabling it expands rows that have a running session into per-session lines (agent sessions show live text, terminals show label only); rows with no running session stay single-line.

- [ ] **Step 4: Final commit (if any test fixups were needed)**

```bash
git add -A
git commit -m "test(navigation): align tests with primary pill + verbose preview"
```

---

## Self-Review Notes

- **Spec coverage:** Primary pill (Task 2) ✓; verbose setting (Task 1) ✓; toggle UI (Task 5) ✓; running-only filter + gui live preview + terminal label-only (Task 3) ✓; plumbing (Task 6) ✓; row expansion (Task 4) ✓.
- **Type consistency:** `sidebarVerbose` (settings → controller → container → index → popover/row), `verbose` prop (index → row-item), `onVerboseChange`/`onSidebarVerboseChange` callbacks are used consistently across tasks. `extractLiveActivity` / `readSessionThread` / `useBusySessionIds` / `workspaceSessionsQueryOptions` are existing exports (verified during planning).
- **No backend changes:** no `pipeline/`, `schema.rs`, or persistence edits → Rust snapshot tests not required.
