# PlanCanvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `<PlanCanvas>`, a bounded, smooth pan/zoom mind-map plan component whose graph the agent authors (nodes + connections) and that auto-lays-out, letting the user drag/pan/zoom to explore (ephemeral).

**Architecture:** A new "structured" child mode lets a plan component receive its parsed child blocks (not pre-rendered ReactNode), so `PlanCanvas` can read `<CanvasNode>` ids/titles/`connects` and build a graph. A pure `build-graph` step turns blocks into React Flow nodes/edges; a pure `layout` step positions them with dagre; a lazy-loaded React Flow surface renders custom Helmor-styled nodes. No DB/storage/pipeline changes; the only backend edit is the agent authoring prompt (kept in sync with the registry, per the existing SYNC-WITH contract).

**Tech Stack:** React 19, `@xyflow/react` (React Flow), `@dagrejs/dagre`, Vitest + Testing Library, existing `unified`/`remark-mdx` plan parser, Tailwind v4 tokens.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/plan-viewer/mdx/registry.tsx` | Add `"structured"` child mode; register `PlanCanvas` + `CanvasNode`. |
| `src/features/plan-viewer/mdx/parse.ts` | Recurse into children for `"structured"` mode (currently only `"blocks"`). |
| `src/features/plan-viewer/render-blocks.tsx` | Pass raw `childBlocks` to `"structured"` components. |
| `src/features/plan-viewer/components/canvas/build-graph.ts` | Pure: `PlanBlock[]` → `{ nodes, edges }` (no JSX). |
| `src/features/plan-viewer/components/canvas/layout.ts` | Pure: dagre layout → positioned nodes. |
| `src/features/plan-viewer/components/canvas/canvas-node.tsx` | Custom React Flow node, Helmor-styled, renders node body blocks. |
| `src/features/plan-viewer/components/canvas/plan-canvas-surface.tsx` | React Flow surface (nodeTypes, fitView, controls, selection highlight). |
| `src/features/plan-viewer/components/canvas/index.tsx` | Lazy boundary + `PlanCanvas` entry consuming `childBlocks`. |
| `src-tauri/src/agents/system_prompt.rs` | Add `<PlanCanvas>`/`<CanvasNode>` to the authoring block + assertion test. |
| `package.json` | Add `@xyflow/react`, `@dagrejs/dagre`. |

Test files: `build-graph.test.ts`, `layout.test.ts` (co-located in `components/canvas/`), and additions to `mdx/parse.test.ts`.

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the two runtime deps**

Run:
```bash
bun add @xyflow/react @dagrejs/dagre
```
Expected: `package.json` gains both under `dependencies`; `bun.lock` updates; install succeeds.

- [ ] **Step 2: Verify they resolve**

Run:
```bash
bun pm ls | grep -E "@xyflow/react|@dagrejs/dagre"
```
Expected: both packages listed with a version.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "build: add @xyflow/react and @dagrejs/dagre for plan canvas"
```

---

## Task 2: Add the "structured" child mode (registry + parser + renderer plumbing)

This is the load-bearing plumbing: a component in `"structured"` mode receives the **parsed child blocks** instead of pre-rendered React nodes, so `PlanCanvas` can inspect node ids/`connects`.

**Files:**
- Modify: `src/features/plan-viewer/mdx/registry.tsx`
- Modify: `src/features/plan-viewer/mdx/parse.ts:204-205`
- Modify: `src/features/plan-viewer/render-blocks.tsx:16-20`
- Test: `src/features/plan-viewer/mdx/parse.test.ts`

- [ ] **Step 1: Write a failing parser test for structured recursion**

