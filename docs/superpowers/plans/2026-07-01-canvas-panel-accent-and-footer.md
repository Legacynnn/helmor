# Canvas Panel Accent Border + Per-Type Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each canvas panel a persistent per-type identity color (a thin accent bar framing the body) and a footer carrying type-appropriate info, with a rich custom footer for the conversation panel.

**Architecture:** Add a `PANEL_ACCENT` color map + helper (`chrome/panel-accent.ts`). Add a `PanelFooter` dispatcher (`chrome/panel-footer.tsx`) that mirrors the existing `PanelBody` switch, rendered by `PanelNode` right after the body. The conversation footer reads existing React Query hooks (`workspaceSessionsQueryOptions`, `activeStreamsQueryOptions`, `workspaceDetailQueryOptions`) via a pure model function that is unit-tested in isolation. Simpler footers derive from `parsePanelConfig` + workspace context. `PanelNode` recolors the header's bottom divider with the accent so the panel is framed top and bottom.

**Tech Stack:** React 19, `@xyflow/react`, TanStack React Query, `date-fns`, Tailwind v4 (oklch tokens), Vitest + jsdom + @testing-library/react.

---

## Design deviation from spec (flagged)

The spec listed one file per non-conversation footer under `chrome/footers/`. Seven near-trivial files are noise, so the simple footers (terminal, editor, files, git, notes, drawing, placeholder) are grouped into a single `chrome/footers/simple-footers.tsx`, each as a small exported component. The rich conversation footer keeps its own file. This honors "one responsibility per file" at the module level while avoiding fragmentation. Everything else follows the spec.

## Verified facts (do not re-discover)

- **Panel wrapper:** `src/features/canvas/panel-node.tsx`. `PanelNode` renders container (line ~156) → header (drag handle, `h-9`, `borderBottomColor` via color-mix at line ~135) → body div (line ~233). `PANEL_META` (lines 45-57) has an entry for every `CanvasPanelType`. `surface(token, alpha)` helper (lines 72-76) builds translucent fills; `headerAlpha = Math.max(alpha, 0.55)` (line 111).
- **Types:** `CanvasPanelType` from `@/lib/api`. Values: `placeholder, conversation, terminal, notes, drawing, file-manager, editor, git`.
- **Config:** `parsePanelConfig(raw)` from `src/features/canvas/panel-config.ts` returns `{ sessionId?, instanceId?, notes?, drawing?, filePath?, rootSubpath?, opacity?, binding? }`; returns `{}` on failure (safe to destructure).
- **Workspace context:** `useCanvasWorkspace()` from `src/features/canvas/canvas-workspace-context.tsx` → `{ workspaceId, repoId, workspaceRootPath, workspaceReady }`.
- **Session summaries:** `workspaceSessionsQueryOptions(workspaceId)` from `src/lib/query-client.ts` → `WorkspaceSessionSummary[]`. Fields used: `id`, `status`, `lastUserMessageAt`. Type in `src/lib/api.ts`.
- **Active streams:** `activeStreamsQueryOptions()` → `ActiveStreamSummary[]` (`{ sessionId, workspaceId, provider }`). Session is streaming iff an entry has matching `sessionId`.
- **Branch:** `workspaceDetailQueryOptions(workspaceId)` → `WorkspaceDetail` with `branch?: string | null`.
- **Relative time:** no shared util yet. `date-fns` `formatDistanceToNow` is used in `src/features/navigation/workspace-hover-card.tsx`. We add a shared `src/lib/relative-time.ts`.
- **Style reference:** chrome files use `cn()` from `@/lib/utils`, `lucide-react` icons, `text-app-muted-foreground`, `tabular-nums`, `truncate`.

---

## Task 1: Shared relative-time helper

**Files:**
- Create: `src/lib/relative-time.ts`
- Test: `src/lib/relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/relative-time.test.ts
import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
	it("returns null for nullish or invalid input", () => {
		expect(relativeTime(null)).toBeNull();
		expect(relativeTime(undefined)).toBeNull();
		expect(relativeTime("not-a-date")).toBeNull();
	});

	it("formats a past ISO timestamp with an 'ago' suffix", () => {
		const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
		const out = relativeTime(twoMinAgo);
		expect(out).toMatch(/ago$/);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/lib/relative-time.test.ts`
