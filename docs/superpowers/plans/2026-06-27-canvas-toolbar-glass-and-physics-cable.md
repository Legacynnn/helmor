# Canvas Toolbar Glass + Physics Connect Cable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the canvas selection toolbar to the unified glass look (more solid, bigger) and replace the placeholder Connect button with a draggable, gravity-driven Verlet-rope cable that drapes over panes and visually plugs into another pane (decorative only for now).

**Architecture:** A pure Verlet-rope simulation (`verlet-rope.ts`) with AABB pane collision drives a zustand store (`cable-store.ts`) for the single active cable. An SVG overlay (`cable-overlay.tsx`) mounted inside the React Flow provider runs a `requestAnimationFrame` loop, simulates in flow coordinates using live node rects as colliders, and draws imperatively (no per-frame React re-render). The Connect button spawns/cancels the cable. Plug-in is decorative with a clean seam for the future persistent-connection write.

**Tech Stack:** React 19, @xyflow/react (React Flow v12), zustand, Tailwind v4, vitest + jsdom.

---

## File Structure

- `src/features/canvas/chrome/selection-toolbar.tsx` — **modify**: glass restyle + wire Connect to cable store.
- `src/features/canvas/cable/verlet-rope.ts` — **create**: pure rope sim (gravity, constraints, collision).
- `src/features/canvas/cable/verlet-rope.test.ts` — **create**: vitest unit tests.
- `src/features/canvas/cable/cable-store.ts` — **create**: zustand store for the active cable.
- `src/features/canvas/cable/cable-store.test.ts` — **create**: vitest unit tests.
- `src/features/canvas/cable/cable-overlay.tsx` — **create**: SVG overlay + rAF loop + plug drag.
- `src/features/canvas/index.tsx` — **modify**: mount `<CableOverlay />`.

---

## Task 1: Restyle the selection toolbar (glass, more solid, bigger)

**Files:**
- Modify: `src/features/canvas/chrome/selection-toolbar.tsx:46-115`

- [ ] **Step 1: Update the container classes**

In `src/features/canvas/chrome/selection-toolbar.tsx`, replace the container `<div>` opening tag (currently lines 46-53) with:

```tsx
		<div
			className="-translate-x-1/2 pointer-events-auto absolute top-3 left-1/2 z-20 flex items-center gap-1.5 rounded-[18px] border border-white/15 bg-app-base/65 px-2.5 py-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl"
			style={{
				borderColor: `color-mix(in oklab, ${SELECTED_COLOR} 55%, transparent)`,
				boxShadow: `0 12px 32px -10px rgba(0,0,0,0.6), 0 0 0 1px color-mix(in oklab, ${SELECTED_COLOR} 35%, transparent), 0 0 22px -6px color-mix(in oklab, ${SELECTED_COLOR} 45%, transparent)`,
			}}
		>
```

(Changes: `bg-popover/95 backdrop-blur-xl` → `bg-app-base/65 backdrop-blur-2xl`; add `border-white/15 ring-1 ring-white/10 shadow-2xl`; `gap-1`→`gap-1.5`; `px-1.5 py-1`→`px-2.5 py-1.5`; `rounded-[16px]`→`rounded-[18px]`. The inline `borderColor` keeps the selection-hue tint over the white border.)

- [ ] **Step 2: Bump every toolbar icon one size step**

In the same file, change all five `className="size-3.5"` icon occurrences (Droplets line ~63, Cable line ~87, Unlock line ~94, Lock line ~96, Copy line ~105, Trash2 line ~113) to `className="size-4"`. There are six icon usages — update all of them with a find/replace of `className="size-3.5"` → `className="size-4"` within this file only.

- [ ] **Step 3: Enlarge the toolbar buttons to fit the bigger icons**

In `ToolbarButton` (line ~162), change the button base class `"flex size-6 cursor-pointer ..."` to `"flex size-7 cursor-pointer ..."`:

```tsx
				className={cn(
					"flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
					danger && "hover:bg-destructive/15 hover:text-destructive",
				)}
```

- [ ] **Step 4: Verify typecheck + lint pass**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x biome check src/features/canvas/chrome/selection-toolbar.tsx`
Expected: no type errors; biome reports no issues for the file.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/chrome/selection-toolbar.tsx
git commit -m "feat(canvas): unify selection toolbar with glass style, bigger + more solid"
```