Add to `src/features/plan-viewer/mdx/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePlanMdx } from "./parse";

describe("PlanCanvas structured parsing", () => {
	it("recurses into PlanCanvas/CanvasNode children", () => {
		const src = [
			"---",
			'title: "T"',
			"status: draft",
			'summary: "S"',
			"---",
			"",
			'<PlanCanvas direction="TB">',
			'<CanvasNode id="a" title="A" connects="b">',
			"Body of A",
			"</CanvasNode>",
			'<CanvasNode id="b" title="B" />',
			"</PlanCanvas>",
			"",
		].join("\n");

		const { blocks } = parsePlanMdx(src);
		const canvas = blocks.find(
			(b) => b.kind === "component" && b.name === "PlanCanvas",
		);
		expect(canvas).toBeDefined();
		if (canvas?.kind !== "component") throw new Error("expected component");
		const nodes = canvas.childBlocks.filter(
			(b) => b.kind === "component" && b.name === "CanvasNode",
		);
		expect(nodes).toHaveLength(2);
		const first = nodes[0];
		if (first.kind !== "component") throw new Error("expected component");
		expect(first.props.id).toBe("a");
		expect(first.props.connects).toBe("b");
		// body of A recursed into a prose child block
		expect(first.childBlocks.some((c) => c.kind === "prose")).toBe(true);
	});
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
bun x vitest run src/features/plan-viewer/mdx/parse.test.ts -t "structured"
```
Expected: FAIL — `PlanCanvas` is unknown, so `childBlocks` is empty and `nodes` has length 0.

- [ ] **Step 3: Extend the child-mode type and register the components**

In `src/features/plan-viewer/mdx/registry.tsx`, change the type and add registrations. Replace lines 16 and 31-38:

```tsx
export type PlanChildMode = "blocks" | "raw" | "structured";
```

and add imports + entries:

```tsx
import { PlanCanvas } from "../components/canvas";
// CanvasNode is consumed structurally by PlanCanvas; it is registered only so
// the parser recurses into each node's body. It has no standalone renderer
// (it never reaches renderBlock outside a PlanCanvas), so we reuse PlanCanvas
// as a harmless render placeholder — see note below.

export const PLAN_COMPONENTS: Record<string, PlanComponentDef> = {
	RiskCard: { render: RiskCard, childMode: "blocks" },
	Steps: { render: Steps, childMode: "blocks" },
	FileMap: { render: FileMap, childMode: "raw" },
	OpenQuestions: { render: OpenQuestions, childMode: "blocks" },
	AnnotatedCode: { render: AnnotatedCode, childMode: "raw" },
	Diagram: { render: Diagram, childMode: "raw" },
	PlanCanvas: { render: PlanCanvas, childMode: "structured" },
	CanvasNode: { render: CanvasNodeFallback, childMode: "blocks" },
};
```

Add a tiny fallback renderer at the bottom of the file (used only if a `<CanvasNode>` is authored outside a `<PlanCanvas>`):

```tsx
import type { ReactNode } from "react";

/** Standalone fallback: a CanvasNode authored outside a PlanCanvas just renders
 * its body blocks inline so content is never lost. */
function CanvasNodeFallback({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}
```

- [ ] **Step 4: Make the parser recurse for structured mode**

In `src/features/plan-viewer/mdx/parse.ts`, replace lines 204-205:

```ts
const mode = planChildMode(name);
const childBlocks =
	mode === "blocks" || mode === "structured"
		? walk(node.children ?? [])
		: [];
```

- [ ] **Step 5: Pass raw childBlocks to structured components in the renderer**

In `src/features/plan-viewer/render-blocks.tsx`, update `renderBlock` (lines 16-20) to branch on structured mode. Replace the body after `const Cmp = def.render;`:

```tsx
const Cmp = def.render;
if (def.childMode === "structured") {
	return <Cmp {...block.props} childBlocks={block.childBlocks} />;
}
if (def.childMode === "blocks") {
	return <Cmp {...block.props}>{renderBlocks(block.childBlocks)}</Cmp>;
}
return <Cmp {...block.props}>{block.rawText}</Cmp>;
```

- [ ] **Step 6: Add a temporary stub so the import resolves**

Create `src/features/plan-viewer/components/canvas/index.tsx` with a stub (real impl in Task 6):

```tsx
import type { PlanBlock } from "../../mdx/parse";

export function PlanCanvas(_props: { childBlocks?: PlanBlock[] }) {
	return null;
}
```

- [ ] **Step 7: Run the parser test to confirm it passes**

