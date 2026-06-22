# Rich Plan Components — Wave 3 (Prototyping + Canvas Kinds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the prototyping vocabulary — `Wireframe` (static low-fi mockup from a line-DSL), `MultiPrototype`/`Variant` (tabbed variant comparison), `DataModel`/`Entity` (typed schema tables) — and enrich the infinity canvas with node *kinds* (`note`/`resume`/`option`/`phase`/`wireframe`) and per-kind variable sizing.

**Architecture:** New components under `src/features/plan-viewer/components/` compose the Wave 1 `PlanBlockShell` + accent system. `Wireframe` parses a constrained indentation-based DSL (pure parser in `wireframe/parse-wireframe.ts`, rendered by `wireframe/index.tsx`); it's `"raw"` child mode like `Diff`. `MultiPrototype` and `DataModel` are `"structured"` and extract typed sub-components (`Variant`, `Entity`) from parsed `childBlocks` (the Wave 2 pattern). Canvas kinds add a shared `canvas/node-kinds.ts` (kind enum + per-kind sizes) consumed by `build-graph.ts`, `layout.ts`, and `canvas-node.tsx`. The triple-sync (registry ↔ component ↔ `system_prompt.rs` authoring contract) is maintained.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (oklch tokens + `dark:`), `lucide-react`, `cn` from `@/lib/utils`, `@xyflow/react` + `@dagrejs/dagre` (canvas), Vitest + `@testing-library/react`. Backend prompt in Rust (`cargo test`).

---

## How the existing pieces work (read before starting)

- **Parser** (`src/features/plan-viewer/mdx/parse.ts`): `PlanBlock` component = `{ kind:"component"; id; name; props: Record<string,string>; rawText; childBlocks }`. `rawText` (verbatim inner source) is ALWAYS captured regardless of `childMode`; `childBlocks` is populated only for `"blocks"`/`"structured"`. So a `"raw"` sub-component (e.g. `Entity`) nested inside a `"structured"` parent (`DataModel`) arrives as a child block with its field lines in `rawText` and empty `childBlocks`.
- **Registry** (`src/features/plan-viewer/mdx/registry.tsx`): `PLAN_COMPONENTS` maps name → `{ render, childMode }`. It already has a `SubComponentFallback` (passthrough for sub-components authored standalone). Unknown names → `UnsupportedBlock`.
- **Dispatch** (`render-blocks.tsx`): `"structured"` → `<Cmp {...props} childBlocks={...} />`; `"blocks"` → `<Cmp {...props}>{renderBlocks(childBlocks)}</Cmp>`; `"raw"` → `<Cmp {...props}>{rawText}</Cmp>`. `renderBlocks` keys children by id and is imported by components at render time (safe cycle, per `canvas/canvas-node.tsx`).
- **Wave 1 foundation:** `components/shell/accent.ts` → `type PlanAccent` + `accentClasses()`; `components/shell/plan-block-shell.tsx` → `PlanBlockShell` ({ accent?, icon?: LucideIcon, title?, badge?, className?, bodyClassName?, children? }), adds `my-4`.
- **Canvas:** `canvas/build-graph.ts` turns `CanvasNode` child blocks into `{ id, type:"canvasNode", data: CanvasNodeData, position }`; `CanvasNodeData = { title; bodyBlocks }`. `canvas/layout.ts` runs dagre with fixed `NODE_W=220`/`NODE_H=96`. `canvas/canvas-node.tsx` renders each node at `w-[220px]`. `plan-canvas-surface.tsx` registers `nodeTypes = { canvasNode: CanvasNode }`.
- **Test cleanup:** this project's vitest config does NOT enable globals — every render-based test file MUST call `afterEach(cleanup)`.

## File Structure