---

## Task 2: Verlet rope simulation (pure, TDD)

**Files:**
- Create: `src/features/canvas/cable/verlet-rope.ts`
- Test: `src/features/canvas/cable/verlet-rope.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/canvas/cable/verlet-rope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRope, step } from "./verlet-rope";

describe("verlet-rope", () => {
	it("creates a rope of segments+1 evenly spaced points", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
		expect(rope.points).toHaveLength(11);
		expect(rope.segmentLength).toBeCloseTo(10, 5);
		expect(rope.points[0]).toMatchObject({ x: 0, y: 0 });
		expect(rope.points[10]).toMatchObject({ x: 100, y: 0 });
	});

	it("keeps a pinned anchor and plug exactly in place", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		const plug = { x: 100, y: 0 };
		for (let i = 0; i < 20; i++) step(rope, { anchor, plug });
		expect(rope.points[0]).toMatchObject({ x: 0, y: 0 });
		expect(rope.points[8]).toMatchObject({ x: 100, y: 0 });
	});

	it("sags the free end downward under gravity", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		for (let i = 0; i < 60; i++) step(rope, { anchor, gravity: 0.6 });
		// Free end (no plug pin) falls below the anchor.
		expect(rope.points[8].y).toBeGreaterThan(20);
	});

	it("keeps neighbour distances near the segment length after settling", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 80, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		for (let i = 0; i < 80; i++) step(rope, { anchor, gravity: 0.6 });
		for (let i = 0; i < rope.points.length - 1; i++) {
			const a = rope.points[i];
			const b = rope.points[i + 1];
			const d = Math.hypot(b.x - a.x, b.y - a.y);
			expect(d).toBeGreaterThan(rope.segmentLength * 0.6);
			expect(d).toBeLessThan(rope.segmentLength * 1.4);
		}
	});

	it("pushes a point out of a collider rectangle to its nearest edge", () => {
		const rope = createRope({ x: 0, y: 100 }, { x: 100, y: 100 }, 8);
		const anchor = { x: 0, y: 100 };
		const plug = { x: 100, y: 100 };
		// A rectangle straddling the rope's path; after stepping no interior point
		// remains inside it.
		const collider = { x: 30, y: 90, w: 40, h: 40 };
		for (let i = 0; i < 40; i++)
			step(rope, { anchor, plug, colliders: [collider], gravity: 0.2 });
		for (const p of rope.points) {
			const inside =
				p.x > collider.x &&
				p.x < collider.x + collider.w &&
				p.y > collider.y &&
				p.y < collider.y + collider.h;
			expect(inside).toBe(false);
		}
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/cable/verlet-rope.test.ts`
Expected: FAIL — `Failed to resolve import "./verlet-rope"` / module not found.

- [ ] **Step 3: Implement the simulation**

Create `src/features/canvas/cable/verlet-rope.ts`:

```ts
/** A 2D point in flow coordinates. */
export type Vec = { x: number; y: number };

/** Axis-aligned collider rectangle in flow coordinates. */
export type Rect = { x: number; y: number; w: number; h: number };

/** A Verlet point: current position + previous position (encodes velocity). */
export type Point = { x: number; y: number; px: number; py: number };

export type Rope = {
	points: Point[];
	/** Rest length between neighbouring points. */
	segmentLength: number;
};

export type StepOptions = {
	/** Downward acceleration added each tick (flow px / tick²). */
	gravity?: number;
	/** Velocity retention each tick (0..1). */
	damping?: number;
	/** Constraint relaxation passes per step. */
	iterations?: number;
	/** Collider rectangles the rope drapes over. */
	colliders?: Rect[];
	/** Pin position for the first point (the source anchor). */
	anchor: Vec;
	/** Pin position for the last point (the held plug). Omit/null = free end. */
	plug?: Vec | null;
	/** Push-out offset applied when resolving a collision. */
	skin?: number;
};

/** Build a rope by evenly distributing `segments + 1` points from start to end. */
export function createRope(start: Vec, end: Vec, segments: number): Rope {
	const points: Point[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		points.push({ x, y, px: x, py: y });
	}
	const segmentLength = Math.hypot(end.x - start.x, end.y - start.y) / segments;
	return { points, segmentLength };
}

/** Advance the rope one tick: integrate, then relax constraints + collisions. */
export function step(rope: Rope, opts: StepOptions): void {
	const gravity = opts.gravity ?? 0.6;
	const damping = opts.damping ?? 0.98;
	const iterations = opts.iterations ?? 16;
	const skin = opts.skin ?? 0.5;
	const pts = rope.points;
	const hasPlug = opts.plug != null;

	// Verlet integration.
	for (const p of pts) {
		const vx = (p.x - p.px) * damping;
		const vy = (p.y - p.py) * damping;
		p.px = p.x;
		p.py = p.y;
		p.x += vx;
		p.y += vy + gravity;
	}

	// Relax: pin endpoints, satisfy distance constraints, resolve collisions.
	for (let k = 0; k < iterations; k++) {
		pin(pts[0], opts.anchor);
		if (hasPlug && opts.plug) pin(pts[pts.length - 1], opts.plug);
		for (let i = 0; i < pts.length - 1; i++) {
			satisfy(pts[i], pts[i + 1], rope.segmentLength);
		}
		if (opts.colliders && opts.colliders.length > 0) {
			const last = pts.length - (hasPlug ? 1 : 0);
			for (let i = 1; i < last; i++) collide(pts[i], opts.colliders, skin);
		}
	}

	// Guarantee endpoints land exactly on their pins after the final relax pass.
	pin(pts[0], opts.anchor);
	if (hasPlug && opts.plug) pin(pts[pts.length - 1], opts.plug);
}

/** Hard-pin a point (also zeroes its velocity). */
function pin(p: Point, t: Vec): void {
	p.x = t.x;
	p.y = t.y;
	p.px = t.x;
	p.py = t.y;
}

/** Move two points so their distance returns toward `len`. */
function satisfy(a: Point, b: Point, len: number): void {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const d = Math.hypot(dx, dy) || 0.0001;
	const diff = ((d - len) / d) * 0.5;
	const ox = dx * diff;
	const oy = dy * diff;
	a.x += ox;
	a.y += oy;
	b.x -= ox;
	b.y -= oy;
}

/** If a point is inside any rect, push it to that rect's nearest edge. */
function collide(p: Point, rects: Rect[], skin: number): void {
	for (const r of rects) {
		const inside =
			p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
		if (!inside) continue;
		const left = p.x - r.x;
		const right = r.x + r.w - p.x;
		const top = p.y - r.y;
		const bottom = r.y + r.h - p.y;
		const min = Math.min(left, right, top, bottom);
		if (min === left) p.x = r.x - skin;
		else if (min === right) p.x = r.x + r.w + skin;
		else if (min === top) p.y = r.y - skin;
		else p.y = r.y + r.h + skin;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/cable/verlet-rope.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/cable/verlet-rope.ts src/features/canvas/cable/verlet-rope.test.ts
git commit -m "feat(canvas): add pure Verlet-rope simulation for the connect cable"
```

---

## Task 3: Cable store (zustand, TDD)

**Files:**
- Create: `src/features/canvas/cable/cable-store.ts`
- Test: `src/features/canvas/cable/cable-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/canvas/cable/cable-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useCableStore } from "./cable-store";

describe("cable-store", () => {
	beforeEach(() => useCableStore.getState().cancel());

	it("spawns an active cable anchored to the source pane", () => {
		useCableStore.getState().spawn("pane-a", { x: 10, y: 20 });
		const active = useCableStore.getState().active;
		expect(active?.sourcePaneId).toBe("pane-a");
		expect(active?.anchor).toEqual({ x: 10, y: 20 });
		expect(active?.dragging).toBe(false);
		expect(active?.pluggedTargetId).toBeNull();
	});

	it("updates the plug position and hovered target while dragging", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().setDragging(true);
		useCableStore.getState().updatePlug({ x: 50, y: 60 }, "pane-b");
		const active = useCableStore.getState().active;
		expect(active?.plug).toEqual({ x: 50, y: 60 });
		expect(active?.hoveredTargetId).toBe("pane-b");
		expect(active?.dragging).toBe(true);
	});

	it("records the plugged target (decorative) on plugInto", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().plugInto("pane-b", { x: 90, y: 90 });
		const active = useCableStore.getState().active;
		expect(active?.pluggedTargetId).toBe("pane-b");
		expect(active?.plug).toEqual({ x: 90, y: 90 });
		expect(active?.dragging).toBe(false);
		expect(active?.hoveredTargetId).toBeNull();
	});

	it("cancel clears the active cable", () => {
		useCableStore.getState().spawn("pane-a", { x: 0, y: 0 });
		useCableStore.getState().cancel();
		expect(useCableStore.getState().active).toBeNull();
	});

	it("mutations are no-ops when no cable is active", () => {
		useCableStore.getState().updatePlug({ x: 1, y: 1 }, "pane-b");
		expect(useCableStore.getState().active).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/cable/cable-store.test.ts`