Run:
```bash
bun x vitest run src/features/plan-viewer/mdx/parse.test.ts -t "structured"
```
Expected: PASS.

- [ ] **Step 8: Run the full plan-viewer test file to confirm no regressions**

Run:
```bash
bun x vitest run src/features/plan-viewer
```
Expected: PASS (existing parse/plan-view tests still green).

- [ ] **Step 9: Commit**

```bash
git add src/features/plan-viewer/mdx/registry.tsx src/features/plan-viewer/mdx/parse.ts src/features/plan-viewer/render-blocks.tsx src/features/plan-viewer/mdx/parse.test.ts src/features/plan-viewer/components/canvas/index.tsx
git commit -m "feat(plan-viewer): add structured child mode and register PlanCanvas"
```

---

## Task 3: Pure graph builder (`build-graph.ts`)

Turns `PlanCanvas`'s child blocks into React Flow node/edge descriptors. No JSX, no dagre — fully unit-testable. Node bodies are carried as `bodyBlocks` (raw `PlanBlock[]`) for the renderer to render later.

**Files:**
- Create: `src/features/plan-viewer/components/canvas/build-graph.ts`
- Test: `src/features/plan-viewer/components/canvas/build-graph.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/features/plan-viewer/components/canvas/build-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlanBlock } from "../../mdx/parse";
import { buildCanvasGraph } from "./build-graph";

function node(
	id: string,
	props: Record<string, string>,
	children: PlanBlock[] = [],
): PlanBlock {
	return {
		kind: "component",
		id,
		name: "CanvasNode",
		props,
		rawText: "",
		childBlocks: children,
	};
}

describe("buildCanvasGraph", () => {
	it("builds nodes from CanvasNode blocks", () => {
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "A" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
		expect(nodes[0].data.title).toBe("A");
	});

	it("builds edges from connects and drops dangling targets", () => {
		const { edges } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", connects: "b, missing" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ source: "a", target: "b" });
	});

	it("synthesizes an id from the block id when id prop is absent", () => {
		const { nodes } = buildCanvasGraph([node("b7", { title: "No id" })]);
		expect(nodes[0].id).toBe("b7");
	});

	it("ignores non-CanvasNode child blocks", () => {
		const { nodes } = buildCanvasGraph([
			{ kind: "prose", id: "p0", markdown: "stray" },
			node("b0", { id: "a", title: "A" }),
		]);
		expect(nodes.map((n) => n.id)).toEqual(["a"]);
	});

	it("carries the node body blocks for rendering", () => {
		const body: PlanBlock = { kind: "prose", id: "p", markdown: "hi" };
		const { nodes } = buildCanvasGraph([node("b0", { id: "a", title: "A" }, [body])]);
		expect(nodes[0].data.bodyBlocks).toEqual([body]);
	});
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
bun x vitest run src/features/plan-viewer/components/canvas/build-graph.test.ts
```
Expected: FAIL — `build-graph` does not exist.

- [ ] **Step 3: Implement `build-graph.ts`**

Create `src/features/plan-viewer/components/canvas/build-graph.ts`:

```ts
import type { PlanBlock } from "../../mdx/parse";

/** Data carried on each React Flow node (rendered by canvas-node.tsx). */
export type CanvasNodeData = {
	title: string;
	bodyBlocks: PlanBlock[];
};

export type CanvasGraphNode = {
	id: string;
	type: "canvasNode";
	data: CanvasNodeData;
	position: { x: number; y: number };
};

export type CanvasGraphEdge = {
	id: string;
	source: string;
	target: string;
};

export type CanvasGraph = {
	nodes: CanvasGraphNode[];
	edges: CanvasGraphEdge[];
};

function splitConnects(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Convert a PlanCanvas component's child blocks into a React Flow graph.
 * Only `CanvasNode` component blocks become nodes; everything else is ignored.
 * Positions are all `{0,0}` here — `layout.ts` assigns real coordinates.
 */
export function buildCanvasGraph(childBlocks: PlanBlock[]): CanvasGraph {
	const nodes: CanvasGraphNode[] = [];
	const ids = new Set<string>();

	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasNode") {
			continue;
		}
		const id = block.props.id?.trim() || block.id;
		if (ids.has(id)) continue;
		ids.add(id);
		nodes.push({
			id,
			type: "canvasNode",
			data: {
				title: block.props.title?.trim() || id,
				bodyBlocks: block.childBlocks,
			},
			position: { x: 0, y: 0 },
		});
	}

	const edges: CanvasGraphEdge[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasNode") {
			continue;
		}
		const source = block.props.id?.trim() || block.id;
		for (const target of splitConnects(block.props.connects)) {
			if (!ids.has(target)) continue; // drop dangling edges
			edges.push({ id: `${source}->${target}`, source, target });
		}
	}

	return { nodes, edges };
}
```

