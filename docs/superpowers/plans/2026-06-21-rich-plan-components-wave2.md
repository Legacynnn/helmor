# Rich Plan Components — Wave 2 (Decision-Support Components) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four decision-support components to the MDX plan vocabulary — `Decision` (weigh options), `BeforeAfter` (side-by-side comparison), `Diff` (unified code diff), and `Timeline` (phased milestones) — all built on the Wave 1 `PlanBlockShell` + accent system.

**Architecture:** Each component is a React component under `src/features/plan-viewer/components/` composing `PlanBlockShell`. `Decision`, `BeforeAfter`, and `Timeline` use the parser's `"structured"` child mode (like the existing `PlanCanvas`) and extract typed sub-components (`Option`, `Before`/`After`, `Phase`) from their parsed `childBlocks`; `Diff` uses `"raw"` mode (like `FileMap`) and parses unified-diff lines. The MDX parser, the component registry (`mdx/registry.tsx`), and the agent authoring contract (`MDX_PLAN_AUTHORING_BLOCK` in `src-tauri/src/agents/system_prompt.rs`) form a triple-sync: every component is added to all three.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (oklch semantic tokens + `dark:`), `lucide-react`, `cn` from `@/lib/utils` (twMerge-backed), Vitest + `@testing-library/react`. Backend prompt in Rust (`cargo test`).

---

## How the existing pieces work (read before starting)

