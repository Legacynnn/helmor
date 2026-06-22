# Rich Plan Components — Wave 1 (Shared Shell + Restyle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared visual language (`PlanBlockShell` + accent system) for plan components and migrate the five existing prose/raw components onto it, so the whole plan view looks cohesive and premium instead of a pile of inconsistent boxes.

**Architecture:** A new `components/shell/` folder holds one container primitive (`PlanBlockShell`) and one accent-to-Tailwind-classes map (`accent.ts`). Each existing component (`RiskCard`, `OpenQuestions`, `Steps`, `FileMap`, `AnnotatedCode`) is refactored to compose `PlanBlockShell` and source its colors from `accent.ts`. No MDX vocabulary, props, parser, registry, or agent-contract changes — this wave is purely the visual/internal foundation. Waves 2 (new decision-support components) and 3 (prototyping + canvas kinds) build on this shell in their own plans.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (oklch semantic tokens + `dark:` variants), `lucide-react` icons, `cn` from `@/lib/utils`, Vitest + `@testing-library/react` (jsdom).

---

## Scope & Non-Goals

- **In scope:** `shell/accent.ts`, `shell/plan-block-shell.tsx`, their tests, and refactors of the five existing components + extended render tests.
- **Out of scope (later waves):** any new component (`Wireframe`, `MultiPrototype`, `BeforeAfter`, `Decision`, `Diff`, `DataModel`, `Timeline`), canvas node `kind`s, registry/parser/`system_prompt.rs` edits.
- **Backwards compatibility:** the existing test `components/components.test.tsx` asserts `getByText("High risk")` / `getByText("Medium risk")` for `RiskCard`. These MUST keep passing after the refactor — the migrated `RiskCard` still renders those exact labels.

## File Structure

- Create: `src/features/plan-viewer/components/shell/accent.ts` — `PlanAccent` union + `accentClasses()` map (single source of plan colors).
- Create: `src/features/plan-viewer/components/shell/accent.test.ts` — unit tests for the map.
- Create: `src/features/plan-viewer/components/shell/plan-block-shell.tsx` — `PlanBlockShell` container primitive.
- Create: `src/features/plan-viewer/components/shell/plan-block-shell.test.tsx` — render tests.
- Modify: `src/features/plan-viewer/components/risk-card.tsx` — compose shell.
- Modify: `src/features/plan-viewer/components/open-questions.tsx` — compose shell.
- Modify: `src/features/plan-viewer/components/steps.tsx` — compose shell.
- Modify: `src/features/plan-viewer/components/file-map.tsx` — compose shell, source badge colors from `accent.ts`.
- Modify: `src/features/plan-viewer/components/annotated-code.tsx` — compose shell.
- Modify: `src/features/plan-viewer/components/components.test.tsx` — add header assertions for the migrated components.

---

### Task 1: Accent system (`accent.ts`)

**Files:**
- Create: `src/features/plan-viewer/components/shell/accent.ts`
- Test: `src/features/plan-viewer/components/shell/accent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/plan-viewer/components/shell/accent.test.ts
import { describe, expect, it } from "vitest";
import { accentClasses } from "./accent";

describe("accentClasses", () => {
	it("returns danger classes with red border + dark-mode header", () => {
		const danger = accentClasses("danger");
		expect(danger.container).toContain("border-red-500/45");
		expect(danger.header).toContain("text-red-600");
		expect(danger.header).toContain("dark:text-red-400");
		expect(danger.badge).toContain("text-red-600");
	});

	it("falls back to neutral for an unknown accent", () => {
		// @ts-expect-error intentionally passing an invalid accent
		expect(accentClasses("bogus")).toEqual(accentClasses("neutral"));
	});

	it("defaults to neutral when called with no argument", () => {
		expect(accentClasses()).toEqual(accentClasses("neutral"));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/shell/accent.test.ts`