- Create: `src/features/plan-viewer/components/wireframe/parse-wireframe.ts` — pure DSL parser → `WireframeNode[]`.
- Create: `src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts`
- Create: `src/features/plan-viewer/components/wireframe/index.tsx` — `Wireframe` renderer.
- Create: `src/features/plan-viewer/components/wireframe/wireframe.test.tsx`
- Create: `src/features/plan-viewer/components/multi-prototype.tsx` — `MultiPrototype` + `Variant` extraction (tabbed).
- Create: `src/features/plan-viewer/components/multi-prototype.test.tsx`
- Create: `src/features/plan-viewer/components/data-model.tsx` — `DataModel` + `Entity` field tables.
- Create: `src/features/plan-viewer/components/data-model.test.tsx`
- Create: `src/features/plan-viewer/components/canvas/node-kinds.ts` — `CanvasNodeKind`, `normalizeKind`, `NODE_SIZE`.
- Create: `src/features/plan-viewer/components/canvas/node-kinds.test.ts`
- Modify: `src/features/plan-viewer/components/canvas/build-graph.ts` — carry `kind` into `CanvasNodeData`.
- Modify: `src/features/plan-viewer/components/canvas/build-graph.test.ts` — assert kind.
- Modify: `src/features/plan-viewer/components/canvas/layout.ts` — per-kind sizing.
- Modify: `src/features/plan-viewer/components/canvas/canvas-node.tsx` — per-kind render.
- Modify: `src/features/plan-viewer/mdx/registry.tsx` — Wireframe, MultiPrototype/Variant, DataModel/Entity.
- Modify: `src-tauri/src/agents/system_prompt.rs` — authoring contract + tests.

---

### Task 1: Wireframe DSL parser (pure)

**Files:**
- Create: `src/features/plan-viewer/components/wireframe/parse-wireframe.ts`
- Test: `src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts
import { describe, expect, it } from "vitest";
import { parseWireframe } from "./parse-wireframe";

describe("parseWireframe", () => {
	it("nests children by indentation", () => {
		const src = ["col", "  text Welcome", "  input Email", "  button Sign in"].join(
			"\n",
		);
		const roots = parseWireframe(src);
		expect(roots).toHaveLength(1);
		expect(roots[0].type).toBe("col");
		expect(roots[0].children.map((c) => c.type)).toEqual([
			"text",
			"input",
			"button",
		]);
		expect(roots[0].children[0].label).toBe("Welcome");
	});

	it("parses a type with no label", () => {
		const roots = parseWireframe("divider");
		expect(roots[0]).toMatchObject({ type: "divider", label: "" });
	});

	it("skips blank lines and unknown element types", () => {
		const src = ["box Header", "", "frobnicate nope", "  text Inside"].join("\n");
		const roots = parseWireframe(src);
		expect(roots).toHaveLength(1);
		expect(roots[0].type).toBe("box");
		// the unknown 'frobnicate' line is dropped; its indented child reattaches
		// to the nearest valid ancestor (box).
		expect(roots[0].children.map((c) => c.type)).toEqual(["text"]);
	});

	it("returns an empty array for empty input", () => {
		expect(parseWireframe("   \n  ")).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-wireframe"`.

- [ ] **Step 3: Write the parser**

```ts
// src/features/plan-viewer/components/wireframe/parse-wireframe.ts

/** A node in a parsed wireframe mockup. Containers (`row`/`col`/`box`) hold
 * children; the rest are leaves. */
export type WireframeNode = {
	type:
		| "row"
		| "col"
		| "box"
		| "text"
		| "input"
		| "button"
		| "image"
		| "divider";
	label: string;
	children: WireframeNode[];
};

const TYPES = new Set([
	"row",
	"col",
	"box",
	"text",
	"input",
	"button",
	"image",
	"divider",
]);

/**
 * Parse the constrained wireframe line-DSL: one element per line, leading
 * whitespace = nesting depth, `<type> <label?>`. Unknown element types and
 * blank lines are skipped (their indented descendants reattach to the nearest
 * valid ancestor). Returns the forest of top-level nodes.
 */
export function parseWireframe(src: string): WireframeNode[] {
	const roots: WireframeNode[] = [];
	const stack: { indent: number; node: WireframeNode }[] = [];
	for (const raw of src.split(/\r?\n/)) {
		if (raw.trim().length === 0) {
			continue;
		}
		const indent = raw.length - raw.trimStart().length;
		const trimmed = raw.trim();
		const sp = trimmed.indexOf(" ");
		const type = (sp === -1 ? trimmed : trimmed.slice(0, sp)).toLowerCase();
		const label = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
		if (!TYPES.has(type)) {
			continue;
		}
		const node: WireframeNode = {
			type: type as WireframeNode["type"],
			label,
			children: [],
		};
		// Pop until the top of the stack is a strictly-shallower line: that's the
		// parent. Empty stack → this is a root.
		while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}
		if (stack.length === 0) {
			roots.push(node);
		} else {
			stack[stack.length - 1].node.children.push(node);
		}
		stack.push({ indent, node });
	}
	return roots;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/wireframe/parse-wireframe.ts src/features/plan-viewer/components/wireframe/parse-wireframe.test.ts
git commit -m "feat(plan): add wireframe DSL parser"
```