Expected: FAIL — module `./cable-store` not found.

- [ ] **Step 3: Implement the store**

Create `src/features/canvas/cable/cable-store.ts`:

```ts
import { create } from "zustand";
import type { Vec } from "./verlet-rope";

/** The single in-flight cable. Decorative for now: plugging in records the
 * target but does NOT persist a connection. */
export type ActiveCable = {
	sourcePaneId: string;
	/** Source anchor in flow coordinates (right-edge midpoint of the source). */
	anchor: Vec;
	/** Free/plug end position in flow coordinates (used while dragging/plugged). */
	plug: Vec;
	/** True while the user is dragging the plug. */
	dragging: boolean;
	/** Pane currently under the plug (highlighted as a drop target). */
	hoveredTargetId: string | null;
	/** Pane the cable is visually plugged into (decorative). */
	pluggedTargetId: string | null;
};

type CableStore = {
	active: ActiveCable | null;
	/** Start a new cable from `sourcePaneId`, anchored at `anchor`. */
	spawn: (sourcePaneId: string, anchor: Vec) => void;
	setDragging: (dragging: boolean) => void;
	/** Move the plug (flow coords) and set the hovered drop target. */
	updatePlug: (plug: Vec, hoveredTargetId: string | null) => void;
	/** Visually plug into `targetPaneId` at `at` (flow coords).
	 * TODO(connection-persist): when the connect feature lands, also create a
	 * real CanvasConnection here via useConnectionsStore.addConnection(). */
	plugInto: (targetPaneId: string, at: Vec) => void;
	cancel: () => void;
};

export const useCableStore = create<CableStore>((set) => ({
	active: null,

	spawn: (sourcePaneId, anchor) =>
		set({
			active: {
				sourcePaneId,
				anchor,
				plug: { x: anchor.x + 180, y: anchor.y + 60 },
				dragging: false,
				hoveredTargetId: null,
				pluggedTargetId: null,
			},
		}),

	setDragging: (dragging) =>
		set((s) => (s.active ? { active: { ...s.active, dragging } } : s)),

	updatePlug: (plug, hoveredTargetId) =>
		set((s) =>
			s.active
				? {
						active: {
							...s.active,
							plug,
							hoveredTargetId,
							pluggedTargetId: null,
						},
					}
				: s,
		),

	plugInto: (targetPaneId, at) =>
		set((s) =>
			s.active
				? {
						active: {
							...s.active,
							plug: at,
							dragging: false,
							hoveredTargetId: null,
							pluggedTargetId: targetPaneId,
						},
					}
				: s,
		),

	cancel: () => set({ active: null }),
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun x vitest run src/features/canvas/cable/cable-store.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/cable/cable-store.ts src/features/canvas/cable/cable-store.test.ts
git commit -m "feat(canvas): add cable store for the active connect cable"
```

---

## Task 4: Cable overlay (SVG + rAF loop + plug drag)

**Files:**
- Create: `src/features/canvas/cable/cable-overlay.tsx`

This component is visual-only (imperative rAF rendering), so it has no unit test. Verification is via typecheck/lint + manual canvas check in Task 6.

- [ ] **Step 1: Implement the overlay**

Create `src/features/canvas/cable/cable-overlay.tsx`:

```tsx
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH } from "../types";
import { useCableStore } from "./cable-store";
import { createRope, type Rect, type Rope, type Vec, step } from "./verlet-rope";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";
const SEGMENTS = 24;

/** Renders the active connect cable as a draggable physics rope over the canvas.
 * Simulates in flow coordinates and projects to screen via the live viewport so
 * the cable pans/zooms with the panes. Drawing is imperative (no per-frame React
 * re-render); only mount/unmount is driven by store state. */
export function CableOverlay() {
	const rf = useReactFlow();
	const hasActive = useCableStore((s) => s.active !== null);
	const sourceId = useCableStore((s) => s.active?.sourcePaneId ?? null);

	const svgRef = useRef<SVGSVGElement>(null);
	const pathRef = useRef<SVGPathElement>(null);
	const plugRef = useRef<SVGGElement>(null);
	const ropeRef = useRef<Rope | null>(null);

	// (Re)build the rope whenever a new cable is spawned for a different source.
	useEffect(() => {
		if (!hasActive) {
			ropeRef.current = null;
			return;
		}
		const active = useCableStore.getState().active;
		if (!active) return;
		ropeRef.current = createRope(active.anchor, active.plug, SEGMENTS);
	}, [hasActive, sourceId]);

	// rAF simulation + draw loop, alive only while a cable is active.
	useEffect(() => {
		if (!hasActive) return;
		let raf = 0;

		const tick = () => {
			raf = requestAnimationFrame(tick);
			const active = useCableStore.getState().active;
			const rope = ropeRef.current;
			if (!active || !rope) return;

			const nodes = rf.getNodes();
			const vp = rf.getViewport();

			// Source anchor follows the source pane's right-edge midpoint.
			const src = nodes.find((n) => n.id === active.sourcePaneId);
			const anchor: Vec = src
				? {
						x: src.position.x + nodeWidth(src),
						y: src.position.y + nodeHeight(src) / 2,
					}
				: active.anchor;

			// Colliders: every pane rectangle except the source.
			const colliders: Rect[] = nodes
				.filter((n) => n.id !== active.sourcePaneId)
				.map((n) => ({
					x: n.position.x,
					y: n.position.y,
					w: nodeWidth(n),
					h: nodeHeight(n),
				}));

			// Pin the plug only while dragging or plugged; otherwise it dangles.
			const pinned = active.dragging || active.pluggedTargetId !== null;
			step(rope, {
				anchor,
				plug: pinned ? active.plug : null,
				colliders,
				gravity: 0.6,
			});

			// Project flow → screen and draw.
			const toScreen = (p: { x: number; y: number }) => ({
				x: p.x * vp.zoom + vp.x,
				y: p.y * vp.zoom + vp.y,
			});
			const pts = rope.points.map(toScreen);
			if (pathRef.current) {
				pathRef.current.setAttribute("d", smoothPath(pts));
			}
			if (plugRef.current) {
				const tip = pts[pts.length - 1];
				plugRef.current.setAttribute(
					"transform",
					`translate(${tip.x}, ${tip.y})`,
				);
				plugRef.current.style.fill =
					active.hoveredTargetId !== null || active.pluggedTargetId !== null
						? SELECTED_COLOR
						: "#cbd5e1";
			}
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [hasActive, rf]);

	if (!hasActive) return null;

	const onPlugPointerDown = (e: React.PointerEvent) => {
		e.stopPropagation();
		e.preventDefault();
		(e.target as Element).setPointerCapture?.(e.pointerId);
		useCableStore.getState().setDragging(true);
	};

	const onPlugPointerMove = (e: React.PointerEvent) => {
		const store = useCableStore.getState();
		if (!store.active?.dragging) return;
		const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
		const target = paneAt(rf, flow, store.active.sourcePaneId);
		store.updatePlug(flow, target);
	};

	const onPlugPointerUp = (e: React.PointerEvent) => {
		(e.target as Element).releasePointerCapture?.(e.pointerId);
		const store = useCableStore.getState();
		if (!store.active) return;
		const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
		const target = paneAt(rf, flow, store.active.sourcePaneId);
		if (target) {
			// Snap to the target pane's left-edge midpoint (decorative plug-in).
			const node = rf.getNode(target);
			if (node) {
				store.plugInto(target, {
					x: node.position.x,
					y: node.position.y + nodeHeight(node) / 2,
				});
				return;
			}
		}
		// Released over empty space: let the plug fall and dangle.
		store.setDragging(false);
	};

	return (
		<svg
			ref={svgRef}
			className="pointer-events-none absolute inset-0 z-10 size-full"
			aria-hidden
		>
			<path
				ref={pathRef}
				fill="none"
				stroke={SELECTED_COLOR}
				strokeWidth={4}
				strokeLinecap="round"
				opacity={0.9}
			/>
			<g
				ref={plugRef}
				className="pointer-events-auto cursor-grab"
				onPointerDown={onPlugPointerDown}
				onPointerMove={onPlugPointerMove}
				onPointerUp={onPlugPointerUp}
			>
				{/* Larger invisible hit area for easy grabbing. */}
				<circle r={16} fill="transparent" />
				<circle r={7} stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} />
			</g>
		</svg>
	);
}

function nodeWidth(n: { measured?: { width?: number }; width?: number }): number {
	return n.measured?.width ?? n.width ?? PANEL_DEFAULT_WIDTH;
}

function nodeHeight(n: {
	measured?: { height?: number };
	height?: number;
}): number {
	return n.measured?.height ?? n.height ?? PANEL_DEFAULT_HEIGHT;
}

/** Topmost pane containing `flow`, excluding the source pane. */
function paneAt(
	rf: ReturnType<typeof useReactFlow>,
	flow: { x: number; y: number },
	sourceId: string,
): string | null {
	const nodes = rf.getNodes();
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i];
		if (n.id === sourceId) continue;
		const w = nodeWidth(n);
		const h = nodeHeight(n);
		if (
			flow.x >= n.position.x &&
			flow.x <= n.position.x + w &&
			flow.y >= n.position.y &&
			flow.y <= n.position.y + h
		) {
			return n.id;
		}
	}
	return null;
}

/** Catmull-Rom-ish smooth path through the projected points. */
function smoothPath(pts: { x: number; y: number }[]): string {
	if (pts.length === 0) return "";
	if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
	let d = `M ${pts[0].x} ${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		d += ` Q ${a.x} ${a.y} ${mx} ${my}`;
	}
	const last = pts[pts.length - 1];
	d += ` L ${last.x} ${last.y}`;
	return d;
}
```

- [ ] **Step 2: Verify typecheck + lint pass**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x biome check src/features/canvas/cable/cable-overlay.tsx`
Expected: no type errors; biome clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/cable/cable-overlay.tsx
git commit -m "feat(canvas): add physics cable overlay (SVG rope + plug drag)"
```

---

## Task 5: Wire the Connect button + mount the overlay

**Files:**
- Modify: `src/features/canvas/chrome/selection-toolbar.tsx`
- Modify: `src/features/canvas/index.tsx:343`

- [ ] **Step 1: Replace the placeholder connect state with the cable store**

In `src/features/canvas/chrome/selection-toolbar.tsx`:

Add imports near the top (after the existing `../types` import on line 13):

```tsx
import {
	PANEL_DEFAULT_HEIGHT,
	PANEL_DEFAULT_WIDTH,
} from "../types";
import { useCableStore } from "../cable/cable-store";
```

(Note: the file already imports `type { PanelNode } from "../types"`. Merge the value imports `PANEL_DEFAULT_HEIGHT`/`PANEL_DEFAULT_WIDTH` into that existing line instead of duplicating it: change `import type { PanelNode } from "../types";` to two imports — a `import type { PanelNode } from "../types";` and `import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH } from "../types";`.)

Remove the placeholder state. Delete these lines (currently 22-24):

```tsx
	// Visual-only "connect mode" affordance. The real wire-routing between
	// panels (with collision avoidance) is wired up in a later pass.
	const [connecting, setConnecting] = useState(false);