Expected: FAIL — `Failed to resolve import "./accent"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/plan-viewer/components/shell/accent.ts

/**
 * Semantic accent for a plan block. The single source of truth for plan
 * component colors — every block (and inline badge) routes its border / header
 * text / chip color through {@link accentClasses} so the whole Plan view stays
 * visually consistent. Hues intentionally match the pre-shell components:
 * info=sky, warning=amber, danger=red, success=emerald, highlight=violet.
 */
export type PlanAccent =
	| "neutral"
	| "info"
	| "warning"
	| "danger"
	| "success"
	| "highlight";

export type AccentClasses = {
	/** Border + faint background for a block container. */
	container: string;
	/** Header label / icon color. */
	header: string;
	/** Inline chip (border + text) for small badges. */
	badge: string;
};

const ACCENTS: Record<PlanAccent, AccentClasses> = {
	neutral: {
		container: "border-border/70 bg-card",
		header: "text-foreground",
		badge: "border-border/70 text-muted-foreground",
	},
	info: {
		container: "border-sky-500/40 bg-sky-500/5",
		header: "text-sky-600 dark:text-sky-400",
		badge: "border-sky-500/40 text-sky-600 dark:text-sky-400",
	},
	warning: {
		container: "border-amber-500/40 bg-amber-500/5",
		header: "text-amber-600 dark:text-amber-400",
		badge: "border-amber-500/40 text-amber-600 dark:text-amber-400",
	},
	danger: {
		container: "border-red-500/45 bg-red-500/5",
		header: "text-red-600 dark:text-red-400",
		badge: "border-red-500/40 text-red-600 dark:text-red-400",
	},
	success: {
		container: "border-emerald-500/40 bg-emerald-500/5",
		header: "text-emerald-600 dark:text-emerald-400",
		badge: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
	},
	highlight: {
		container: "border-violet-500/40 bg-violet-500/5",
		header: "text-violet-600 dark:text-violet-400",
		badge: "border-violet-500/40 text-violet-600 dark:text-violet-400",
	},
};

/** Resolve Tailwind class strings for a semantic accent (defaults to neutral). */
export function accentClasses(accent: PlanAccent = "neutral"): AccentClasses {
	return ACCENTS[accent] ?? ACCENTS.neutral;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/shell/accent.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/shell/accent.ts src/features/plan-viewer/components/shell/accent.test.ts
git commit -m "feat(plan): add shared accent system for plan components"
```

---

### Task 2: Shell primitive (`PlanBlockShell`)

**Files:**
- Create: `src/features/plan-viewer/components/shell/plan-block-shell.tsx`
- Test: `src/features/plan-viewer/components/shell/plan-block-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/plan-viewer/components/shell/plan-block-shell.test.tsx
import { render, screen } from "@testing-library/react";
import { HelpCircleIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { PlanBlockShell } from "./plan-block-shell";

describe("PlanBlockShell", () => {
	it("renders a header row with title and body when title is given", () => {
		render(
			<PlanBlockShell title="Open questions" icon={HelpCircleIcon}>
				<p>body text</p>
			</PlanBlockShell>,
		);
		expect(screen.getByText("Open questions")).toBeInTheDocument();
		expect(screen.getByText("body text")).toBeInTheDocument();
	});

	it("applies the accent container classes", () => {
		const { container } = render(
			<PlanBlockShell accent="highlight" title="X">
				<span>y</span>
			</PlanBlockShell>,
		);
		const section = container.querySelector("section");
		expect(section?.className).toContain("border-violet-500/40");
	});

	it("renders no header row when no icon/title/badge are provided", () => {
		const { container } = render(
			<PlanBlockShell>
				<span>only body</span>
			</PlanBlockShell>,
		);
		// The only border-b element would be the header; with no header props
		// there should be none.
		expect(container.querySelector(".border-b")).toBeNull();
		expect(screen.getByText("only body")).toBeInTheDocument();
	});

	it("renders a trailing badge in the header", () => {
		render(
			<PlanBlockShell title="File changes" badge={<span>3</span>}>
				<span>body</span>
			</PlanBlockShell>,
		);
		expect(screen.getByText("3")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/shell/plan-block-shell.test.tsx`
Expected: FAIL — `Failed to resolve import "./plan-block-shell"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/plan-viewer/components/shell/plan-block-shell.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type PlanAccent, accentClasses } from "./accent";

export type PlanBlockShellProps = {
	/** Semantic accent driving border/header/background. Defaults to neutral. */
	accent?: PlanAccent;
	/** Optional leading header icon. */
	icon?: LucideIcon;
	/** Optional header title. When omitted (with no icon/badge) the header row
	 * is not rendered at all. */
	title?: ReactNode;
	/** Optional trailing chip pinned to the right of the header. */
	badge?: ReactNode;
	/** Extra classes for the outer <section>. */
	className?: string;
	/** Extra classes for the body wrapper (e.g. "p-0" for full-bleed lists). */
	bodyClassName?: string;
	children?: ReactNode;
};

/**
 * Shared container for every plan block. Provides a consistent rounded border,
 * an optional accent-colored header row (icon + title + trailing badge), and a
 * padded body. Components compose this instead of hand-rolling card markup so
 * the whole Plan view shares one visual language.
 */
export function PlanBlockShell({
	accent = "neutral",
	icon: Icon,
	title,
	badge,
	className,
	bodyClassName,
	children,
}: PlanBlockShellProps) {
	const styles = accentClasses(accent);
	const hasHeader = Icon != null || title != null || badge != null;

	return (
		<section
			className={cn(
				"my-4 overflow-hidden rounded-lg border",
				styles.container,
				className,
			)}
		>
			{hasHeader ? (
				<div
					className={cn(
						"flex items-center gap-2 border-b border-border/50 px-3 py-2 font-medium text-small",
						styles.header,
					)}
				>
					{Icon ? <Icon className="size-4 shrink-0" /> : null}
					{title != null ? <span>{title}</span> : null}
					{badge != null ? <span className="ml-auto">{badge}</span> : null}
				</div>
			) : null}
			<div className={cn("p-4", bodyClassName)}>{children}</div>
		</section>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/shell/plan-block-shell.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/shell/plan-block-shell.tsx src/features/plan-viewer/components/shell/plan-block-shell.test.tsx
git commit -m "feat(plan): add PlanBlockShell container primitive"
```

