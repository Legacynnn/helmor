# Canvas Panel Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every canvas panel a ⌘1–⌘9 binding (auto by creation order, user-overridable) that selects + pans/zooms to it, and add a glass "Panels" popover listing all panels with their bindings.

**Architecture:** A pure resolver maps panels→digits (auto-numbered in creation order, customs claim a digit, autos flex/compact around them). A canvas-scoped shortcut hook (its own `useAppShortcuts` call, like the inspector/editor surfaces) fires `focusPanel`. Custom digits persist inside the existing `config` JSON — no Rust/schema changes. A controlled glass popover (store-driven, opened by a workspace-controls button or ⌘/) lists panels and edits their custom digit.

**Tech Stack:** React 19, @xyflow/react (React Flow v12), zustand, Tailwind v4, shadcn/ui, vitest + jsdom.

---

## File Structure

New (`src/features/canvas/bindings/`):
- `panel-bindings.ts` — pure resolver, `formatBinding`, `customBindingConflicts`, `buildPanelRows` (+ test).
- `focus-panel.ts` — select + center helper (+ test).
- `panels-list-store.ts` — zustand popover open-state.
- `use-panel-binding-shortcuts.ts` — canvas shortcut handlers.

New chrome:
- `chrome/panels-list-popover.tsx` — glass popover UI.

Edited:
- `shortcuts/types.ts` — `canvas` scope + 10 ids.
- `shortcuts/registry.ts` — 10 definitions.
- `shortcuts/focus-scope.ts` — `canvas` in `KNOWN_SCOPES`.
- `panel-config.ts` — `binding?: number` on `CommonPanelConfig`.
- `panel-node.tsx` — `export` `PANEL_META`.
- `chrome/workspace-controls.tsx` — Panels button.
- `index.tsx` — `data-focus-scope="canvas"`, call the shortcut hook, mount the popover.

---

## Task 1: Pure binding resolver (TDD)

**Files:**
- Create: `src/features/canvas/bindings/panel-bindings.ts`
- Test: `src/features/canvas/bindings/panel-bindings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/canvas/bindings/panel-bindings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	buildPanelRows,
	customBindingConflicts,
	formatBinding,
	resolvePanelBindings,
} from "./panel-bindings";

const p = (id: string, binding?: number) => ({ id, binding });

describe("resolvePanelBindings", () => {
	it("auto-assigns 1..9 in order; 10th gets nothing", () => {
		const panels = Array.from({ length: 10 }, (_, i) => p(`n${i}`));
		const map = resolvePanelBindings(panels);
		for (let i = 0; i < 9; i++) expect(map.get(`n${i}`)).toBe(i + 1);
		expect(map.has("n9")).toBe(false);
	});

	it("lets a custom binding claim its digit; autos flex around it", () => {
		// n0 customizes to 3 → autos for the rest skip 3.
		const map = resolvePanelBindings([p("n0", 3), p("n1"), p("n2"), p("n3")]);
		expect(map.get("n0")).toBe(3);
		expect(map.get("n1")).toBe(1);
		expect(map.get("n2")).toBe(2);
		expect(map.get("n3")).toBe(4); // skipped 3
	});

	it("compacts autos when a middle panel is removed", () => {
		const before = resolvePanelBindings([p("a"), p("b"), p("c")]);
		expect([before.get("a"), before.get("b"), before.get("c")]).toEqual([
			1, 2, 3,
		]);
		const after = resolvePanelBindings([p("a"), p("c")]); // b removed
		expect([after.get("a"), after.get("c")]).toEqual([1, 2]);
	});

	it("first panel wins a duplicate custom; the later duplicate falls to auto", () => {
		const map = resolvePanelBindings([p("a", 2), p("b", 2), p("c")]);
		expect(map.get("a")).toBe(2);
		expect(map.get("b")).toBe(1); // duplicate custom ignored → auto
		expect(map.get("c")).toBe(3);
	});

	it("ignores out-of-range custom digits", () => {
		const map = resolvePanelBindings([p("a", 0), p("b", 42)]);
		expect(map.get("a")).toBe(1);
		expect(map.get("b")).toBe(2);
	});
});

describe("customBindingConflicts", () => {
	it("is true only against another panel's custom binding", () => {
		const panels = [p("a", 2), p("b")]; // b auto
		expect(customBindingConflicts(panels, "b", 2)).toBe(true); // a holds 2
		expect(customBindingConflicts(panels, "b", 5)).toBe(false);
		expect(customBindingConflicts(panels, "a", 2)).toBe(false); // self
	});
});

describe("formatBinding", () => {
	it("formats a digit", () => {
		expect(formatBinding(1)).toBe("⌘1");
		expect(formatBinding(9)).toBe("⌘9");
	});
});

describe("buildPanelRows", () => {
	it("labels untitled panels '<Type> #n' and surfaces digits", () => {
		const rows = buildPanelRows([
			{ id: "a", title: "  ", typeLabel: "Terminal", binding: undefined },
			{ id: "b", title: "Notes A", typeLabel: "Notes", binding: 5 },
		]);
		expect(rows[0]).toMatchObject({ label: "Terminal #1", effective: 1, custom: null });
		expect(rows[1]).toMatchObject({ label: "Notes A", effective: 5, custom: 5 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/bindings/panel-bindings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/canvas/bindings/panel-bindings.ts`:

```ts
/** ⌘+digit sequence. Capped at 9: ⌘0 collides with the global `zoom.reset`
 * shortcut (app scope), which would mutually disable both. */
export const BINDING_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type PanelBindingInput = { id: string; binding?: number };

function isValidDigit(d: number | undefined): d is number {
	return (
		typeof d === "number" &&
		Number.isInteger(d) &&
		(BINDING_DIGITS as readonly number[]).includes(d)
	);
}

/** Effective digit for every panel. Custom (valid, unique — first wins) bindings
 * claim their digit; the rest take free digits in array (creation) order. Panels
 * past the 9 available digits are absent from the map. */
export function resolvePanelBindings(
	panels: PanelBindingInput[],
): Map<string, number> {
	const result = new Map<string, number>();
	const claimed = new Set<number>();
	for (const panel of panels) {
		if (isValidDigit(panel.binding) && !claimed.has(panel.binding)) {
			claimed.add(panel.binding);
			result.set(panel.id, panel.binding);
		}
	}
	const free = BINDING_DIGITS.filter((d) => !claimed.has(d));
	let i = 0;
	for (const panel of panels) {
		if (result.has(panel.id)) continue;
		if (i < free.length) {
			result.set(panel.id, free[i]);
			i += 1;
		}
	}
	return result;
}

/** Label for a digit, e.g. 1 -> "⌘1". */
export function formatBinding(digit: number): string {
	return `⌘${digit}`;
}

/** True if assigning `digit` to `panelId` collides with a DIFFERENT panel's
 * existing custom binding. (Autos always flex, so they never conflict.) */
export function customBindingConflicts(
	panels: PanelBindingInput[],
	panelId: string,
	digit: number,
): boolean {
	return panels.some(
		(panel) =>
			panel.id !== panelId &&
			isValidDigit(panel.binding) &&
			panel.binding === digit,
	);
}

export type PanelRowInput = {
	id: string;
	title: string;
	typeLabel: string;
	binding?: number;
};

export type PanelRow = {
	id: string;
	label: string;
	/** Effective digit, or undefined when unbound (10th+ panel). */
	effective?: number;
	/** The panel's own custom digit, or null when on auto. */
	custom: number | null;
};

/** Presentation rows for the panels list: resolved label + binding fields. */
export function buildPanelRows(panels: PanelRowInput[]): PanelRow[] {
	const bindings = resolvePanelBindings(panels);
	return panels.map((panel, index) => ({
		id: panel.id,
		label: panel.title.trim() || `${panel.typeLabel} #${index + 1}`,
		effective: bindings.get(panel.id),
		custom: isValidDigit(panel.binding) ? panel.binding : null,
	}));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/bindings/panel-bindings.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/bindings/panel-bindings.ts src/features/canvas/bindings/panel-bindings.test.ts
git commit -m "feat(canvas): pure panel-binding resolver (auto + custom digits)"
```

---

## Task 2: Focus-panel helper (TDD)

**Files:**
- Create: `src/features/canvas/bindings/focus-panel.ts`
- Test: `src/features/canvas/bindings/focus-panel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/canvas/bindings/focus-panel.test.ts`:

```ts
import type { useReactFlow } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { focusPanel } from "./focus-panel";