Expected: FAIL — cannot find module `./relative-time`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/relative-time.ts
import { formatDistanceToNow } from "date-fns";

/** Format an ISO timestamp as a relative "2 minutes ago" string.
 * Returns null for nullish or unparseable input so callers can omit the field. */
export function relativeTime(iso?: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return formatDistanceToNow(date, { addSuffix: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/lib/relative-time.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relative-time.ts src/lib/relative-time.test.ts
git commit -m "feat(canvas): add shared relativeTime helper"
```

---

## Task 2: Per-type accent color map

**Files:**
- Create: `src/features/canvas/chrome/panel-accent.ts`
- Test: `src/features/canvas/chrome/panel-accent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/canvas/chrome/panel-accent.test.ts
import { describe, expect, it } from "vitest";
import { PANEL_META } from "../panel-node";
import { accentDivider, PANEL_ACCENT } from "./panel-accent";

describe("PANEL_ACCENT", () => {
	it("defines a color for every panel type in PANEL_META", () => {
		for (const type of Object.keys(PANEL_META)) {
			expect(PANEL_ACCENT[type as keyof typeof PANEL_ACCENT]).toBeTruthy();
		}
	});

	it("accentDivider falls back to the placeholder color for unknown types", () => {
		// @ts-expect-error — intentionally passing an invalid type
		expect(accentDivider("bogus")).toBe(PANEL_ACCENT.placeholder);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/canvas/chrome/panel-accent.test.ts`
Expected: FAIL — cannot find module `./panel-accent`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/canvas/chrome/panel-accent.ts
import type { CanvasPanelType } from "@/lib/api";

/** Persistent per-type identity color, shown as the accent bar that frames a
 * panel's body (header bottom divider + footer top divider). Calm oklch chroma
 * so it reads as identity, not alarm, and stays legible on both the cream
 * (light) and near-black (dark) panel surfaces. Literals (not tokens) so they
 * resolve even before custom properties hot-load. */
export const PANEL_ACCENT: Record<CanvasPanelType, string> = {
	conversation: "oklch(0.62 0.14 250)", // blue
	git: "oklch(0.68 0.15 55)", // orange
	terminal: "oklch(0.66 0.14 150)", // green
	editor: "oklch(0.60 0.13 275)", // indigo
	"file-manager": "oklch(0.66 0.10 195)", // teal
	notes: "oklch(0.74 0.13 85)", // amber
	drawing: "oklch(0.62 0.15 310)", // violet
	placeholder: "oklch(0.62 0.02 260)", // neutral gray
};

/** Accent color for a panel type's divider bars. Falls back to the neutral
 * placeholder color for any unexpected type. */
export function accentDivider(type: CanvasPanelType): string {
	return PANEL_ACCENT[type] ?? PANEL_ACCENT.placeholder;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/canvas/chrome/panel-accent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/chrome/panel-accent.ts src/features/canvas/chrome/panel-accent.test.ts
git commit -m "feat(canvas): add per-type panel accent color map"
```

---

## Task 3: Conversation footer model (pure logic) + component

**Files:**
- Create: `src/features/canvas/chrome/footers/conversation-footer.tsx`
- Test: `src/features/canvas/chrome/footers/conversation-footer.test.ts`

The component reads live query data; the display logic is a pure function so it can be unit-tested without a QueryClient.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/canvas/chrome/footers/conversation-footer.test.ts
import { describe, expect, it } from "vitest";
import { conversationFooterModel } from "./conversation-footer";

describe("conversationFooterModel", () => {
	it("labels a streaming session as 'Streaming' regardless of stored status", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: true,
			lastUserMessageAt: null,
			branch: "main",
		});
		expect(m.statusLabel).toBe("Streaming");
		expect(m.streaming).toBe(true);
	});

	it("labels a non-streaming session as 'Idle' when status is idle", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: false,
			lastUserMessageAt: null,
			branch: null,
		});
		expect(m.statusLabel).toBe("Idle");
	});

	it("labels a working (non-idle) non-streaming session as 'Thinking'", () => {
		const m = conversationFooterModel({
			status: "running",
			streaming: false,
			lastUserMessageAt: null,
			branch: null,
		});
		expect(m.statusLabel).toBe("Thinking");
	});

	it("exposes a relative last-activity string when a timestamp exists", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: false,
			lastUserMessageAt: new Date(Date.now() - 60_000).toISOString(),
			branch: "main",
		});
		expect(m.lastActivity).toMatch(/ago$/);
		expect(m.branch).toBe("main");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/canvas/chrome/footers/conversation-footer.test.ts`
Expected: FAIL — cannot find module `./conversation-footer`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/canvas/chrome/footers/conversation-footer.tsx
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { relativeTime } from "@/lib/relative-time";
import {
	activeStreamsQueryOptions,
	workspaceDetailQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useCanvasWorkspace } from "../../canvas-workspace-context";

export type ConversationFooterInput = {
	status: string;
	streaming: boolean;
	lastUserMessageAt?: string | null;
	branch?: string | null;
};

export type ConversationFooterModel = {
	statusLabel: string;
	streaming: boolean;
	branch: string | null;
	lastActivity: string | null;
};

/** Pure display logic for the conversation footer. Streaming wins over the
 * stored status; a non-idle status without an active stream reads as
 * "Thinking". Kept separate from the component so it is unit-testable without a
 * QueryClient. */
export function conversationFooterModel(
	input: ConversationFooterInput,
): ConversationFooterModel {
	const streaming = input.streaming;
	let statusLabel: string;
	if (streaming) statusLabel = "Streaming";
	else if (input.status === "idle" || input.status === "")
		statusLabel = "Idle";
	else statusLabel = "Thinking";
	return {
		statusLabel,
		streaming,
		branch: input.branch ?? null,
		lastActivity: relativeTime(input.lastUserMessageAt),
	};
}

export function ConversationFooter({ sessionId }: { sessionId?: string }) {
	const { workspaceId } = useCanvasWorkspace();
	const sessions = useQuery(workspaceSessionsQueryOptions(workspaceId));
	const streams = useQuery(activeStreamsQueryOptions());
	const detail = useQuery(workspaceDetailQueryOptions(workspaceId));

	const session = sessionId
		? sessions.data?.find((s) => s.id === sessionId)
		: undefined;
	const streaming = sessionId
		? Boolean(streams.data?.some((s) => s.sessionId === sessionId))
		: false;

	const model = conversationFooterModel({
		status: session?.status ?? "",
		streaming,
		lastUserMessageAt: session?.lastUserMessageAt,
		branch: detail.data?.branch,
	});

	return (
		<>
			<span className="flex shrink-0 items-center gap-1">
				<span
					className={cn(
						"size-1.5 rounded-full",
						model.streaming
							? "animate-pulse bg-emerald-500"
							: model.statusLabel === "Thinking"
								? "bg-amber-500"
								: "bg-app-muted-foreground/50",
					)}
				/>
				<span className="tabular-nums leading-none">{model.statusLabel}</span>
			</span>
			{model.branch ? (
				<span className="flex min-w-0 items-center gap-1">
					<GitBranch className="size-2.5 shrink-0 opacity-70" />
					<span className="truncate">{model.branch}</span>
				</span>
			) : null}
			{model.lastActivity ? (
				<span className="ml-auto shrink-0 truncate opacity-70">
					{model.lastActivity}
				</span>
			) : null}
		</>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/canvas/chrome/footers/conversation-footer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/chrome/footers/conversation-footer.tsx src/features/canvas/chrome/footers/conversation-footer.test.ts
git commit -m "feat(canvas): add conversation panel footer with status/branch/activity"
```

---

## Task 4: Simple footers for the remaining panel types

**Files:**
- Create: `src/features/canvas/chrome/footers/simple-footers.tsx`

These derive from `parsePanelConfig` + workspace context only — no queries, no new plumbing. Each is a tiny presentational component.

- [ ] **Step 1: Write the implementation**

```tsx
// src/features/canvas/chrome/footers/simple-footers.tsx
import { GitBranch } from "lucide-react";
import type { PanelConfig } from "../../panel-config";
import { useCanvasWorkspace } from "../../canvas-workspace-context";

/** Trailing "· label" segment helper — keeps the footers visually consistent. */
function Muted({ children }: { children: React.ReactNode }) {
	return <span className="truncate opacity-70">{children}</span>;
}

export function TerminalFooter({ config }: { config: PanelConfig }) {
	const id = config.instanceId?.slice(0, 8);
	return (
		<>
			<span className="truncate font-medium">Terminal</span>
			{id ? <Muted>{id}</Muted> : null}
		</>
	);
}

export function EditorFooter({ config }: { config: PanelConfig }) {
	const path = config.filePath;
	if (!path) return <span className="truncate opacity-70">No file</span>;
	const name = path.split("/").pop() ?? path;
	const ext = name.includes(".") ? name.split(".").pop() : null;
	return (
		<>
			<span className="min-w-0 flex-1 truncate font-medium">{name}</span>
			{ext ? <Muted>{ext}</Muted> : null}
		</>
	);
}

export function FilesFooter({ config }: { config: PanelConfig }) {
	return (
		<span className="min-w-0 flex-1 truncate">
			<span className="font-medium">Files</span>
			<span className="opacity-70"> · {config.rootSubpath || "root"}</span>
		</span>
	);
}

export function GitFooter() {
	const branch = useGitBranch();
	return (
		<span className="flex min-w-0 items-center gap-1">
			<GitBranch className="size-2.5 shrink-0 opacity-70" />
			<span className="truncate">{branch ?? "Changes"}</span>
		</span>
	);
}

export function NotesFooter({ config }: { config: PanelConfig }) {
	const text = config.notes?.trim() ?? "";
	const words = text ? text.split(/\s+/).length : 0;
	return (
		<span className="truncate opacity-70">
			{words} {words === 1 ? "word" : "words"}
		</span>
	);
}

export function DrawingFooter({ config }: { config: PanelConfig }) {
	return (
		<span className="truncate opacity-70">
			{config.drawing ? "Drawing" : "Empty canvas"}
		</span>
	);
}

export function PlaceholderFooter({ label }: { label: string }) {
	return <span className="truncate opacity-70">{label}</span>;
}

/** Read the workspace branch without importing the query at every call site. */
function useGitBranch(): string | null {
	// Lazy import avoids a cyclic dep between chrome and query-client at module load.
	const { workspaceId } = useCanvasWorkspace();
	const { useQuery } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
	const { workspaceDetailQueryOptions } =
		require("@/lib/query-client") as typeof import("@/lib/query-client");
	const detail = useQuery(workspaceDetailQueryOptions(workspaceId));
	return detail.data?.branch ?? null;
}
```

> Note: if the `require(...)` form trips Biome or the bundler, replace `useGitBranch` with top-level `import { useQuery } from "@tanstack/react-query"` and `import { workspaceDetailQueryOptions } from "@/lib/query-client"` — there is no real cycle. Prefer the top-level imports; the lazy form is only a fallback. Use top-level imports by default:

```tsx
import { useQuery } from "@tanstack/react-query";
import { workspaceDetailQueryOptions } from "@/lib/query-client";
// ...
function useGitBranch(): string | null {
	const { workspaceId } = useCanvasWorkspace();
	const detail = useQuery(workspaceDetailQueryOptions(workspaceId));
	return detail.data?.branch ?? null;
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `bun run typecheck`
Expected: PASS (no errors). If `React` namespace is unresolved in `Muted`, add `import type { ReactNode } from "react";` and use `ReactNode`.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/chrome/footers/simple-footers.tsx
git commit -m "feat(canvas): add simple per-type panel footers"
```

---

## Task 5: Footer shell + dispatcher

**Files:**
- Create: `src/features/canvas/chrome/panel-footer.tsx`
- Test: `src/features/canvas/chrome/panel-footer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/canvas/chrome/panel-footer.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasWorkspaceProvider } from "../canvas-workspace-context";
import { PanelFooter } from "./panel-footer";

function wrap(ui: React.ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<CanvasWorkspaceProvider
				value={{
					workspaceId: "ws-1",
					repoId: null,
					workspaceRootPath: null,
					workspaceReady: true,
				}}
			>
				{ui}
			</CanvasWorkspaceProvider>
		</QueryClientProvider>,
	);
}

describe("PanelFooter", () => {
	it("renders the editor file name for an editor panel", () => {
		wrap(
			<PanelFooter
				panelType="editor"
				config={JSON.stringify({ filePath: "src/app/main.ts" })}
				accent="oklch(0.6 0.13 275)"
				background="#111"
			/>,
		);
		expect(screen.getByText("main.ts")).toBeInTheDocument();
	});

	it("renders a notes word count for a notes panel", () => {
		wrap(
			<PanelFooter
				panelType="notes"
				config={JSON.stringify({ notes: "hello world foo" })}
				accent="oklch(0.74 0.13 85)"
				background="#111"
			/>,
		);
		expect(screen.getByText("3 words")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/canvas/chrome/panel-footer.test.tsx`
Expected: FAIL — cannot find module `./panel-footer`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/canvas/chrome/panel-footer.tsx
import type { CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parsePanelConfig } from "../panel-config";
import { PANEL_META } from "../panel-node";
import { ConversationFooter } from "./footers/conversation-footer";
import {
	DrawingFooter,
	EditorFooter,
	FilesFooter,
	GitFooter,
	NotesFooter,
	PlaceholderFooter,
	TerminalFooter,
} from "./footers/simple-footers";

/** Per-type footer strip rendered by `PanelNode` beneath the body. Shares one
 * shell (height, type scale, muted tone, accent top divider, translucent
 * background) and dispatches its content by panel type — mirroring `PanelBody`.
 * `nodrag` so footer controls never start a panel move. */
export function PanelFooter({
	panelType,
	config,
	accent,
	background,
}: {
	panelType: CanvasPanelType;
	config: string;
	accent: string;
	background: string;
}) {
	return (
		<div
			className={cn(
				"nodrag flex h-6 shrink-0 items-center gap-2 overflow-hidden border-t px-2.5",
				"text-[11px] text-app-muted-foreground leading-none",
			)}
			style={{ backgroundColor: background, borderTopColor: accent }}
		>
			<FooterBody panelType={panelType} config={config} />
		</div>
	);
}

function FooterBody({
	panelType,
	config: raw,
}: {
	panelType: CanvasPanelType;
	config: string;
}) {
	const config = parsePanelConfig(raw);
	switch (panelType) {
		case "conversation":
			return <ConversationFooter sessionId={config.sessionId} />;
		case "terminal":
			return <TerminalFooter config={config} />;
		case "editor":
			return <EditorFooter config={config} />;
		case "file-manager":
			return <FilesFooter config={config} />;
		case "git":
			return <GitFooter />;
		case "notes":
			return <NotesFooter config={config} />;
		case "drawing":
			return <DrawingFooter config={config} />;
		default:
			return (
				<PlaceholderFooter
					label={(PANEL_META[panelType] ?? PANEL_META.placeholder).label}
				/>
			);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/canvas/chrome/panel-footer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/chrome/panel-footer.tsx src/features/canvas/chrome/panel-footer.test.tsx
git commit -m "feat(canvas): add panel footer shell + per-type dispatcher"
```

---

## Task 6: Wire accent divider + footer into PanelNode

**Files:**
- Modify: `src/features/canvas/panel-node.tsx` (header `borderBottomColor` ~line 135; add footer render after body div ~line 247)

- [ ] **Step 1: Import the accent helper + footer**

Add to the import block near the other `./` imports (after the `PanelConnections` import, line ~27):

```tsx
import { accentDivider } from "./chrome/panel-accent";
import { PanelFooter } from "./chrome/panel-footer";
```

- [ ] **Step 2: Compute accent + footer background in the component body**

Inside `PanelNode`, right after `const headerAlpha = Math.max(alpha, 0.55);` (line ~111), add:

```tsx
	// Per-type identity color for the framing accent bars (header underline +
	// footer top divider). Persistent — shown regardless of focus.
	const accent = accentDivider(data.panelType);
	// Footer shares the header's surface + legibility floor so it never dissolves
	// on own-surface (conversation/terminal) panels.
	const footerBg = surface("--canvas-pane-header-bg", headerAlpha);
```

- [ ] **Step 3: Recolor the header's bottom divider with the accent**

In the `header` JSX (line ~135), replace:

```tsx
					borderBottomColor:
						"color-mix(in srgb, var(--canvas-pane-header-bg, #fff) 70%, currentColor 30%)",
```

with:

```tsx
					borderBottomColor: accent,
```

- [ ] **Step 4: Render the footer after the body div**

Immediately after the body `</div>` (the block that closes at line ~247, after `<PanelErrorBoundary>…</PanelErrorBoundary></div>`) and before the container's closing `</div>` (line ~248), add:

```tsx
			<PanelFooter
				panelType={data.panelType}
				config={data.config}
				accent={accent}
				background={footerBg}
			/>
```

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck`
Expected: PASS.

Run: `bun x biome check src/features/canvas`
Expected: PASS (no errors). Run `bun x biome check --write src/features/canvas` if only formatting differs.

- [ ] **Step 6: Run the full canvas test suite**

Run: `bun x vitest run src/features/canvas src/lib/relative-time.test.ts`
Expected: PASS — all new tests plus existing canvas tests green.

- [ ] **Step 7: Commit**

```bash
git add src/features/canvas/panel-node.tsx
git commit -m "feat(canvas): frame panels with per-type accent bar + footer"
```

---

## Task 7: Full verification

- [ ] **Step 1: Typecheck (frontend + sidecar)**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: PASS (biome + clippy). Only frontend changed, so clippy is a no-op but must stay green.

- [ ] **Step 3: Frontend tests**

Run: `bun run test:frontend`
Expected: PASS — no regressions.

- [ ] **Step 4: Visual smoke check (manual, via Tauri MCP)**

With `bun run dev` running, open the canvas, add one panel of each type, and confirm: each panel shows the accent bar on the header underline + footer top divider in its type color; the conversation footer shows a status pill, branch, and last-activity; footers stay legible when the translucency slider is lowered.

- [ ] **Step 5: Changeset**

Create `.changeset/canvas-panel-footer.md`:

```md
---
"helmor": minor
---

Canvas panels now carry a per-type identity color and a footer. Each panel is framed by a thin accent bar (header underline + footer divider) colored by its type, and shows type-appropriate info in the footer — the conversation panel gets a custom footer with live status, git branch, and last activity.
```

Run: `git add .changeset/canvas-panel-footer.md && git commit -m "chore: changeset for canvas panel accent + footer"`

---

## Self-review notes

- **Spec coverage:** accent map (Task 2) ✓; accent-as-divider framing (Task 6) ✓; footer on every type (Tasks 3-5) ✓; rich conversation footer with status+streaming, branch, last activity (Task 3) ✓; no backend/pipeline changes ✓; tests for accent completeness, conversation formatting, per-type routing (Tasks 2,3,5) ✓.
- **Deviation:** simple footers grouped into one file (flagged at top) — approved refinement of the spec's per-file listing.
- **Type consistency:** `PanelFooter` props (`panelType`, `config`, `accent`, `background`) are identical in the component (Task 5) and the call site (Task 6). `conversationFooterModel` input/output shapes match between test and impl (Task 3). `accentDivider`/`PANEL_ACCENT` names match across Tasks 2 and 6.
- **No new IPC / persistence / schema / pipeline changes**, so no Rust snapshot tests are required (confirmed against CLAUDE.md's snapshot-coverage rule).