- [ ] **Step 4: Run to confirm pass**

Run:
```bash
bun x vitest run src/features/plan-viewer/components/canvas/build-graph.test.ts
```
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/canvas/build-graph.ts src/features/plan-viewer/components/canvas/build-graph.test.ts
git commit -m "feat(plan-viewer): pure canvas graph builder"
```

---

## Task 4: Pure dagre layout (`layout.ts`)

Assigns coordinates. React Flow positions are top-left; dagre returns node centers, so we offset by half the nominal size. Uses fixed nominal node dimensions for v1 (documented limitation — variable-height nodes may overlap slightly until a measured-layout pass is added later).

**Files:**
- Create: `src/features/plan-viewer/components/canvas/layout.ts`
- Test: `src/features/plan-viewer/components/canvas/layout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/features/plan-viewer/components/canvas/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CanvasGraph } from "./build-graph";
import { layoutCanvasGraph } from "./layout";

const graph: CanvasGraph = {
	nodes: [
		{ id: "a", type: "canvasNode", data: { title: "A", bodyBlocks: [] }, position: { x: 0, y: 0 } },
		{ id: "b", type: "canvasNode", data: { title: "B", bodyBlocks: [] }, position: { x: 0, y: 0 } },
	],
	edges: [{ id: "a->b", source: "a", target: "b" }],
};