---

### Task 2: Wireframe renderer + registry

**Files:**
- Create: `src/features/plan-viewer/components/wireframe/index.tsx`
- Create: `src/features/plan-viewer/components/wireframe/wireframe.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/wireframe/wireframe.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../../mdx/parse";
import { renderBlocks } from "../../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Wireframe", () => {
	const src = [
		'<Wireframe label="Login">',
		"col",
		"  text Welcome back",
		"  input Email",
		"  button Sign in",
		"</Wireframe>",
	].join("\n");

	it("renders the label header and the mockup elements", () => {
		renderMdx(src);
		expect(screen.getByText("Login")).toBeInTheDocument();
		expect(screen.getByText("Welcome back")).toBeInTheDocument();
		expect(screen.getByText("Email")).toBeInTheDocument();
		expect(screen.getByText("Sign in")).toBeInTheDocument();
	});

	it("renders nothing when the body is empty", () => {
		const { container } = renderMdx(["<Wireframe>", "</Wireframe>"].join("\n"));
		expect(container.querySelector("section")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/wireframe/wireframe.test.tsx`
Expected: FAIL — `Wireframe` is unknown (renders `UnsupportedBlock`).

- [ ] **Step 3: Write the renderer**

```tsx
// src/features/plan-viewer/components/wireframe/index.tsx
import { ImageIcon, LayoutIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PlanBlockShell } from "../shell/plan-block-shell";
import { type WireframeNode, parseWireframe } from "./parse-wireframe";

function renderChildren(nodes: WireframeNode[]): ReactNode {
	return nodes.map((node, i) => (
		<WireframePiece key={`${node.type}-${i}-${node.label}`} node={node} />
	));
}

function WireframePiece({ node }: { node: WireframeNode }) {
	switch (node.type) {
		case "row":
			return (
				<div className="flex flex-wrap items-start gap-2">
					{renderChildren(node.children)}
				</div>
			);
		case "col":
			return (
				<div className="flex flex-col gap-2">{renderChildren(node.children)}</div>
			);
		case "box":
			return (
				<div className="rounded border border-border border-dashed p-2">
					{node.label ? (
						<div className="mb-1 text-micro text-muted-foreground">
							{node.label}
						</div>
					) : null}
					{renderChildren(node.children)}
				</div>
			);
		case "text":
			return <p className="text-small text-foreground">{node.label}</p>;
		case "input":
			return (
				<div className="rounded border border-border bg-muted/30 px-2 py-1 text-micro text-muted-foreground">
					{node.label || "Input"}
				</div>
			);
		case "button":
			return (
				<div className="inline-flex w-fit rounded bg-foreground/80 px-3 py-1 text-background text-micro">
					{node.label || "Button"}
				</div>
			);
		case "image":
			return (
				<div className="flex h-16 items-center justify-center gap-1 rounded border border-border bg-muted/30 text-micro text-muted-foreground">
					<ImageIcon className="size-4" />
					{node.label}
				</div>
			);
		case "divider":
			return <hr className="border-border" />;
	}
}

/**
 * `Wireframe` renders a static low-fidelity mockup from the wireframe line-DSL
 * (see {@link parseWireframe}). The optional `label` becomes the panel title.
 */
export function Wireframe({
	label,
	children = "",
}: {
	label?: string;
	children?: string;
}) {
	const nodes = parseWireframe(children);
	if (nodes.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={LayoutIcon} title={label || "Wireframe"}>
			<div className="flex flex-col gap-2">{renderChildren(nodes)}</div>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `Wireframe`**

In `src/features/plan-viewer/mdx/registry.tsx`: (a) add the import in alphabetical position:

```tsx
import { Wireframe } from "../components/wireframe";
```

(b) add to `PLAN_COMPONENTS`:

```tsx
	Wireframe: { render: Wireframe, childMode: "raw" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/wireframe/wireframe.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/wireframe/index.tsx src/features/plan-viewer/components/wireframe/wireframe.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add Wireframe mockup component"
```

---

### Task 3: MultiPrototype + Variant

**Files:**
- Create: `src/features/plan-viewer/components/multi-prototype.tsx`
- Create: `src/features/plan-viewer/components/multi-prototype.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/multi-prototype.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("MultiPrototype", () => {
	const src = [
		"<MultiPrototype>",
		'<Variant label="Compact" recommended>',
		"Compact layout body.",
		"</Variant>",
		'<Variant label="Spacious">',
		"Spacious layout body.",
		"</Variant>",
		"</MultiPrototype>",
	].join("\n");

	it("shows variant tabs and the first variant body initially", () => {
		renderMdx(src);
		expect(screen.getByRole("button", { name: /Compact/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Spacious/ })).toBeInTheDocument();
		expect(screen.getByText("Compact layout body.")).toBeInTheDocument();
		expect(screen.queryByText("Spacious layout body.")).toBeNull();
	});

	it("switches body when another variant tab is clicked", () => {
		renderMdx(src);
		fireEvent.click(screen.getByRole("button", { name: /Spacious/ }));
		expect(screen.getByText("Spacious layout body.")).toBeInTheDocument();
		expect(screen.queryByText("Compact layout body.")).toBeNull();
	});

	it("renders nothing when there are no Variant children", () => {
		const { container } = renderMdx(
			["<MultiPrototype>", "</MultiPrototype>"].join("\n"),
		);
		expect(container.querySelector("section")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/multi-prototype.test.tsx`
Expected: FAIL — `MultiPrototype` is unknown.

- [ ] **Step 3: Write the component**

```tsx
// src/features/plan-viewer/components/multi-prototype.tsx
import { LayersIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Variant = {
	id: string;
	label: string;
	recommended: boolean;
	body: PlanBlock[];
};

function extractVariants(childBlocks: PlanBlock[]): Variant[] {
	const variants: Variant[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Variant") {
			continue;
		}
		variants.push({
			id: block.id,
			label:
				block.props.label?.trim() ||
				block.props.name?.trim() ||
				`Variant ${variants.length + 1}`,
			recommended: block.props.recommended === "true",
			body: block.childBlocks,
		});
	}
	return variants;
}

/**
 * `MultiPrototype` compares 2–4 prototype `<Variant>`s in tabs, showing one at a
 * time. The variant marked `recommended` is starred.
 */
export function MultiPrototype({
	childBlocks = [],
}: {
	childBlocks?: PlanBlock[];
}) {
	const variants = extractVariants(childBlocks);
	const [active, setActive] = useState(0);
	if (variants.length === 0) {
		return null;
	}
	const current = variants[Math.min(active, variants.length - 1)];
	return (
		<PlanBlockShell accent="neutral" icon={LayersIcon} title="Prototypes">
			<div className="mb-3 flex flex-wrap gap-1">
				{variants.map((variant, i) => (
					<button
						key={variant.id}
						type="button"
						onClick={() => setActive(i)}
						className={cn(
							"cursor-pointer rounded border px-2 py-1 text-micro transition-colors",
							i === active
								? "border-ring bg-accent text-accent-foreground"
								: "border-border text-muted-foreground hover:bg-accent/50",
						)}
					>
						{variant.label}
						{variant.recommended ? " ★" : ""}
					</button>
				))}
			</div>
			<div>{renderBlocks(current.body)}</div>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `MultiPrototype` + `Variant`**

In `src/features/plan-viewer/mdx/registry.tsx`: (a) add the import (alphabetical):

```tsx
import { MultiPrototype } from "../components/multi-prototype";
```

(b) add to `PLAN_COMPONENTS`:

```tsx
	MultiPrototype: { render: MultiPrototype, childMode: "structured" },
	Variant: { render: SubComponentFallback, childMode: "blocks" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/multi-prototype.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/multi-prototype.tsx src/features/plan-viewer/components/multi-prototype.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add MultiPrototype variant comparison"
```

---

### Task 4: DataModel + Entity

**Files:**
- Create: `src/features/plan-viewer/components/data-model.tsx`
- Create: `src/features/plan-viewer/components/data-model.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/data-model.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("DataModel", () => {
	const src = [
		"<DataModel>",
		'<Entity name="User">',
		"id: string",
		"email: string",
		"</Entity>",
		'<Entity name="Post">',
		"title: string",
		"authorId: string",
		"</Entity>",
		"</DataModel>",
	].join("\n");

	it("renders each entity name and its fields", () => {
		renderMdx(src);
		expect(screen.getByText("Data model")).toBeInTheDocument();
		expect(screen.getByText("User")).toBeInTheDocument();
		expect(screen.getByText("Post")).toBeInTheDocument();
		expect(screen.getByText("email")).toBeInTheDocument();
		expect(screen.getByText("title")).toBeInTheDocument();
		expect(screen.getByText("authorId")).toBeInTheDocument();
	});

	it("renders nothing when there are no Entity children", () => {
		const { container } = renderMdx(["<DataModel>", "</DataModel>"].join("\n"));
		expect(container.querySelector("section")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/data-model.test.tsx`
Expected: FAIL — `DataModel` is unknown.

- [ ] **Step 3: Write the component**

```tsx
// src/features/plan-viewer/components/data-model.tsx
import { DatabaseIcon } from "lucide-react";
import type { PlanBlock } from "../mdx/parse";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Field = { name: string; type: string };
type Entity = { id: string; name: string; fields: Field[] };

/** Parse `name: type` lines (a line with no colon is a name-only field). */
function parseFields(text: string): Field[] {
	const fields: Field[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.length === 0) {
			continue;
		}
		const idx = line.indexOf(":");
		if (idx === -1) {
			fields.push({ name: line, type: "" });
			continue;
		}
		fields.push({ name: line.slice(0, idx).trim(), type: line.slice(idx + 1).trim() });
	}
	return fields;
}

function extractEntities(childBlocks: PlanBlock[]): Entity[] {
	const entities: Entity[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Entity") {
			continue;
		}
		entities.push({
			id: block.id,
			name: block.props.name?.trim() || "Entity",
			fields: parseFields(block.rawText),
		});
	}
	return entities;
}

/**
 * `DataModel` renders typed entity/schema tables. Each `<Entity name="...">`
 * holds `fieldName: type` lines.
 */
export function DataModel({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const entities = extractEntities(childBlocks);
	if (entities.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={DatabaseIcon} title="Data model">
			<div className="grid gap-3 sm:grid-cols-2">
				{entities.map((entity) => (
					<div
						key={entity.id}
						className="overflow-hidden rounded-md border border-border/70"
					>
						<div className="border-border/50 border-b bg-muted/30 px-3 py-1.5 font-medium text-small">
							{entity.name}
						</div>
						<ul className="divide-y divide-border/40">
							{entity.fields.map((field, i) => (
								<li
									key={`${field.name}-${i}`}
									className="flex items-center justify-between gap-3 px-3 py-1.5"
								>
									<span className="font-mono text-micro">{field.name}</span>
									<span className="font-mono text-micro text-muted-foreground">
										{field.type}
									</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `DataModel` + `Entity`**

In `src/features/plan-viewer/mdx/registry.tsx`: (a) add the import (alphabetical):

```tsx
import { DataModel } from "../components/data-model";
```

(b) add to `PLAN_COMPONENTS` — note `Entity` is `"raw"` so its field lines arrive as `rawText`:

```tsx
	DataModel: { render: DataModel, childMode: "structured" },
	Entity: { render: SubComponentFallback, childMode: "raw" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/data-model.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/data-model.tsx src/features/plan-viewer/components/data-model.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add DataModel/Entity schema component"
```

---

### Task 5: Canvas node kinds + variable sizing

**Files:**
- Create: `src/features/plan-viewer/components/canvas/node-kinds.ts`
- Create: `src/features/plan-viewer/components/canvas/node-kinds.test.ts`
- Modify: `src/features/plan-viewer/components/canvas/build-graph.ts`
- Modify: `src/features/plan-viewer/components/canvas/build-graph.test.ts`
- Modify: `src/features/plan-viewer/components/canvas/layout.ts`
- Modify: `src/features/plan-viewer/components/canvas/canvas-node.tsx`

- [ ] **Step 1: Write the failing test for `node-kinds.ts`**

```ts
// src/features/plan-viewer/components/canvas/node-kinds.test.ts
import { describe, expect, it } from "vitest";
import { NODE_SIZE, normalizeKind } from "./node-kinds";

describe("normalizeKind", () => {
	it("passes through a known kind", () => {
		expect(normalizeKind("resume")).toBe("resume");
	});

	it("defaults unknown or undefined to note", () => {
		expect(normalizeKind("bogus")).toBe("note");
		expect(normalizeKind(undefined)).toBe("note");
	});
});

describe("NODE_SIZE", () => {
	it("sizes every kind, with resume wider than note", () => {
		expect(NODE_SIZE.note.width).toBeGreaterThan(0);
		expect(NODE_SIZE.resume.width).toBeGreaterThan(NODE_SIZE.note.width);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/canvas/node-kinds.test.ts`
Expected: FAIL — `Failed to resolve import "./node-kinds"`.

- [ ] **Step 3: Write `node-kinds.ts`**

```ts
// src/features/plan-viewer/components/canvas/node-kinds.ts

/** The visual role of a canvas node, set via `<CanvasNode kind="...">`. */
export type CanvasNodeKind = "note" | "resume" | "option" | "phase" | "wireframe";

const KINDS = new Set<CanvasNodeKind>([
	"note",
	"resume",
	"option",
	"phase",
	"wireframe",
]);

/** Resolve a kind string to a known kind, defaulting to `note`. */
export function normalizeKind(value: string | undefined): CanvasNodeKind {
	return value && KINDS.has(value as CanvasNodeKind)
		? (value as CanvasNodeKind)
		: "note";
}

/** Per-kind nominal node size (used by dagre layout AND the rendered node so
 * they stay in sync). */
export const NODE_SIZE: Record<CanvasNodeKind, { width: number; height: number }> =
	{
		note: { width: 220, height: 96 },
		resume: { width: 300, height: 120 },
		option: { width: 230, height: 110 },
		phase: { width: 200, height: 90 },
		wireframe: { width: 260, height: 160 },
	};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/canvas/node-kinds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Carry `kind` through `build-graph.ts`**

Replace the top of `src/features/plan-viewer/components/canvas/build-graph.ts` — the import block and `CanvasNodeData` type — with:

```ts
import type { PlanBlock } from "../../mdx/parse";
import { type CanvasNodeKind, normalizeKind } from "./node-kinds";

/** Data carried on each React Flow node (rendered by canvas-node.tsx). */
export type CanvasNodeData = {
	title: string;
	bodyBlocks: PlanBlock[];
	kind?: CanvasNodeKind;
};
```

Then in the `for` loop that pushes nodes, change the `data` object to include `kind`:

```ts
		nodes.push({
			id,
			type: "canvasNode",
			data: {
				title: block.props.title?.trim() || id,
				bodyBlocks: block.childBlocks,
				kind: normalizeKind(block.props.kind),
			},
			position: { x: 0, y: 0 },
		});
```

- [ ] **Step 6: Add a kind test to `build-graph.test.ts`**

Append this `it` block inside the `describe("buildCanvasGraph", ...)` in `src/features/plan-viewer/components/canvas/build-graph.test.ts`:

```ts
	it("carries the node kind from props, defaulting to note", () => {
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", kind: "resume" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(nodes[0].data.kind).toBe("resume");
		expect(nodes[1].data.kind).toBe("note");
	});
```

- [ ] **Step 7: Make `layout.ts` size nodes per kind**

Replace the ENTIRE contents of `src/features/plan-viewer/components/canvas/layout.ts` with:

```ts
import dagre from "@dagrejs/dagre";
import type { CanvasGraph } from "./build-graph";
import { NODE_SIZE, normalizeKind } from "./node-kinds";

export type CanvasDirection = "TB" | "LR";

/** Position every node with dagre, sizing each by its kind. Pure: returns a new
 * graph; input untouched. */
export function layoutCanvasGraph(
	graph: CanvasGraph,
	direction: CanvasDirection,
): CanvasGraph {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 64 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of graph.nodes) {
		const size = NODE_SIZE[normalizeKind(node.data.kind)];
		g.setNode(node.id, { width: size.width, height: size.height });
	}
	for (const edge of graph.edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const nodes = graph.nodes.map((node) => {
		const pos = g.node(node.id);
		const size = NODE_SIZE[normalizeKind(node.data.kind)];
		// dagre returns the node center; React Flow wants the top-left corner.
		return {
			...node,
			position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
		};
	});

	return { nodes, edges: graph.edges };
}

export function parseDirection(value: string | undefined): CanvasDirection {
	return value === "LR" ? "LR" : "TB";
}
```

- [ ] **Step 8: Render per-kind in `canvas-node.tsx`**

Replace the ENTIRE contents of `src/features/plan-viewer/components/canvas/canvas-node.tsx` with:

```tsx
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { type PlanAccent, accentClasses } from "../shell/accent";
import { renderBlocks } from "../../render-blocks";
import type { CanvasNodeData } from "./build-graph";
import { type CanvasNodeKind, NODE_SIZE, normalizeKind } from "./node-kinds";

/** Accent per node kind, so a resume/option/phase/wireframe box reads
 * differently from a plain note. */
const KIND_ACCENT: Record<CanvasNodeKind, PlanAccent> = {
	note: "neutral",
	resume: "info",
	option: "success",
	phase: "warning",
	wireframe: "highlight",
};

/** A single card on the canvas. `data` comes from build-graph. */
export function CanvasNode({ data, selected }: NodeProps) {
	const d = data as unknown as CanvasNodeData;
	const kind = normalizeKind(d.kind);
	const styles = accentClasses(KIND_ACCENT[kind]);
	return (
		<div
			style={{ width: NODE_SIZE[kind].width }}
			className={cn(
				"max-h-[240px] overflow-hidden rounded-lg border bg-card shadow-sm transition-colors",
				styles.container,
				selected ? "border-ring ring-2 ring-ring" : "hover:border-ring/60",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-border" />
			<div
				className={cn(
					"border-b border-border/50 px-3 py-2 font-medium text-small",
					styles.header,
				)}
			>
				{d.title}
			</div>
			{d.bodyBlocks.length > 0 ? (
				<div className="max-h-[180px] overflow-auto px-3 py-2 text-micro text-muted-foreground">
					{renderBlocks(d.bodyBlocks)}
				</div>
			) : null}
			<Handle type="source" position={Position.Bottom} className="!bg-border" />
		</div>
	);
}
```

- [ ] **Step 9: Run the canvas tests + full plan-viewer suite**

Run: `bun x vitest run src/features/plan-viewer/components/canvas`
Expected: PASS — `node-kinds`, `build-graph` (incl. new kind test), `layout` (unchanged behavior for default-size nodes), and `plan-canvas` render tests.

Run: `bun x vitest run src/features/plan-viewer`
Expected: PASS — all suites.

- [ ] **Step 10: Commit**

```bash
git add src/features/plan-viewer/components/canvas/node-kinds.ts src/features/plan-viewer/components/canvas/node-kinds.test.ts src/features/plan-viewer/components/canvas/build-graph.ts src/features/plan-viewer/components/canvas/build-graph.test.ts src/features/plan-viewer/components/canvas/layout.ts src/features/plan-viewer/components/canvas/canvas-node.tsx
git commit -m "feat(plan): canvas node kinds + per-kind sizing"
```

---

### Task 6: Agent authoring contract (triple-sync)

**Files:**
- Modify: `src-tauri/src/agents/system_prompt.rs`

- [ ] **Step 1: Add the failing assertions to the contract test**

In `src-tauri/src/agents/system_prompt.rs`, inside `fn plan_mode_with_mdx_planning_injects_authoring_contract`, after the line `assert!(prompt.contains("Phase"));`, add:

```rust
        assert!(prompt.contains("Wireframe"));
        assert!(prompt.contains("MultiPrototype"));
        assert!(prompt.contains("Variant"));
        assert!(prompt.contains("DataModel"));
        assert!(prompt.contains("Entity"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --lib plan_mode_with_mdx_planning_injects_authoring_contract`
Expected: FAIL — the contract doesn't mention the Wave 3 components yet.

- [ ] **Step 3: Extend the `CanvasNode` bullet with `kind` and add three new bullets**

In `src-tauri/src/agents/system_prompt.rs`, in `MDX_PLAN_AUTHORING_BLOCK`:

(a) Append this sentence to the END of the existing `<CanvasNode ...>` bullet line (right after "CanvasNode is ONLY valid inside a PlanCanvas."):

```
 Optionally set `kind="note|resume|option|phase|wireframe"` to style a node by its role (e.g. a `resume` summary box or an `option` box).
```

(b) Then, immediately after the four Wave 2 bullets (the `<Timeline>` bullet) and BEFORE the line "Keep explanatory prose between the components...", insert these three lines (same `  - ` indentation):

```
  - `<Wireframe label="...">` whose contents are low-fidelity mockup lines — one element per line, leading-space indentation = nesting, from this fixed set: `row`/`col`/`box` (containers) and `text`/`input`/`button`/`image`/`divider` (elements), each optionally followed by a label (e.g. `button Sign in`). Use it to sketch a proposed UI.
  - `<MultiPrototype>` containing 2–4 `<Variant label="..." recommended>` … usually a single `<Wireframe>` … `</Variant>` children — compares prototype options as tabs; mark the preferred one `recommended`. `<Variant>` is ONLY valid inside a `<MultiPrototype>`.
  - `<DataModel>` containing `<Entity name="...">` … `fieldName: type` lines … `</Entity>` children — typed entity/schema tables. `<Entity>` is ONLY valid inside a `<DataModel>`.
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `cd src-tauri && cargo test --lib plan_mode_with_mdx_planning_injects_authoring_contract`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agents/system_prompt.rs
git commit -m "feat(plan): teach the agent the Wave 3 plan components"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full plan-viewer test folder**

Run: `bun x vitest run src/features/plan-viewer`
Expected: PASS — Waves 1+2 tests plus the new Wireframe/MultiPrototype/DataModel/canvas-kind tests.

- [ ] **Step 2: Typecheck the frontend**

Run: `bun run typecheck`
Expected: PASS — no TS errors. (`CanvasNodeData.kind` is optional, so the hand-built graphs in `layout.test.ts` still typecheck.)

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: PASS — biome clean (imports sorted, tabs) and clippy clean.

- [ ] **Step 4: Run the Rust contract tests**

Run: `cd src-tauri && cargo test --lib plan_mode`
Expected: PASS — all `plan_mode*` tests.

- [ ] **Step 5: Manual eyeball (recommended)**

In `bun run dev`, author a plan that uses `<Wireframe>`, `<MultiPrototype>` with two `<Variant>`s, `<DataModel>` with two `<Entity>`s, and a `<PlanCanvas>` with `<CanvasNode kind="resume">`/`kind="option">` boxes. Confirm: wireframe renders gray-box primitives; prototype tabs switch the shown variant; entity tables show field/type rows; canvas nodes vary in size/color by kind. No console errors.

---

## Self-Review

- **Spec coverage:** Implements the spec's Wave 3 set — `Wireframe` (Tasks 1–2), `MultiPrototype`/`Variant` (Task 3), `DataModel`/`Entity` (Task 4), and canvas node kinds + variable sizing (Task 5) — plus the triple-sync authoring contract (Task 6) and verification (Task 7). All built on the Wave 1 shell + accent system.
- **Placeholder scan:** No TBD/TODO; every code step has complete file contents or a complete, located edit; every command has an expected result.
- **Type consistency:** `WireframeNode` (Task 1) is consumed unchanged by the renderer (Task 2). `CanvasNodeKind`/`normalizeKind`/`NODE_SIZE` (Task 5 `node-kinds.ts`) are imported identically by `build-graph.ts`, `layout.ts`, and `canvas-node.tsx`. `CanvasNodeData.kind` is OPTIONAL so the existing `layout.test.ts`/`build-graph.test.ts` hand-built nodes (no `kind`) still typecheck and behave as `note`. Structured components (`MultiPrototype`, `DataModel`) take `{ childBlocks?: PlanBlock[] }` matching `render-blocks` dispatch; `Wireframe` takes `{ label?; children?: string }` matching `"raw"` dispatch. `Entity` is registered `"raw"` (its field lines arrive as `rawText`, which `DataModel` reads); `Variant` is `"blocks"` (its body arrives as `childBlocks`, which `MultiPrototype` renders).
- **Cross-cutting:** Every render-based test file includes `afterEach(cleanup)`. The `MultiPrototype` tab buttons carry `cursor-pointer` (per the repo's clickable-element rule). Canvas `kind` is backward-compatible: absent → `note` → the original 220×96 size and neutral styling, so existing canvas behavior is unchanged.