function makeRf(node: unknown) {
	const setCenter = vi.fn();
	let updated: { id: string; selected: boolean }[] = [];
	const rf = {
		getNode: (id: string) => (node && (node as { id: string }).id === id ? node : undefined),
		setNodes: (fn: (ns: { id: string; selected: boolean }[]) => typeof updated) => {
			updated = fn([
				{ id: "a", selected: false },
				{ id: "b", selected: true },
			]);
		},
		getViewport: () => ({ x: 0, y: 0, zoom: 3 }),
		setCenter,
	} as unknown as ReturnType<typeof useReactFlow>;
	return { rf, setCenter, getUpdated: () => updated };
}

describe("focusPanel", () => {
	it("selects only the target and centers on it with clamped zoom", () => {
		const { rf, setCenter, getUpdated } = makeRf({
			id: "a",
			position: { x: 0, y: 0 },
			measured: { width: 100, height: 50 },
		});
		focusPanel(rf, "a");
		expect(getUpdated()).toEqual([
			{ id: "a", selected: true },
			{ id: "b", selected: false },
		]);
		expect(setCenter).toHaveBeenCalledWith(50, 25, { zoom: 1.5, duration: 350 });
	});

	it("no-ops for an unknown id", () => {
		const { rf, setCenter } = makeRf({ id: "a", position: { x: 0, y: 0 } });
		expect(() => focusPanel(rf, "missing")).not.toThrow();
		expect(setCenter).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/bindings/focus-panel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/canvas/bindings/focus-panel.ts`:

```ts
import type { useReactFlow } from "@xyflow/react";
import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH } from "../types";

const MIN_FOCUS_ZOOM = 0.6;
const MAX_FOCUS_ZOOM = 1.5;

/** Select only `id` and smoothly pan/zoom the viewport to center it. */
export function focusPanel(
	rf: ReturnType<typeof useReactFlow>,
	id: string,
): void {
	const node = rf.getNode(id);
	if (!node) return;
	rf.setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
	const w = node.measured?.width ?? node.width ?? PANEL_DEFAULT_WIDTH;
	const h = node.measured?.height ?? node.height ?? PANEL_DEFAULT_HEIGHT;
	const cx = node.position.x + w / 2;
	const cy = node.position.y + h / 2;
	const zoom = Math.min(
		MAX_FOCUS_ZOOM,
		Math.max(MIN_FOCUS_ZOOM, rf.getViewport().zoom),
	);
	rf.setCenter(cx, cy, { zoom, duration: 350 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/bindings/focus-panel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/bindings/focus-panel.ts src/features/canvas/bindings/focus-panel.test.ts
git commit -m "feat(canvas): focusPanel helper (select + center on a panel)"
```

---

## Task 3: Shortcut plumbing (canvas scope + ids)

**Files:**
- Modify: `src/features/shortcuts/types.ts`
- Modify: `src/features/shortcuts/registry.ts`
- Modify: `src/features/shortcuts/focus-scope.ts`

- [ ] **Step 1: Add the ids and scope to `types.ts`**

In `src/features/shortcuts/types.ts`, append the canvas ids to the `ShortcutId`
union — change the last entry `| "panel.showActions";` to:

```ts
	| "panel.showActions"
	| "canvas.panel1"
	| "canvas.panel2"
	| "canvas.panel3"
	| "canvas.panel4"
	| "canvas.panel5"
	| "canvas.panel6"
	| "canvas.panel7"
	| "canvas.panel8"
	| "canvas.panel9"
	| "canvas.panelList";
```

And add `"canvas"` to the `ShortcutScope` union — change `| "workspace-composer";`
to:

```ts
	| "workspace-composer"
	| "canvas";
```

- [ ] **Step 2: Register the definitions in `registry.ts`**

In `src/features/shortcuts/registry.ts`, insert these entries into the
`SHORTCUT_DEFINITIONS` array (e.g. right after the `panel.showActions` entry, before
the closing `];`):

```ts
	{
		id: "canvas.panel1",
		title: "Jump to canvas panel 1",
		group: "Navigation",
		defaultHotkey: "Mod+1",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel2",
		title: "Jump to canvas panel 2",
		group: "Navigation",
		defaultHotkey: "Mod+2",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel3",
		title: "Jump to canvas panel 3",
		group: "Navigation",
		defaultHotkey: "Mod+3",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel4",
		title: "Jump to canvas panel 4",
		group: "Navigation",
		defaultHotkey: "Mod+4",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel5",
		title: "Jump to canvas panel 5",
		group: "Navigation",
		defaultHotkey: "Mod+5",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel6",
		title: "Jump to canvas panel 6",
		group: "Navigation",
		defaultHotkey: "Mod+6",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel7",
		title: "Jump to canvas panel 7",
		group: "Navigation",
		defaultHotkey: "Mod+7",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel8",
		title: "Jump to canvas panel 8",
		group: "Navigation",
		defaultHotkey: "Mod+8",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panel9",
		title: "Jump to canvas panel 9",
		group: "Navigation",
		defaultHotkey: "Mod+9",
		scopes: ["canvas"],
		editable: false,
	},
	{
		id: "canvas.panelList",
		title: "Toggle canvas panels list",
		group: "Navigation",
		defaultHotkey: "Mod+/",
		scopes: ["canvas"],
		editable: false,
	},
```

- [ ] **Step 3: Register the scope in `focus-scope.ts`**

In `src/features/shortcuts/focus-scope.ts`, add `"canvas"` to the `KNOWN_SCOPES`
set — change:

```ts
const KNOWN_SCOPES: ReadonlySet<ShortcutScope> = new Set([
	"app",
	"chat",
	"composer",
	"terminal",
	"editor",
	"inspector",
	"start-composer",
	"workspace-composer",
]);
```

to add `"canvas",` as the last element of the set.

- [ ] **Step 4: Verify typecheck + existing shortcut tests**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x vitest run src/features/shortcuts`
Expected: no type errors; existing shortcut tests still pass (no conflicts introduced — `canvas` scope doesn't overlap `chat`, and `Mod+/` is unused).

- [ ] **Step 5: Commit**

```bash
git add src/features/shortcuts/types.ts src/features/shortcuts/registry.ts src/features/shortcuts/focus-scope.ts
git commit -m "feat(shortcuts): add canvas scope + ⌘1-9 / ⌘/ panel-binding shortcut ids"
```

---

## Task 4: Config field + popover store

**Files:**
- Modify: `src/features/canvas/panel-config.ts`
- Create: `src/features/canvas/bindings/panels-list-store.ts`

- [ ] **Step 1: Add `binding?` to `CommonPanelConfig`**

In `src/features/canvas/panel-config.ts`, change `CommonPanelConfig`:

```ts
export type CommonPanelConfig = {
	/** Per-panel translucency override (0..1). When unset the panel inherits
	 * the canvas-wide translucency. */
	opacity?: number;
	/** Custom ⌘+digit keyboard binding (1–9). Absent = auto-assigned by
	 * creation order. */
	binding?: number;
};
```

- [ ] **Step 2: Create the popover open-state store**

Create `src/features/canvas/bindings/panels-list-store.ts`:

```ts
import { create } from "zustand";

/** Transient open-state for the canvas "Panels" popover. Driven by both the
 * workspace-controls button and the `canvas.panelList` (⌘/) shortcut. */
type PanelsListStore = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
};

export const usePanelsListStore = create<PanelsListStore>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
	toggle: () => set((s) => ({ open: !s.open })),
}));
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x biome check src/features/canvas/panel-config.ts src/features/canvas/bindings/panels-list-store.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/canvas/panel-config.ts src/features/canvas/bindings/panels-list-store.ts
git commit -m "feat(canvas): add panel binding config field + panels-list popover store"
```

---

## Task 5: Binding shortcut hook + wire into the canvas

**Files:**
- Create: `src/features/canvas/bindings/use-panel-binding-shortcuts.ts`
- Modify: `src/features/canvas/index.tsx`

- [ ] **Step 1: Create the shortcut hook**

Create `src/features/canvas/bindings/use-panel-binding-shortcuts.ts`:

```ts
import { useReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import type { ShortcutId } from "@/features/shortcuts/types";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import { useSettings } from "@/lib/settings";
import { parsePanelConfig } from "../panel-config";
import type { PanelNode } from "../types";
import { focusPanel } from "./focus-panel";
import { resolvePanelBindings } from "./panel-bindings";
import { usePanelsListStore } from "./panels-list-store";

const PANEL_SHORTCUT_IDS: ShortcutId[] = [
	"canvas.panel1",
	"canvas.panel2",
	"canvas.panel3",
	"canvas.panel4",
	"canvas.panel5",
	"canvas.panel6",
	"canvas.panel7",
	"canvas.panel8",
	"canvas.panel9",
];

/** Registers the canvas-scoped ⌘1–9 (jump to panel) + ⌘/ (toggle list)
 * shortcuts. Lives inside the canvas tree so it can read live nodes via
 * `useReactFlow`. Scope gating (canvas vs chat) is handled by `useAppShortcuts`,
 * so ⌘1–9 never also fires chat's session-select. */
export function usePanelBindingShortcuts() {
	const rf = useReactFlow<PanelNode>();
	const { settings } = useSettings();

	const handlers = useMemo<ShortcutHandler[]>(() => {
		const jumpTo = (digit: number) => () => {
			const inputs = rf
				.getNodes()
				.map((n) => ({ id: n.id, binding: parsePanelConfig(n.data.config).binding }));
			const bindings = resolvePanelBindings(inputs);
			for (const [id, d] of bindings) {
				if (d === digit) {
					focusPanel(rf, id);
					return;
				}
			}
		};
		const list: ShortcutHandler[] = PANEL_SHORTCUT_IDS.map((id, index) => ({
			id,
			callback: jumpTo(index + 1),
		}));
		list.push({
			id: "canvas.panelList",
			callback: () => usePanelsListStore.getState().toggle(),
		});
		return list;
	}, [rf]);

	useAppShortcuts({ overrides: settings.shortcuts, handlers });
}
```

- [ ] **Step 2: Wire the hook + focus scope into `index.tsx`**

In `src/features/canvas/index.tsx`:

(a) Add imports near the other canvas imports:

```tsx
import { usePanelBindingShortcuts } from "./bindings/use-panel-binding-shortcuts";
import { PanelsListPopover } from "./chrome/panels-list-popover";
```

(b) Inside `CanvasInner`, after the `useCanvasGraph(...)` call that destructures
`nodes` (around line 129), call the hook:

```tsx
	usePanelBindingShortcuts();
```

(c) Add the focus scope to the wrapper div. Change:

```tsx
				<div
					ref={wrapperRef}
					className="relative size-full overflow-hidden bg-app-base"
				>
```

to add the attribute:

```tsx
				<div
					ref={wrapperRef}
					data-focus-scope="canvas"
					className="relative size-full overflow-hidden bg-app-base"
				>
```

(d) Mount the popover right after `<CableOverlay />` (inside the
`<TooltipProvider>`):

```tsx
						<CableOverlay />
						<PanelsListPopover nodes={nodes} />
```

(Note: `PanelsListPopover` is created in Task 6. This task will not typecheck until
Task 6 lands. Implement Task 6 in the same session before running the full verify;
the Task-5 commit below intentionally precedes it — if your workflow verifies each
commit in isolation, do Step 1 here, then Task 6, then return to do Steps 2 + verify
+ this commit. Either ordering ends at the same tree.)

- [ ] **Step 3: Commit (after Task 6 exists)**

```bash
git add src/features/canvas/bindings/use-panel-binding-shortcuts.ts src/features/canvas/index.tsx
git commit -m "feat(canvas): register ⌘1-9 panel-jump shortcuts + canvas focus scope"
```

---

## Task 6: Panels list popover + button

**Files:**
- Modify: `src/features/canvas/panel-node.tsx` (export `PANEL_META`)
- Create: `src/features/canvas/chrome/panels-list-popover.tsx`
- Modify: `src/features/canvas/chrome/workspace-controls.tsx`

- [ ] **Step 1: Export `PANEL_META`**

In `src/features/canvas/panel-node.tsx`, change `const PANEL_META` to
`export const PANEL_META` (the declaration around line 35).

- [ ] **Step 2: Create the popover**

Create `src/features/canvas/chrome/panels-list-popover.tsx`:

```tsx
import { useReactFlow } from "@xyflow/react";
import { Check } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	BINDING_DIGITS,
	buildPanelRows,
	customBindingConflicts,
	formatBinding,
} from "../bindings/panel-bindings";
import { focusPanel } from "../bindings/focus-panel";
import { usePanelsListStore } from "../bindings/panels-list-store";
import { useCanvasActions } from "../canvas-actions-context";
import { parsePanelConfig, stringifyPanelConfig } from "../panel-config";
import { PANEL_META } from "../panel-node";
import type { PanelNode } from "../types";

/** Glass popover listing every canvas panel with its ⌘-binding. Opened by the
 * workspace-controls "Panels" button or the ⌘/ shortcut (both flip the store). */
export function PanelsListPopover({ nodes }: { nodes: PanelNode[] }) {
	const open = usePanelsListStore((s) => s.open);
	const setOpen = usePanelsListStore((s) => s.setOpen);
	const rf = useReactFlow<PanelNode>();
	const actions = useCanvasActions();

	const inputs = nodes.map((n) => ({
		id: n.id,
		binding: parsePanelConfig(n.data.config).binding,
	}));
	const rows = buildPanelRows(
		nodes.map((n) => ({
			id: n.id,
			title: n.data.title,
			typeLabel: PANEL_META[n.data.panelType].label,
			binding: parsePanelConfig(n.data.config).binding,
		})),
	);

	const setBinding = (id: string, digit: number | null) => {
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		const next = { ...parsePanelConfig(node.data.config) };
		if (digit === null) delete next.binding;
		else next.binding = digit;
		actions.patchNodeData(id, { config: stringifyPanelConfig(next) });
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<span className="pointer-events-none absolute top-14 left-24 block h-0 w-0" />
			</PopoverTrigger>
			<PopoverContent align="start" side="bottom" className="w-72 p-2">
				<div className="mb-1.5 px-1 font-medium text-xs">Panels</div>
				{rows.length === 0 ? (
					<div className="px-1 py-2 text-app-muted-foreground text-xs">
						No panels yet.
					</div>
				) : (
					<ul className="flex max-h-80 flex-col gap-0.5 overflow-auto">
						{rows.map((row) => (
							<li key={row.id} className="flex items-center gap-1.5">
								<button
									type="button"
									className="flex min-w-0 flex-1 cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-xs hover:bg-app-muted"
									onClick={() => {
										focusPanel(rf, row.id);
										setOpen(false);
									}}
								>
									<span className="min-w-0 flex-1 truncate">{row.label}</span>
								</button>
								<BindingPicker
									custom={row.custom}
									effective={row.effective}
									isDigitDisabled={(d) =>
										customBindingConflicts(inputs, row.id, d) && row.custom !== d
									}
									onPick={(d) => setBinding(row.id, d)}
								/>
							</li>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	);
}

function BindingPicker({
	custom,
	effective,
	isDigitDisabled,
	onPick,
}: {
	custom: number | null;
	effective: number | undefined;
	isDigitDisabled: (digit: number) => boolean;
	onPick: (digit: number | null) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title="Set keyboard binding"
					className={cn(
						"flex h-6 min-w-10 cursor-pointer items-center justify-center rounded-md border border-app-border px-1.5 text-[11px] tabular-nums hover:bg-app-muted",
						custom === null && "text-app-muted-foreground",
					)}
				>
					{effective === undefined ? "—" : formatBinding(effective)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-28">
				<DropdownMenuItem onClick={() => onPick(null)}>
					Auto
					{custom === null && effective !== undefined
						? ` (${formatBinding(effective)})`
						: ""}
				</DropdownMenuItem>
				{BINDING_DIGITS.map((d) => (
					<DropdownMenuItem
						key={d}
						disabled={isDigitDisabled(d)}
						onClick={() => onPick(d)}
					>
						{formatBinding(d)}
						{custom === d ? <Check className="ml-auto size-3.5" /> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 3: Add the "Panels" button to workspace-controls**

In `src/features/canvas/chrome/workspace-controls.tsx`:

(a) Add imports — extend the lucide import to include `List`, and import the store:

```tsx
import { Check, ChevronsUpDown, LayoutGrid, List, PanelsTopLeft } from "lucide-react";
import { usePanelsListStore } from "../bindings/panels-list-store";
```

(b) Insert a Panels button just before the existing `<div className="mx-0.5 h-4 w-px bg-app-border" />` divider (line 74):

```tsx
				<div className="mx-0.5 h-4 w-px bg-app-border" />
				<button
					type="button"
					className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-app-muted"
					onClick={() => usePanelsListStore.getState().toggle()}
					title="Panels (⌘/)"
				>
					<List className="size-3.5 opacity-70" />
					<span>Panels</span>
				</button>
```

- [ ] **Step 4: Verify typecheck, lint, and the full canvas + shortcut suites**

Run:
```bash
cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x biome check src/features/canvas src/features/shortcuts && bun x vitest run src/features/canvas src/features/shortcuts
```
Expected: no type errors; biome clean; all tests pass (new `panel-bindings` + `focus-panel` suites included).

- [ ] **Step 5: Commit (Task 6 + the Task-5 wiring together)**

```bash
git add src/features/canvas/panel-node.tsx src/features/canvas/chrome/panels-list-popover.tsx src/features/canvas/chrome/workspace-controls.tsx src/features/canvas/bindings/use-panel-binding-shortcuts.ts src/features/canvas/index.tsx
git commit -m "feat(canvas): panels list popover + Panels button + ⌘1-9 wiring"
```

---

## Task 7: Manual verification + changeset

**Files:** `.changeset/<slug>.md`

- [ ] **Step 1: Launch the dev app** (or use the Tauri MCP bridge per AGENTS.md)

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run dev`

- [ ] **Step 2: Verify behavior**

On a canvas with several panels:
- Create panels in order; confirm they auto-bind ⌘1, ⌘2, … in creation order.
- Press ⌘2 → the 2nd panel is selected and the viewport pans/zooms to center it.
- Confirm ⌘2 on the canvas does NOT also switch chat sessions (engage the canvas by
  clicking it first).
- Open the Panels popover via the top-left **Panels** button and via **⌘/**; confirm
  it lists every panel with the right badge, and untitled panels read "Terminal #3"
  etc.
- Set a custom digit on a panel; confirm the digit picker disables digits already
  taken by other panels' customs, the badges update, and the new binding works.
- Delete a middle panel; confirm the remaining auto-numbers compact (no gap).
- Reload the canvas; confirm custom bindings persist.

- [ ] **Step 3: Add a changeset**

Create `.changeset/canvas-panel-bindings.md`:

```markdown
---
"helmor": patch
---

Add keyboard bindings and an "all panels" popover to the canvas.

- Every canvas panel gets a ⌘1–⌘9 binding by creation order; pressing it selects and pans to that panel.
- A new Panels popover (top-left button or ⌘/) lists all panels and lets you assign a custom ⌘-digit per panel.
```

- [ ] **Step 4: Commit the changeset**

```bash
git add .changeset/canvas-panel-bindings.md
git commit -m "chore: changeset for canvas panel bindings"
```

---

## Self-Review Notes

- **Spec coverage:** binding model + resolver → Task 1; key action (select + center) →
  Task 2; shortcut scope/ids/registry + focus-scope → Task 3; persisted `binding`
  field + popover store → Task 4; ⌘-shortcut hook + canvas focus scope wiring → Task 5;
  glass popover + digit picker + workspace-controls button → Task 6; manual verify +
  changeset → Task 7.
- **⌘1–⌘9 cap** (not ⌘0) honored in `BINDING_DIGITS`, registry (no `canvas.panel10`),
  and the picker — consistent with the spec's "Why ⌘1–⌘9 only" section.
- **No double-fire**: canvas handlers use a separate `useAppShortcuts` call gated on
  the `canvas` scope; `data-focus-scope="canvas"` on the wrapper makes the scope
  active on engagement. `Mod+/` is otherwise unused.
- **Type consistency:** `resolvePanelBindings`/`buildPanelRows`/`formatBinding`/
  `customBindingConflicts`/`BINDING_DIGITS` from `panel-bindings.ts` are reused by the
  hook and popover with matching signatures; `focusPanel(rf, id)` matches both call
  sites; `PANEL_META` exported and consumed for type labels.
- **No backend changes**: `binding` rides the existing `config` JSON; no `pipeline/` /
  `schema.rs` / Rust touch → no Rust snapshot tests required.
- **Cross-task dependency**: Task 5's `index.tsx` edit references `PanelsListPopover`
  from Task 6 — flagged inline; both land in the same session before the full verify.