---

### Task 3: Migrate `RiskCard` onto the shell

**Files:**
- Modify: `src/features/plan-viewer/components/risk-card.tsx`

- [ ] **Step 1: Confirm the guard test exists and passes pre-refactor**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t RiskCard`
Expected: PASS (2 RiskCard tests) — this is the behavior we must preserve.

- [ ] **Step 2: Replace the implementation**

Replace the ENTIRE contents of `src/features/plan-viewer/components/risk-card.tsx` with:

```tsx
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanAccent } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Severity = "low" | "medium" | "high";

const SEVERITY: Record<Severity, { accent: PlanAccent; label: string }> = {
	low: { accent: "info", label: "Low risk" },
	medium: { accent: "warning", label: "Medium risk" },
	high: { accent: "danger", label: "High risk" },
};

function normalizeSeverity(value?: string): Severity {
	if (value === "low" || value === "medium" || value === "high") {
		return value;
	}
	return "medium";
}

export function RiskCard({
	severity,
	children,
}: {
	severity?: string;
	children?: ReactNode;
}) {
	const { accent, label } = SEVERITY[normalizeSeverity(severity)];
	return (
		<PlanBlockShell accent={accent} icon={AlertTriangleIcon} title={label}>
			{children}
		</PlanBlockShell>
	);
}
```

- [ ] **Step 3: Run the guard test to verify it still passes**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t RiskCard`
Expected: PASS — `High risk` and `Medium risk` still render.

- [ ] **Step 4: Commit**

```bash
git add src/features/plan-viewer/components/risk-card.tsx
git commit -m "refactor(plan): render RiskCard via PlanBlockShell"
```

---

### Task 4: Migrate `OpenQuestions` onto the shell

**Files:**
- Modify: `src/features/plan-viewer/components/open-questions.tsx`
- Test: `src/features/plan-viewer/components/components.test.tsx`

- [ ] **Step 1: Write the failing test (append to `components.test.tsx`)**

Add this block to `src/features/plan-viewer/components/components.test.tsx` (and add `import { OpenQuestions } from "./open-questions";` to the top import group):

```tsx
describe("OpenQuestions", () => {
	it("renders the header and its children", () => {
		render(
			<OpenQuestions>
				<p>What database should we use?</p>
			</OpenQuestions>,
		);
		expect(screen.getByText("Open questions")).toBeInTheDocument();
		expect(
			screen.getByText("What database should we use?"),
		).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t OpenQuestions`
Expected: PASS already (the pre-refactor component renders "Open questions"). This test pins the contract so the refactor can't regress it.

- [ ] **Step 3: Replace the implementation**

Replace the ENTIRE contents of `src/features/plan-viewer/components/open-questions.tsx` with:

```tsx
import { HelpCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `OpenQuestions` renders unresolved plan questions in a highlighted panel.
 * Children are rendered plan blocks (typically a markdown list).
 */
export function OpenQuestions({ children }: { children?: ReactNode }) {
	return (
		<PlanBlockShell
			accent="highlight"
			icon={HelpCircleIcon}
			title="Open questions"
		>
			{children}
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t OpenQuestions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/open-questions.tsx src/features/plan-viewer/components/components.test.tsx
git commit -m "refactor(plan): render OpenQuestions via PlanBlockShell"
```

---

### Task 5: Migrate `Steps` onto the shell

**Files:**
- Modify: `src/features/plan-viewer/components/steps.tsx`
- Test: `src/features/plan-viewer/components/components.test.tsx`

- [ ] **Step 1: Write the failing test (append to `components.test.tsx`)**