describe("layoutCanvasGraph", () => {
	it("assigns distinct positions to connected nodes", () => {
		const out = layoutCanvasGraph(graph, "TB");
		const a = out.nodes.find((n) => n.id === "a");
		const b = out.nodes.find((n) => n.id === "b");
		expect(a && b).toBeTruthy();
		// In a top-bottom layout, the child sits below the parent.
		expect((b as { position: { y: number } }).position.y).toBeGreaterThan(
			(a as { position: { y: number } }).position.y,
		);
	});

	it("returns finite coordinates", () => {
		const out = layoutCanvasGraph(graph, "LR");
		for (const n of out.nodes) {
			expect(Number.isFinite(n.position.x)).toBe(true);
			expect(Number.isFinite(n.position.y)).toBe(true);
		}
	});

	it("handles a single node with no edges", () => {
		const out = layoutCanvasGraph(
			{ nodes: [graph.nodes[0]], edges: [] },
			"TB",
		);
		expect(out.nodes).toHaveLength(1);
		expect(Number.isFinite(out.nodes[0].position.x)).toBe(true);
	});
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
bun x vitest run src/features/plan-viewer/components/canvas/layout.test.ts
```
Expected: FAIL — `layout` does not exist.

- [ ] **Step 3: Implement `layout.ts`**

Create `src/features/plan-viewer/components/canvas/layout.ts`:

```ts
import dagre from "@dagrejs/dagre";
import type { CanvasGraph } from "./build-graph";

/** Nominal node size used for layout spacing (actual nodes size to content). */
const NODE_W = 220;
const NODE_H = 96;

export type CanvasDirection = "TB" | "LR";

/** Position every node with dagre. Pure: returns a new graph; input untouched. */
export function layoutCanvasGraph(
	graph: CanvasGraph,
	direction: CanvasDirection,
): CanvasGraph {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 64 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of graph.nodes) {
		g.setNode(node.id, { width: NODE_W, height: NODE_H });
	}
	for (const edge of graph.edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const nodes = graph.nodes.map((node) => {
		const pos = g.node(node.id);
		// dagre returns the node center; React Flow wants the top-left corner.
		return {
			...node,
			position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
		};
	});

	return { nodes, edges: graph.edges };
}

export function parseDirection(value: string | undefined): CanvasDirection {
	return value === "LR" ? "LR" : "TB";
}
```

- [ ] **Step 4: Run to confirm pass**

Run:
```bash
bun x vitest run src/features/plan-viewer/components/canvas/layout.test.ts
```
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/canvas/layout.ts src/features/plan-viewer/components/canvas/layout.test.ts
git commit -m "feat(plan-viewer): dagre auto-layout for plan canvas"
```

---

## Task 5: Custom node component (`canvas-node.tsx`)

A Helmor-styled React Flow node: rounded card, title header, body rendered via the existing `renderBlocks`, with connection handles. Selection dims via React Flow's `selected` flag.

**Files:**
- Create: `src/features/plan-viewer/components/canvas/canvas-node.tsx`

- [ ] **Step 1: Implement the node**

Create `src/features/plan-viewer/components/canvas/canvas-node.tsx`:

```tsx
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { renderBlocks } from "../../render-blocks";
import type { CanvasNodeData } from "./build-graph";

/** A single mind-map card on the canvas. `data` comes from build-graph. */
export function CanvasNode({ data, selected }: NodeProps) {
	const { title, bodyBlocks } = data as unknown as CanvasNodeData;
	return (
		<div
			className={cn(
				"w-[220px] max-h-[200px] overflow-hidden rounded-lg border bg-card shadow-sm transition-all",
				"border-border",
				selected
					? "ring-2 ring-ring border-ring"
					: "hover:border-ring/60",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-border" />
			<div className="border-b border-border px-3 py-2 text-small font-medium text-foreground">
				{title}
			</div>
			{bodyBlocks.length > 0 ? (
				<div className="max-h-[140px] overflow-auto px-3 py-2 text-micro text-muted-foreground">
					{renderBlocks(bodyBlocks)}
				</div>
			) : null}
			<Handle type="source" position={Position.Bottom} className="!bg-border" />
		</div>
	);
}
```

Token note: these are the shadcn tokens the plan-viewer already uses (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `ring-ring`, plus the repo's custom `text-small`/`text-micro` sizes — verified against `components/risk-card.tsx`/`steps.tsx`). `cn` is the default export style helper at `@/lib/utils`.

- [ ] **Step 2: Typecheck**

Run:
```bash
bun run typecheck
```
Expected: PASS (no type errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add src/features/plan-viewer/components/canvas/canvas-node.tsx
git commit -m "feat(plan-viewer): Helmor-styled canvas node"
```

---

## Task 6: React Flow surface + lazy entry (`plan-canvas-surface.tsx`, `index.tsx`)

The surface wires graph → layout → React Flow with bounded height, fitView, controls, dotted background, and click-to-highlight. `index.tsx` lazy-loads it so React Flow/dagre never enter the initial bundle.

**Files:**
- Create: `src/features/plan-viewer/components/canvas/plan-canvas-surface.tsx`
- Modify (replace stub): `src/features/plan-viewer/components/canvas/index.tsx`

- [ ] **Step 1: Implement the surface**

Create `src/features/plan-viewer/components/canvas/plan-canvas-surface.tsx`:

```tsx
import {
	Background,
	BackgroundVariant,
	Controls,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { PlanBlock } from "../../mdx/parse";
import { buildCanvasGraph } from "./build-graph";
import { CanvasNode } from "./canvas-node";
import { layoutCanvasGraph, parseDirection } from "./layout";

const nodeTypes = { canvasNode: CanvasNode };

export type PlanCanvasSurfaceProps = {
	childBlocks: PlanBlock[];
	direction?: string;
};

export default function PlanCanvasSurface({
	childBlocks,
	direction,
}: PlanCanvasSurfaceProps) {
	const graph = useMemo(() => {
		const built = buildCanvasGraph(childBlocks);
		return layoutCanvasGraph(built, parseDirection(direction));
	}, [childBlocks, direction]);

	const [nodes, , onNodesChange] = useNodesState(graph.nodes);
	const [edges, , onEdgesChange] = useEdgesState(graph.edges);

	if (nodes.length === 0) {
		return null;
	}

	return (
		<div className="my-4 h-[460px] w-full overflow-hidden rounded-xl border border-border bg-background">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				minZoom={0.2}
				maxZoom={1.5}
				proOptions={{ hideAttribution: true }}
				nodesConnectable={false}
				edgesFocusable={false}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}
```

- [ ] **Step 2: Replace the stub `index.tsx` with the lazy entry**

Overwrite `src/features/plan-viewer/components/canvas/index.tsx`:

```tsx
import { lazy, Suspense } from "react";
import type { PlanBlock } from "../../mdx/parse";

const PlanCanvasSurface = lazy(() => import("./plan-canvas-surface"));

export type PlanCanvasProps = {
	childBlocks?: PlanBlock[];
	direction?: string;
};

/** Entry registered in the plan component registry (structured child mode). */
export function PlanCanvas({ childBlocks = [], direction }: PlanCanvasProps) {
	return (
		<Suspense
			fallback={
				<div className="my-4 h-[460px] w-full animate-pulse rounded-xl border border-border bg-background" />
			}
		>
			<PlanCanvasSurface childBlocks={childBlocks} direction={direction} />
		</Suspense>
	);
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
bun run typecheck
```
Expected: PASS.

- [ ] **Step 4: Verify the build bundles the lazy chunk**

Run:
```bash
bun run build
```
Expected: build succeeds; output lists a separate lazily-loaded chunk containing React Flow.

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/canvas/plan-canvas-surface.tsx src/features/plan-viewer/components/canvas/index.tsx
git commit -m "feat(plan-viewer): lazy React Flow canvas surface"
```

---

## Task 7: Component render smoke test

Verify `PlanCanvas` renders nodes from MDX end-to-end with React Flow mocked (jsdom can't measure the real surface).

**Files:**
- Create: `src/features/plan-viewer/components/canvas/plan-canvas.test.tsx`

- [ ] **Step 1: Write the test with React Flow mocked**

Create `src/features/plan-viewer/components/canvas/plan-canvas.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanBlock } from "../../mdx/parse";

// Mock React Flow: render each node's title so we can assert without a real canvas.
vi.mock("@xyflow/react", () => ({
	ReactFlow: ({ nodes }: { nodes: Array<{ id: string; data: { title: string } }> }) => (
		<div data-testid="rf">{nodes.map((n) => <span key={n.id}>{n.data.title}</span>)}</div>
	),
	Background: () => null,
	Controls: () => null,
	BackgroundVariant: { Dots: "dots" },
	Handle: () => null,
	Position: { Top: "top", Bottom: "bottom" },
	useNodesState: (init: unknown) => [init, vi.fn(), vi.fn()],
	useEdgesState: (init: unknown) => [init, vi.fn(), vi.fn()],
}));

import PlanCanvasSurface from "./plan-canvas-surface";

function canvasNode(id: string, title: string): PlanBlock {
	return { kind: "component", id, name: "CanvasNode", props: { id, title }, rawText: "", childBlocks: [] };
}

describe("PlanCanvasSurface", () => {
	it("renders a node per CanvasNode", () => {
		render(
			<PlanCanvasSurface childBlocks={[canvasNode("a", "Alpha"), canvasNode("b", "Beta")]} />,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
	});

	it("renders nothing when there are no nodes", () => {
		const { container } = render(<PlanCanvasSurface childBlocks={[]} />);
		expect(container.querySelector('[data-testid="rf"]')).toBeNull();
	});
});
```

- [ ] **Step 2: Run to confirm pass**

Run:
```bash
bun x vitest run src/features/plan-viewer/components/canvas/plan-canvas.test.tsx
```
Expected: PASS (2 tests). If the import of `@xyflow/react/dist/style.css` fails under vitest, add `"@xyflow/react/dist/style.css"` handling (vitest with jsdom ignores CSS imports by default via the existing config — confirm no error; if one appears, mock the css import too).

- [ ] **Step 3: Commit**

```bash
git add src/features/plan-viewer/components/canvas/plan-canvas.test.tsx
git commit -m "test(plan-viewer): canvas surface render smoke test"
```

---

## Task 8: Update agent authoring prompt (SYNC-WITH contract)

The agent only authors components listed in `MDX_PLAN_AUTHORING_BLOCK`. Add `PlanCanvas`/`CanvasNode` and update the assertion test. This is a prompt-string + test change only — no pipeline/storage shape change, so no snapshot work.

**Files:**
- Modify: `src-tauri/src/agents/system_prompt.rs:242-250` (the allowed-components list)
- Modify: `src-tauri/src/agents/system_prompt.rs:520-525` (the assertion test)

- [ ] **Step 1: Add the canvas to the allowed-components list**

In `src-tauri/src/agents/system_prompt.rs`, insert into the `Allowed components:` list (after the `<Diagram>` line, before the closing `"#`):

```
  - `<PlanCanvas direction="TB|LR">` containing `<CanvasNode>` children — an interactive mind-map shown at the TOP of the plan that visualises how the task's pieces connect. Prefer placing one PlanCanvas first, before the prose sections, as a high-level overview. Keep it focused (roughly 3–8 nodes).
  - `<CanvasNode id="unique-id" title="Short title" connects="other-id,another-id">` … short markdown … `</CanvasNode>` — one box in the PlanCanvas. `id` must be unique; `connects` is a comma-separated list of other node ids this box links to. Keep the body to a sentence or a short list. Use a self-closing `<CanvasNode ... />` when there is no body. CanvasNode is ONLY valid inside a PlanCanvas.
```

- [ ] **Step 2: Update the assertion test**

In the test that asserts component names appear (around line 520), add:

```rust
assert!(prompt.contains("PlanCanvas"));
assert!(prompt.contains("CanvasNode"));
```

- [ ] **Step 3: Run the system-prompt tests**

Run:
```bash
cd src-tauri && cargo test --lib system_prompt
```
Expected: PASS, including the new assertions.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/agents/system_prompt.rs
git commit -m "feat(agents): document PlanCanvas in plan authoring prompt"
```

---

## Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Frontend tests**

Run:
```bash
bun run test:frontend
```
Expected: PASS (all suites, including new canvas tests).

- [ ] **Step 2: Typecheck (frontend + sidecar)**

Run:
```bash
bun run typecheck
```
Expected: PASS.

- [ ] **Step 3: Lint (biome + clippy)**

Run:
```bash
bun run lint
```
Expected: PASS — zero biome errors, zero clippy warnings. Fix any `cursor-pointer`/token issues surfaced.

- [ ] **Step 4: Rust tests (authoring prompt)**

Run:
```bash
cd src-tauri && cargo test --lib system_prompt
```
Expected: PASS.

- [ ] **Step 5: Manual smoke test in the dev app**

Run `bun run dev`, then have an agent (or hand-write) a plan `.helmor/plans/canvas-demo.mdx` containing a `<PlanCanvas>` with 4 connected `<CanvasNode>`s. Open the Plan tab and confirm:
- The canvas renders first, bounded (~460px), with nodes + edges.
- Pan, zoom (scroll + controls), and node drag all feel smooth.
- Clicking a node shows the selection ring.
- Live edit (agent/manual write to the file) refreshes the canvas via the existing watcher.

- [ ] **Step 6: Final commit if any lint/format fixups were needed**

```bash
git add -A
git commit -m "chore(plan-viewer): lint/format fixups for plan canvas"
```

---

## Notes / known limitations (v1)

- **Ephemeral layout:** user drags are not persisted; reload restores the dagre layout. (Persistence is deliberately out of scope.)
- **Fixed nominal node size for layout:** very tall node bodies may slightly overlap until a measured-layout pass is added.
- **No drill-down, no prototype nodes, no minimap, no `kind` styling hint** — reserved for later iterations.
- The `CanvasNodeFallback` renderer means a stray `<CanvasNode>` outside a `<PlanCanvas>` degrades gracefully (renders its body inline) instead of disappearing.