- **Parser** (`src/features/plan-viewer/mdx/parse.ts`): produces `PlanBlock[]`. A component block is `{ kind: "component"; id; name; props: Record<string,string>; rawText; childBlocks: PlanBlock[] }`. `props` are strings; a valueless attribute like `recommended` becomes `"true"`. `childBlocks` is populated for components whose registry `childMode` is `"blocks"` or `"structured"`; for `"raw"` it is empty and the verbatim inner text is in `rawText` (delivered to the component as its `children` string).
- **Registry** (`src/features/plan-viewer/mdx/registry.tsx`): `PLAN_COMPONENTS` maps name → `{ render, childMode }`. This is the SOLE bridge from MDX name to UI and the source of truth for `childMode`. Unknown names render as `UnsupportedBlock`.
- **Dispatch** (`src/features/plan-viewer/render-blocks.tsx`): `renderBlock` passes `childBlocks={block.childBlocks}` for `"structured"`, `{renderBlocks(block.childBlocks)}` (rendered ReactNodes) for `"blocks"`, and `{block.rawText}` for `"raw"`. `renderBlocks(blocks)` keys each by `block.id`.
- **Pattern to copy** for structured components: `src/features/plan-viewer/components/canvas/build-graph.ts` extracts `CanvasNode` blocks from `childBlocks` by checking `block.kind === "component" && block.name === "CanvasNode"`. `canvas/canvas-node.tsx` imports `renderBlocks` from `"../../render-blocks"` and calls it at render time (the import cycle is safe because it's only invoked during render, not module init).
- **Wave 1 foundation** (already shipped): `components/shell/accent.ts` exports `type PlanAccent = "neutral"|"info"|"warning"|"danger"|"success"|"highlight"` and `accentClasses(accent?)` → `{ container, header, badge }`. `components/shell/plan-block-shell.tsx` exports `PlanBlockShell` with props `{ accent?, icon?: LucideIcon, title?, badge?, className?, bodyClassName?, children? }`. The shell adds `my-4`; pass `className="my-0"` to cancel it inside a grid (twMerge resolves the conflict).
- **Test cleanup:** this project's vitest config does NOT enable globals, so `@testing-library/react` auto-cleanup is not registered. Every new render-based test file MUST call `afterEach(cleanup)` or accumulated renders make `getByText` find duplicates.

## File Structure

- Create: `src/features/plan-viewer/components/decision.tsx` — `Decision` (structured), extracts `Option` children into pro/con cards.
- Create: `src/features/plan-viewer/components/decision.test.tsx`
- Create: `src/features/plan-viewer/components/before-after.tsx` — `BeforeAfter` (structured), extracts `Before`/`After`.
- Create: `src/features/plan-viewer/components/before-after.test.tsx`
- Create: `src/features/plan-viewer/components/diff-view.tsx` — `Diff` (raw), parses unified-diff lines.
- Create: `src/features/plan-viewer/components/diff-view.test.tsx`
- Create: `src/features/plan-viewer/components/timeline.tsx` — `Timeline` (structured), extracts `Phase` children.
- Create: `src/features/plan-viewer/components/timeline.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx` — add the 4 components + 4 sub-components (`Option`, `Before`, `After`, `Phase`) + one shared `SubComponentFallback`.
- Modify: `src-tauri/src/agents/system_prompt.rs` — add 4 bullets to `MDX_PLAN_AUTHORING_BLOCK` and 4 assertions to the contract test.

---

### Task 1: `Decision` + `Option`

**Files:**
- Create: `src/features/plan-viewer/components/decision.tsx`
- Create: `src/features/plan-viewer/components/decision.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/decision.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Decision", () => {
	const src = [
		"<Decision>",
		'<Option title="Use Postgres" recommended>',
		"Mature and relational.",
		"</Option>",
		'<Option title="Use SQLite">',
		"Simplest to embed.",
		"</Option>",
		"</Decision>",
	].join("\n");

	it("renders each option title and flags the recommended one", () => {
		renderMdx(src);
		expect(screen.getByText("Decision")).toBeInTheDocument();
		expect(screen.getByText("Use Postgres")).toBeInTheDocument();
		expect(screen.getByText("Use SQLite")).toBeInTheDocument();
		expect(screen.getByText("Recommended")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/decision.test.tsx`
Expected: FAIL — `Decision` is unknown, so it renders as `UnsupportedBlock` and the option titles are absent.

- [ ] **Step 3: Create the component**

```tsx
// src/features/plan-viewer/components/decision.tsx
import { ScaleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { accentClasses } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type DecisionOption = {
	id: string;
	title: string;
	recommended: boolean;
	body: PlanBlock[];
};

/** Pull `<Option>` blocks out of a Decision's parsed children. */
function extractOptions(childBlocks: PlanBlock[]): DecisionOption[] {
	const options: DecisionOption[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Option") {
			continue;
		}
		options.push({
			id: block.id,
			title: block.props.title?.trim() || "Option",
			recommended: block.props.recommended === "true",
			body: block.childBlocks,
		});
	}
	return options;
}

/**
 * `Decision` presents 2–4 candidate approaches as cards. The option marked
 * `recommended` is accent-highlighted with a badge. Authored as
 * `<Decision><Option title="..." recommended>…</Option>…</Decision>`.
 */
export function Decision({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const options = extractOptions(childBlocks);
	if (options.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={ScaleIcon} title="Decision">
			<div className="grid gap-3 sm:grid-cols-2">
				{options.map((option) => {
					const styles = accentClasses(
						option.recommended ? "success" : "neutral",
					);
					return (
						<div
							key={option.id}
							className={cn("rounded-md border p-3", styles.container)}
						>
							<div className="mb-1 flex items-center gap-2">
								<span className="font-medium text-small">{option.title}</span>
								{option.recommended ? (
									<span
										className={cn(
											"ml-auto rounded border px-1.5 py-0.5 text-micro uppercase",
											styles.badge,
										)}
									>
										Recommended
									</span>
								) : null}
							</div>
							<div className="text-small text-muted-foreground">
								{renderBlocks(option.body)}
							</div>
						</div>
					);
				})}
			</div>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `Decision` + `Option` + add the shared sub-component fallback**

In `src/features/plan-viewer/mdx/registry.tsx`:

(a) Add the import alongside the other component imports (keep imports alphabetically ordered to satisfy biome):

```tsx
import { Decision } from "../components/decision";
```

(b) Below the existing `CanvasNodeFallback` function, add the shared fallback:

```tsx
/** Sub-components (Option, Before, After, Phase) are consumed by their parent
 * (Decision / BeforeAfter / Timeline). Authored standalone, they just render
 * their body blocks so content is never lost. */
function SubComponentFallback({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}
```

(c) Add these entries to the `PLAN_COMPONENTS` object (after the `CanvasNode` entry):

```tsx
	Decision: { render: Decision, childMode: "structured" },
	Option: { render: SubComponentFallback, childMode: "blocks" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/decision.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/decision.tsx src/features/plan-viewer/components/decision.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add Decision/Option component"
```

---

### Task 2: `BeforeAfter` + `Before`/`After`

**Files:**
- Create: `src/features/plan-viewer/components/before-after.tsx`
- Create: `src/features/plan-viewer/components/before-after.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/before-after.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("BeforeAfter", () => {
	const src = [
		"<BeforeAfter>",
		"<Before>",
		"Old: one big canvas.",
		"</Before>",
		"<After>",
		"New: split canvas.",
		"</After>",
		"</BeforeAfter>",
	].join("\n");

	it("renders labeled Before and After panels", () => {
		renderMdx(src);
		expect(screen.getByText("Before")).toBeInTheDocument();
		expect(screen.getByText("After")).toBeInTheDocument();
		expect(screen.getByText("Old: one big canvas.")).toBeInTheDocument();
		expect(screen.getByText("New: split canvas.")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/before-after.test.tsx`
Expected: FAIL — `BeforeAfter` is unknown (renders `UnsupportedBlock`).

- [ ] **Step 3: Create the component**

```tsx
// src/features/plan-viewer/components/before-after.tsx
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { PlanBlockShell } from "./shell/plan-block-shell";

/** Return the parsed body blocks of the first child component named `name`. */
function childBody(childBlocks: PlanBlock[], name: string): PlanBlock[] {
	const block = childBlocks.find(
		(b) => b.kind === "component" && b.name === name,
	);
	return block && block.kind === "component" ? block.childBlocks : [];
}

/**
 * `BeforeAfter` shows a side-by-side comparison of current vs. proposed
 * behavior. Authored as
 * `<BeforeAfter><Before>…</Before><After>…</After></BeforeAfter>`.
 */
export function BeforeAfter({
	childBlocks = [],
}: {
	childBlocks?: PlanBlock[];
}) {
	const before = childBody(childBlocks, "Before");
	const after = childBody(childBlocks, "After");
	if (before.length === 0 && after.length === 0) {
		return null;
	}
	return (
		<div className="my-4 grid gap-3 sm:grid-cols-2">
			<PlanBlockShell accent="warning" title="Before" className="my-0">
				{renderBlocks(before)}
			</PlanBlockShell>
			<PlanBlockShell accent="success" title="After" className="my-0">
				{renderBlocks(after)}
			</PlanBlockShell>
		</div>
	);
}
```

- [ ] **Step 4: Register `BeforeAfter` + `Before` + `After`**

In `src/features/plan-viewer/mdx/registry.tsx`:

(a) Add the import (alphabetical order):

```tsx
import { BeforeAfter } from "../components/before-after";
```

(b) Add these entries to `PLAN_COMPONENTS`:

```tsx
	BeforeAfter: { render: BeforeAfter, childMode: "structured" },
	Before: { render: SubComponentFallback, childMode: "blocks" },
	After: { render: SubComponentFallback, childMode: "blocks" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/before-after.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/before-after.tsx src/features/plan-viewer/components/before-after.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add BeforeAfter comparison component"
```

---

### Task 3: `Diff`

**Files:**
- Create: `src/features/plan-viewer/components/diff-view.tsx`
- Create: `src/features/plan-viewer/components/diff-view.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/diff-view.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Diff", () => {
	const src = [
		'<Diff lang="ts">',
		"- const x = 1;",
		"+ const x = 2;",
		"  unchanged();",
		"</Diff>",
	].join("\n");

	it("renders the header label and the changed lines", () => {
		renderMdx(src);
		expect(screen.getByText("Diff · ts")).toBeInTheDocument();
		expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
		expect(screen.getByText(/const x = 2;/)).toBeInTheDocument();
		expect(screen.getByText(/unchanged\(\);/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/diff-view.test.tsx`
Expected: FAIL — `Diff` is unknown (renders `UnsupportedBlock`).

- [ ] **Step 3: Create the component**

```tsx
// src/features/plan-viewer/components/diff-view.tsx
import { GitCompareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanBlockShell } from "./shell/plan-block-shell";

type DiffKind = "add" | "remove" | "context";
type DiffLine = { kind: DiffKind; text: string };

const LINE_STYLES: Record<DiffKind, string> = {
	add: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	remove: "bg-red-500/10 text-red-700 dark:text-red-300",
	context: "text-muted-foreground",
};

const GUTTER: Record<DiffKind, string> = {
	add: "+",
	remove: "-",
	context: " ",
};

/** Parse unified-diff lines: leading `+`/`-` mark added/removed, anything else
 * is context (a single leading space, if present, is stripped). */
function parseDiff(text: string): DiffLine[] {
	const lines: DiffLine[] = [];
	for (const raw of text.split(/\r?\n/)) {
		if (raw.startsWith("+")) {
			lines.push({ kind: "add", text: raw.slice(1) });
		} else if (raw.startsWith("-")) {
			lines.push({ kind: "remove", text: raw.slice(1) });
		} else {
			lines.push({ kind: "context", text: raw.replace(/^ /, "") });
		}
	}
	return lines;
}

/**
 * `Diff` renders a unified code diff with add/remove gutters and coloring.
 * Authored as `<Diff lang="ts">` with `+`/`-`/space-prefixed lines as children.
 */
export function Diff({
	lang,
	children = "",
}: {
	lang?: string;
	children?: string;
}) {
	const lines = parseDiff(children);
	if (lines.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell
			accent="neutral"
			icon={GitCompareIcon}
			title={lang ? `Diff · ${lang}` : "Diff"}
			bodyClassName="p-0"
		>
			<pre className="overflow-x-auto py-1 font-mono text-micro leading-relaxed">
				{lines.map((line, i) => (
					<div
						key={`${i}-${line.text}`}
						className={cn("px-3", LINE_STYLES[line.kind])}
					>
						<span className="mr-2 select-none opacity-60">
							{GUTTER[line.kind]}
						</span>
						{line.text || " "}
					</div>
				))}
			</pre>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `Diff`**

In `src/features/plan-viewer/mdx/registry.tsx`:

(a) Add the import (alphabetical order):

```tsx
import { Diff } from "../components/diff-view";
```

(b) Add this entry to `PLAN_COMPONENTS`:

```tsx
	Diff: { render: Diff, childMode: "raw" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/diff-view.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/diff-view.tsx src/features/plan-viewer/components/diff-view.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add Diff unified-diff component"
```

---

### Task 4: `Timeline` + `Phase`

**Files:**
- Create: `src/features/plan-viewer/components/timeline.tsx`
- Create: `src/features/plan-viewer/components/timeline.test.tsx`
- Modify: `src/features/plan-viewer/mdx/registry.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/timeline.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlanMdx } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";

afterEach(cleanup);

function renderMdx(src: string) {
	const { blocks } = parsePlanMdx(src);
	return render(<>{renderBlocks(blocks)}</>);
}

describe("Timeline", () => {
	const src = [
		"<Timeline>",
		'<Phase title="Phase 1: Foundation" status="done">',
		"Shared shell.",
		"</Phase>",
		'<Phase title="Phase 2: Build" status="active">',
		"New components.",
		"</Phase>",
		"</Timeline>",
	].join("\n");

	it("renders the header and each phase title", () => {
		renderMdx(src);
		expect(screen.getByText("Timeline")).toBeInTheDocument();
		expect(screen.getByText("Phase 1: Foundation")).toBeInTheDocument();
		expect(screen.getByText("Phase 2: Build")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/timeline.test.tsx`
Expected: FAIL — `Timeline` is unknown (renders `UnsupportedBlock`).

- [ ] **Step 3: Create the component**

```tsx
// src/features/plan-viewer/components/timeline.tsx
import {
	CircleCheckIcon,
	CircleDotIcon,
	CircleIcon,
	MilestoneIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { type PlanAccent, accentClasses } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Status = "done" | "active" | "todo";

const STATUS: Record<
	Status,
	{ accent: PlanAccent; Icon: ComponentType<{ className?: string }> }
> = {
	done: { accent: "success", Icon: CircleCheckIcon },
	active: { accent: "info", Icon: CircleDotIcon },
	todo: { accent: "neutral", Icon: CircleIcon },
};

function normalizeStatus(value?: string): Status {
	if (value === "done" || value === "active" || value === "todo") {
		return value;
	}
	return "todo";
}

type TimelinePhase = {
	id: string;
	title: string;
	status: Status;
	body: PlanBlock[];
};

/** Pull `<Phase>` blocks out of a Timeline's parsed children. */
function extractPhases(childBlocks: PlanBlock[]): TimelinePhase[] {
	const phases: TimelinePhase[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Phase") {
			continue;
		}
		phases.push({
			id: block.id,
			title: block.props.title?.trim() || "Phase",
			status: normalizeStatus(block.props.status),
			body: block.childBlocks,
		});
	}
	return phases;
}

/**
 * `Timeline` renders a sequenced list of milestones. Each `<Phase>` carries an
 * optional `status` (`done` | `active` | `todo`) shown via a colored marker.
 * Authored as `<Timeline><Phase title="..." status="done">…</Phase>…</Timeline>`.
 */
export function Timeline({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const phases = extractPhases(childBlocks);
	if (phases.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={MilestoneIcon} title="Timeline">
			<ol className="flex flex-col gap-3">
				{phases.map((phase) => {
					const { accent, Icon } = STATUS[phase.status];
					const styles = accentClasses(accent);
					return (
						<li key={phase.id} className="flex gap-3">
							<Icon className={cn("mt-0.5 size-4 shrink-0", styles.header)} />
							<div className="min-w-0">
								<div className="font-medium text-small">{phase.title}</div>
								<div className="text-small text-muted-foreground">
									{renderBlocks(phase.body)}
								</div>
							</div>
						</li>
					);
				})}
			</ol>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Register `Timeline` + `Phase`**

In `src/features/plan-viewer/mdx/registry.tsx`:

(a) Add the import (alphabetical order):

```tsx
import { Timeline } from "../components/timeline";
```

(b) Add these entries to `PLAN_COMPONENTS`:

```tsx
	Timeline: { render: Timeline, childMode: "structured" },
	Phase: { render: SubComponentFallback, childMode: "blocks" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/timeline.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/plan-viewer/components/timeline.tsx src/features/plan-viewer/components/timeline.test.tsx src/features/plan-viewer/mdx/registry.tsx
git commit -m "feat(plan): add Timeline/Phase component"
```

---

### Task 5: Agent authoring contract (triple-sync)

**Files:**
- Modify: `src-tauri/src/agents/system_prompt.rs`

- [ ] **Step 1: Add the failing assertions to the contract test**

In `src-tauri/src/agents/system_prompt.rs`, inside `fn plan_mode_with_mdx_planning_injects_authoring_contract`, after the line `assert!(prompt.contains("CanvasNode"));`, add:

```rust
        assert!(prompt.contains("Decision"));
        assert!(prompt.contains("BeforeAfter"));
        assert!(prompt.contains("Diff"));
        assert!(prompt.contains("Timeline"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --lib plan_mode_with_mdx_planning_injects_authoring_contract`
Expected: FAIL — the authoring block does not yet mention `Decision`/`BeforeAfter`/`Diff`/`Timeline`.

- [ ] **Step 3: Add the four component bullets to `MDX_PLAN_AUTHORING_BLOCK`**

In `src-tauri/src/agents/system_prompt.rs`, in the `MDX_PLAN_AUTHORING_BLOCK` string, insert these four lines immediately AFTER the existing `<CanvasNode ...>` bullet line (the one ending "CanvasNode is ONLY valid inside a PlanCanvas.") and BEFORE the line "Keep explanatory prose between the components...":

```
  - `<Decision>` containing `<Option title="..." recommended>` … markdown pros/cons … `</Option>` children — present 2–4 candidate approaches as cards and mark the best one with the boolean `recommended` attribute. `<Option>` is ONLY valid inside a `<Decision>`.
  - `<BeforeAfter>` containing exactly one `<Before>` … markdown … `</Before>` and one `<After>` … markdown … `</After>` — a side-by-side comparison of current vs. proposed behavior. `<Before>`/`<After>` are ONLY valid inside a `<BeforeAfter>`.
  - `<Diff lang="...">` whose contents are unified-diff lines: each line starts with `+` (added line), `-` (removed line), or a space (unchanged context). Use it for concrete before/after code changes. `lang` is an optional language label.
  - `<Timeline>` containing `<Phase title="..." status="done|active|todo">` … markdown … `</Phase>` children — a sequenced list of milestones or phases. `<Phase>` is ONLY valid inside a `<Timeline>`.
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `cd src-tauri && cargo test --lib plan_mode_with_mdx_planning_injects_authoring_contract`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agents/system_prompt.rs
git commit -m "feat(plan): teach the agent the Wave 2 plan components"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full plan-viewer test folder**

Run: `bun x vitest run src/features/plan-viewer`
Expected: PASS — Wave 1 tests plus the 4 new component tests.

- [ ] **Step 2: Typecheck the frontend**

Run: `bun run typecheck`
Expected: PASS — no TS errors. (Watch for an unused-import error in `registry.tsx` if `ReactNode` was not already imported there — it is, via the existing `CanvasNodeFallback`.)

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: PASS — biome clean (imports sorted, tabs) and clippy clean (the Rust string/test change introduces no warnings).

- [ ] **Step 4: Run the Rust contract tests**

Run: `cd src-tauri && cargo test --lib plan_mode`
Expected: PASS — all three `plan_mode*` tests (the contract now includes the 4 new names, and the "omits contract" tests still pass because they only assert `RiskCard` is absent).

- [ ] **Step 5: Manual eyeball (recommended)**

In `bun run dev`, open or author a plan using `<Decision>`, `<BeforeAfter>`, `<Diff>`, and `<Timeline>`. Confirm: Decision shows option cards with the recommended one highlighted; BeforeAfter shows two side-by-side panels; Diff shows green/red gutters; Timeline shows status-colored phase markers. No console errors.

---

## Self-Review

- **Spec coverage:** Implements the spec's Wave 2 set — `Decision` (Task 1), `BeforeAfter` (Task 2), `Diff` (Task 3), `Timeline` (Task 4) — plus the triple-sync authoring contract (Task 5) and verification (Task 6). Each is built on the Wave 1 `PlanBlockShell` + accent system per the spec.
- **Placeholder scan:** No TBD/TODO; every code step has complete file contents or a complete, located edit; every command has an expected result.
- **Type consistency:** All structured components receive `{ childBlocks?: PlanBlock[] }` (matching how `render-blocks.tsx` dispatches `"structured"`); `Diff` receives `{ lang?: string; children?: string }` (matching `"raw"` dispatch). Sub-components (`Option`, `Before`, `After`, `Phase`) are registered `"blocks"` with the shared `SubComponentFallback`. `accentClasses`/`PlanAccent` and `PlanBlockShell` props match the Wave 1 foundation exactly. The registry `childMode` for each component matches what its component expects (`structured` → reads `childBlocks`; `raw` → reads `children` string).
- **Cross-cutting:** Every render-based test file includes `afterEach(cleanup)` (required by this project's vitest config). `BeforeAfter` cancels the shell's `my-4` with `className="my-0"` inside its grid (twMerge resolves it — confirmed `cn` is twMerge-backed).