Add `import { Steps } from "./steps";` to the top import group, then add:

```tsx
describe("Steps", () => {
	it("renders a Steps header and forwards children", () => {
		render(
			<Steps>
				<ol>
					<li>First do this</li>
				</ol>
			</Steps>,
		);
		expect(screen.getByText("Steps")).toBeInTheDocument();
		expect(screen.getByText("First do this")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t Steps`
Expected: FAIL — the pre-refactor `Steps` has no "Steps" header text.

- [ ] **Step 3: Replace the implementation**

Replace the ENTIRE contents of `src/features/plan-viewer/components/steps.tsx` with:

```tsx
import { ListChecksIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `Steps` wraps step-by-step plan content. Children are rendered plan blocks;
 * for a simple step list, put a markdown ordered list inside `<Steps>`.
 */
export function Steps({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<PlanBlockShell
			accent="neutral"
			icon={ListChecksIcon}
			title="Steps"
			className={className}
		>
			{children}
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t Steps`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/steps.tsx src/features/plan-viewer/components/components.test.tsx
git commit -m "refactor(plan): render Steps via PlanBlockShell"
```

---

### Task 6: Migrate `FileMap` onto the shell (badge colors via accent)

**Files:**
- Modify: `src/features/plan-viewer/components/file-map.tsx`
- Test: `src/features/plan-viewer/components/components.test.tsx`

- [ ] **Step 1: Write the failing test (append to `components.test.tsx`)**

Add `import { FileMap } from "./file-map";` to the top import group, then add:

```tsx
describe("FileMap", () => {
	it("renders a header, count badge, and parsed entries", () => {
		render(
			<FileMap>{"create src/a.ts\nmodify src/b.ts"}</FileMap>,
		);
		expect(screen.getByText("File changes")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("src/a.ts")).toBeInTheDocument();
		expect(screen.getByText("src/b.ts")).toBeInTheDocument();
	});

	it("renders nothing when there are no valid entries", () => {
		const { container } = render(<FileMap>{"not a real line"}</FileMap>);
		expect(container.querySelector("section")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t FileMap`
Expected: FAIL — the pre-refactor `FileMap` has no "File changes" header or count badge.

- [ ] **Step 3: Replace the implementation**

Replace the ENTIRE contents of `src/features/plan-viewer/components/file-map.tsx` with:

```tsx
import { FilePlusIcon, FilesIcon, FileXIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type PlanAccent, accentClasses } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Action = "create" | "modify" | "delete";

type FileEntry = { action: Action; path: string };

const ACTION_META: Record<
	Action,
	{ label: string; accent: PlanAccent; Icon: typeof FilePlusIcon }
> = {
	create: { label: "create", accent: "success", Icon: FilePlusIcon },
	modify: { label: "modify", accent: "warning", Icon: PencilIcon },
	delete: { label: "delete", accent: "danger", Icon: FileXIcon },
};

function parseEntries(text: string): FileEntry[] {
	const entries: FileEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) {
			continue;
		}
		const match = /^(create|modify|delete)\s+(.+)$/i.exec(line);
		if (!match) {
			continue;
		}
		entries.push({
			action: match[1].toLowerCase() as Action,
			path: match[2].trim(),
		});
	}
	return entries;
}

/**
 * `FileMap` lists planned file changes. Children are raw lines of the form
 * `create|modify|delete <path>`. Rendered as a styled list inside the shared
 * shell, with per-line action badges colored via the shared accent system.
 */
export function FileMap({ children = "" }: { children?: string }) {
	const entries = parseEntries(children);
	if (entries.length === 0) {
		return null;
	}

	return (
		<PlanBlockShell
			accent="neutral"
			icon={FilesIcon}
			title="File changes"
			badge={
				<span className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-micro text-muted-foreground">
					{entries.length}
				</span>
			}
			bodyClassName="p-0"
		>
			<ul className="divide-y divide-border/60">
				{entries.map((entry, i) => {
					const meta = ACTION_META[entry.action];
					return (
						<li
							key={`${entry.action}-${entry.path}-${i}`}
							className="flex items-center gap-3 px-3 py-2"
						>
							<span
								className={cn(
									"flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-micro uppercase",
									accentClasses(meta.accent).badge,
								)}
							>
								<meta.Icon className="size-3" />
								{meta.label}
							</span>
							<span className="truncate font-mono text-small">
								{entry.path}
							</span>
						</li>
					);
				})}
			</ul>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t FileMap`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/file-map.tsx src/features/plan-viewer/components/components.test.tsx
git commit -m "refactor(plan): render FileMap via PlanBlockShell"
```

---

### Task 7: Migrate `AnnotatedCode` onto the shell

**Files:**
- Modify: `src/features/plan-viewer/components/annotated-code.tsx`
- Test: `src/features/plan-viewer/components/components.test.tsx`

- [ ] **Step 1: Write the failing test (append to `components.test.tsx`)**

Add `import { AnnotatedCode } from "./annotated-code";` to the top import group, then add:

```tsx
describe("AnnotatedCode", () => {
	it("renders the lang as the header title and the note", () => {
		render(
			<AnnotatedCode lang="ts" note="This wires the handler.">
				const x = 1;
			</AnnotatedCode>,
		);
		expect(screen.getByText("ts")).toBeInTheDocument();
		expect(screen.getByText("This wires the handler.")).toBeInTheDocument();
	});

	it("falls back to a 'Code' header when no lang is given", () => {
		render(<AnnotatedCode>const y = 2;</AnnotatedCode>);
		expect(screen.getByText("Code")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t AnnotatedCode`
Expected: FAIL — the pre-refactor component renders no "ts"/"Code" header.

- [ ] **Step 3: Replace the implementation**

Replace the ENTIRE contents of `src/features/plan-viewer/components/annotated-code.tsx` with:

```tsx
import { CodeIcon } from "lucide-react";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai/code-block";
import { PlanMarkdown } from "./plan-markdown";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `AnnotatedCode` renders a code block beside an explanatory note. The code
 * comes from the `code` prop or, failing that, from the component's children
 * text (the `code` prop wins). The optional `note` renders as markdown above
 * the code. The header shows `lang` (or "Code" when absent).
 */
export function AnnotatedCode({
	code,
	lang,
	note,
	children = "",
}: {
	code?: string;
	lang?: string;
	note?: string;
	children?: string;
}) {
	const source = (code ?? children).trim();
	const annotation = note?.trim();

	return (
		<PlanBlockShell
			accent="neutral"
			icon={CodeIcon}
			title={lang ?? "Code"}
			bodyClassName="p-3"
		>
			{annotation ? (
				<div className="mb-2 text-small text-muted-foreground">
					<PlanMarkdown>{annotation}</PlanMarkdown>
				</div>
			) : null}
			<CodeBlock code={source} language={lang}>
				<CodeBlockCopyButton />
			</CodeBlock>
		</PlanBlockShell>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/plan-viewer/components/components.test.tsx -t AnnotatedCode`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/plan-viewer/components/annotated-code.tsx src/features/plan-viewer/components/components.test.tsx
git commit -m "refactor(plan): render AnnotatedCode via PlanBlockShell"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full plan-viewer test folder**

Run: `bun x vitest run src/features/plan-viewer`
Expected: PASS — all existing parser/canvas/component tests plus the new shell + migration tests.

- [ ] **Step 2: Typecheck the frontend**

Run: `bun run typecheck`
Expected: PASS — no TS errors (zero unused imports left behind by the refactors).

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: PASS — biome clean (tab indent, sorted imports), clippy unaffected.

- [ ] **Step 4: Manual eyeball (optional but recommended)**

Open a plan in Helmor (`bun run dev`) that uses `RiskCard`, `Steps`, `FileMap`, `OpenQuestions`, and `AnnotatedCode`. Confirm each now has a consistent accent-colored header row, uniform spacing, and the same hues as before (sky/amber/red/violet). No console errors.

- [ ] **Step 5: Final commit (if any lint/format fixups were applied)**

```bash
git add -A
git commit -m "chore(plan): wave 1 shell migration lint/format fixups"
```

---

## Self-Review

- **Spec coverage:** Implements the spec's "Shared visual language" section (`PlanBlockShell` + `accent.ts` — Tasks 1–2) and "restyle the five existing components" goal (Tasks 3–7). The spec's new components, canvas kinds, parser/registry/`system_prompt.rs` edits, and testing for those are explicitly deferred to the Wave 2 and Wave 3 plans (per the spec's "One spec, three waves" decision and the Scope section above) — not gaps.
- **Placeholder scan:** No TBD/TODO; every code step contains complete file contents or a complete appended block; every command has an expected result.
- **Type consistency:** `PlanAccent` and `accentClasses()` (Task 1) are used identically in `PlanBlockShell` (Task 2), `RiskCard` (Task 3), and `FileMap` (Task 6). `PlanBlockShellProps` names (`accent`, `icon`, `title`, `badge`, `className`, `bodyClassName`) are used consistently across all migrations. The guard test's `getByText("High risk")` / `getByText("Medium risk")` strings match the labels in `RiskCard`'s `SEVERITY` map.