```

In `onChange` (line ~26-29), remove the `setConnecting(false);` line so it reads:

```tsx
	const onChange = useCallback(({ nodes }: { nodes: PanelNode[] }) => {
		setSelected(nodes.length === 1 ? nodes[0] : null);
	}, []);
```

Add the cable selectors after `const actions = useCanvasActions();` (line ~20):

```tsx
	const cableActive = useCableStore((s) => s.active?.sourcePaneId);
```

- [ ] **Step 2: Drive the Connect button from the cable store**

Replace the Connect `ToolbarButton` block (currently lines 82-88) with:

```tsx
			<ToolbarButton
				label={cableActive === id ? "Cancel connection" : "Connect to panel"}
				onClick={() => {
					const store = useCableStore.getState();
					if (store.active?.sourcePaneId === id) {
						store.cancel();
						return;
					}
					const w =
						(selected.measured?.width ?? selected.width) || PANEL_DEFAULT_WIDTH;
					const h =
						(selected.measured?.height ?? selected.height) ||
						PANEL_DEFAULT_HEIGHT;
					store.spawn(id, {
						x: selected.position.x + w,
						y: selected.position.y + h / 2,
					});
				}}
				active={cableActive === id}
			>
				<Cable className="size-4" />
			</ToolbarButton>
```

- [ ] **Step 3: Remove the now-unused `useState` import if unused**

Check whether `useState` is still used in the file (it is — `RenameField` uses it). Leave the React imports as-is. Confirm no leftover references to `connecting`/`setConnecting` remain (search the file).

- [ ] **Step 4: Mount the overlay in the canvas**

In `src/features/canvas/index.tsx`, add the import alongside the other chrome imports (after line 37 `import { CanvasSelectionToolbar } ...`):

```tsx
import { CableOverlay } from "./cable/cable-overlay";
```

Then mount it right after `<CanvasSelectionToolbar />` (line 343), inside the `<TooltipProvider>`:

```tsx
						<CanvasSelectionToolbar />
						<CableOverlay />
```

- [ ] **Step 5: Verify typecheck + lint pass**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run typecheck && bun x biome check src/features/canvas`
Expected: no type errors; biome clean.

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run test:frontend`
Expected: PASS — including the new `verlet-rope` and `cable-store` tests; no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/features/canvas/chrome/selection-toolbar.tsx src/features/canvas/index.tsx
git commit -m "feat(canvas): spawn the physics connect cable from the toolbar"
```

---

## Task 6: Manual verification in the running app

**Files:** none (manual check).

- [ ] **Step 1: Launch the dev app**

Run: `cd /Users/legacyn/helmor-dev/workspaces/helmor/erinde && bun run dev` (or use the Tauri MCP bridge per AGENTS.md if a build is already running).

- [ ] **Step 2: Verify the toolbar**

Open a canvas, create/select a single pane. Confirm the selection toolbar:
- reads as frosted glass consistent with the side rails (blur + white border/ring),
- is visibly more solid than the rails and a touch bigger than before,
- still shows the selection-hue glow.

- [ ] **Step 3: Verify the cable**

With two+ panes on the canvas:
- Click the Connect (cable) button on a selected pane → a cable drops from the pane's right edge and sags under gravity.
- Drag the plug end → the cable follows; dragging it across another pane shows it drape over that pane (collision).
- Drop the plug over another pane → it snaps/plugs into that pane's left edge and the plug highlights in the selection hue.
- Drop over empty space → the plug falls and the cable dangles.
- Pan/zoom the canvas → the cable stays correctly attached and scales with the viewport.
- Click Connect again → the cable disappears.

- [ ] **Step 4: Add a changeset**

Create `.changeset/<slug>.md` (see the `helmor-release` skill for format). Body (prose summary + sub-items, since there are two distinct user-visible changes):

```markdown
---
"helmor": patch
---

Refine the canvas selection toolbar and add a physics connect cable.

- The selection toolbar now matches the app's frosted-glass style, a bit more solid and slightly larger.
- The Connect button drops a draggable cable that sags under gravity, drapes over panes, and plugs into another pane.
```

- [ ] **Step 5: Commit the changeset**

```bash
git add .changeset
git commit -m "chore: changeset for canvas toolbar glass + physics connect cable"
```

---

## Self-Review Notes

- **Spec coverage:** Part A (toolbar glass/opacity/size) → Task 1. Part B `verlet-rope.ts` → Task 2; `cable-store.ts` → Task 3; `cable-overlay.tsx` → Task 4; Connect wiring + overlay mount → Task 5. Decorative-only seam (`plugInto` TODO) present in Task 3. Dangle-on-empty-release → Task 4 `onPlugPointerUp` + unpinned free end. Tests for the rope sim + store → Tasks 2-3. Manual visual check → Task 6.
- **Type consistency:** `Vec`/`Rect`/`Rope`/`Point` defined in `verlet-rope.ts` and reused by `cable-store.ts` (imports `Vec`) and `cable-overlay.tsx`. Store API (`spawn`/`setDragging`/`updatePlug`/`plugInto`/`cancel`) matches usage in the overlay and toolbar. `nodeWidth`/`nodeHeight` helpers used consistently.
- **No persistence:** nothing touches `connections-store`, `schema.rs`, or `pipeline/`, so no Rust snapshot tests are required (per AGENTS.md).
```

