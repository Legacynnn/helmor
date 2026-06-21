# Persistent Plan Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned `PlanLinkStrip` at the top of the chat thread that always links to the session's plan (title + Open button), reusing the existing open-plan event + Plan tab.

**Architecture:** A new helper `latestMdxPlanSlug(messages)` finds the most recent plan-review slug; a new presentational `PlanLinkStrip` reads it plus `usePlanList(sessionId)` to show the plan title and an Open button (dispatching `helmor:open-plan`). It's mounted as a non-scrolling sibling above the thread in `ActiveThreadViewport`. Frontend-only.

**Tech Stack:** React 19, TanStack Query (`usePlanList`), existing `plan-review.ts` + `dispatchOpenPlan`, Vitest + @testing-library/react, Tailwind tokens.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/plan-review.ts` | Add `latestMdxPlanSlug(messages)` (latest plan-review slug, no resolved constraint). |
| `src/lib/plan-review.test.ts` | Unit tests for `latestMdxPlanSlug`. |
| `src/features/panel/message-components/plan-link-strip.tsx` | New pinned strip component. |
| `src/features/panel/message-components/plan-link-strip.test.tsx` | Component test. |
| `src/features/panel/message-components/index.ts(x)` | Export `PlanLinkStrip` if the folder uses a barrel (verify). |
| `src/features/panel/thread-viewport.tsx` | Mount `PlanLinkStrip` above the thread; column layout. |

---

## Task 1: `latestMdxPlanSlug` helper

**Files:**
- Modify: `src/lib/plan-review.ts`
- Test: `src/lib/plan-review.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `src/lib/plan-review.test.ts` (reuse the file's existing imports; it already imports from `./plan-review` and `vitest`). Add `latestMdxPlanSlug` to the existing import from `./plan-review`:

```ts
describe("latestMdxPlanSlug", () => {
	const planMsg = (path: string): ThreadMessageLike => ({
		role: "assistant",
		content: [{ type: "plan-review", planFilePath: path } as never],
	});
	const userMsg = (): ThreadMessageLike => ({
		role: "user",
		content: [{ type: "text", text: "ok" } as never],
	});

	it("returns the latest plan-review slug even when a user message follows", () => {
		const messages = [planMsg(".helmor/plans/alpha.mdx"), userMsg()];
		expect(latestMdxPlanSlug(messages)).toBe("alpha");
	});

	it("returns the most recent of multiple plans", () => {
		const messages = [
			planMsg(".helmor/plans/alpha.mdx"),
			planMsg(".helmor/plans/beta.mdx"),
		];
		expect(latestMdxPlanSlug(messages)).toBe("beta");
	});

	it("returns null when there is no plan-review", () => {
		expect(latestMdxPlanSlug([userMsg()])).toBeNull();
	});

	it("returns null when the latest plan-review path is not an MDX plan", () => {
		expect(latestMdxPlanSlug([planMsg("/tmp/notes.txt")])).toBeNull();
	});
});
```

Note: `ThreadMessageLike` is already imported at the top of `plan-review.test.ts` (it's used by existing tests). If not, add `import type { ThreadMessageLike } from "./api";`. Verify by reading the test file's current imports first.

- [ ] **Step 2: Run to confirm failure.**

Run: `bun x vitest run src/lib/plan-review.test.ts -t "latestMdxPlanSlug"`
Expected: FAIL — `latestMdxPlanSlug` is not exported.

- [ ] **Step 3: Implement.** In `src/lib/plan-review.ts`, add after `latestUnresolvedMdxPlanSlug` (it mirrors that function minus the trailing-user-message check):

```ts
/** Slug of the latest MDX plan-review part (regardless of whether the user has
 *  replied since), or null when the latest plan-review is absent / not an MDX
 *  plan. Used by the persistent plan-link strip, which shows whenever a plan
 *  exists — not only while it is unresolved. */
export function latestMdxPlanSlug(
	messages: ThreadMessageLike[],
): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const planPart = messages[i].content?.find(
			(p) => p.type === "plan-review",
		) as { planFilePath?: string | null } | undefined;
		if (planPart) {
			return planSlugFromPath(planPart.planFilePath ?? null);
		}
	}
	return null;
}
```

- [ ] **Step 4: Run to confirm pass.**

Run: `bun x vitest run src/lib/plan-review.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/plan-review.ts src/lib/plan-review.test.ts
git commit -m "feat(plan-review): latestMdxPlanSlug helper for persistent plan link"
```

---

## Task 2: `PlanLinkStrip` component

**Files:**
- Create: `src/features/panel/message-components/plan-link-strip.tsx`
- Test: `src/features/panel/message-components/plan-link-strip.test.tsx`

First, READ these to match conventions exactly:
- `src/features/panel/message-components/content-parts.tsx` lines ~175-206 (the `PlanReviewCard` — copy its token palette + the `dispatchOpenPlan` usage + the `ClipboardList` icon import).
- `src/features/plan-viewer/use-plan.ts` (`usePlanList`).
- `src/lib/plan-review.ts` (`latestMdxPlanSlug`, `dispatchOpenPlan`).
- `src/lib/api.ts` `PlanSummary` type (`{ slug, title, status, path }`).

- [ ] **Step 1: Implement the component.**

Create `src/features/panel/message-components/plan-link-strip.tsx`:

```tsx
import { ClipboardList } from "lucide-react";
import { usePlanList } from "@/features/plan-viewer/use-plan";
import type { ThreadMessageLike } from "@/lib/api";
import { dispatchOpenPlan, latestMdxPlanSlug } from "@/lib/plan-review";

/**
 * Persistent, pinned link to the session's plan. Rendered at the top of the
 * chat thread (a non-scrolling sibling of the message scroll area) so the plan
 * is always one click away. Returns null when the session has no plan file.
 */
export function PlanLinkStrip({
	sessionId,
	messages,
}: {
	sessionId: string;
	messages: ThreadMessageLike[];
}) {
	const { data: plans } = usePlanList(sessionId);

	if (!plans || plans.length === 0) {
		return null;
	}

	// Prefer the plan the agent most recently produced (latest plan-review in the
	// loaded messages); fall back to the first listed plan when none is visible
	// (e.g. a reopened, paginated session).
	const latestSlug = latestMdxPlanSlug(messages);
	const featured =
		(latestSlug && plans.find((p) => p.slug === latestSlug)) || plans[0];
	if (!featured) {
		return null;
	}

	return (
		<div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 bg-background/60 px-4 py-2">
			<ClipboardList
				className="size-4 shrink-0 text-muted-foreground"
				strokeWidth={1.8}
			/>
			<span className="min-w-0 flex-1 truncate text-ui leading-5 text-foreground">
				{featured.title}
				{plans.length > 1 ? (
					<span className="ml-1.5 text-muted-foreground">
						· {plans.length} plans
					</span>
				) : null}
			</span>
			<button
				type="button"
				onClick={() => dispatchOpenPlan({ slug: featured.slug, sessionId })}
				className="shrink-0 cursor-pointer rounded-md border border-border/70 bg-background px-2.5 py-1 text-small font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
			>
				Open
			</button>
		</div>
	);
}
```

Note: confirm `text-ui`, `text-small` exist (used by `PlanReviewCard`); they do. If `usePlanList`'s import path differs, match the actual export.

- [ ] **Step 2: Write the component test.**

Create `src/features/panel/message-components/plan-link-strip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanSummary, ThreadMessageLike } from "@/lib/api";

const listPlansMock = vi.fn();
vi.mock("@/features/plan-viewer/use-plan", () => ({
	usePlanList: () => ({ data: listPlansMock() }),
}));

import { PlanLinkStrip } from "./plan-link-strip";

function summary(slug: string, title: string): PlanSummary {
	return { slug, title, status: "draft", path: `.helmor/plans/${slug}.mdx` };
}
function planMsg(path: string): ThreadMessageLike {
	return {
		role: "assistant",
		content: [{ type: "plan-review", planFilePath: path } as never],
	};
}

afterEach(() => {
	listPlansMock.mockReset();
});

describe("PlanLinkStrip", () => {
	it("renders the latest plan's title and dispatches open-plan on click", () => {
		listPlansMock.mockReturnValue([
			summary("alpha", "Alpha plan"),
			summary("beta", "Beta plan"),
		]);
		const events: CustomEvent[] = [];
		const handler = (e: Event) => events.push(e as CustomEvent);
		window.addEventListener("helmor:open-plan", handler);

		render(
			<PlanLinkStrip
				sessionId="s1"
				messages={[planMsg(".helmor/plans/beta.mdx")]}
			/>,
		);

		expect(screen.getByText("Beta plan")).toBeInTheDocument();
		expect(screen.getByText("· 2 plans")).toBeInTheDocument();
		screen.getByRole("button", { name: "Open" }).click();
		expect(events).toHaveLength(1);
		expect(events[0].detail).toEqual({ slug: "beta", sessionId: "s1" });

		window.removeEventListener("helmor:open-plan", handler);
	});

	it("renders nothing when the session has no plans", () => {
		listPlansMock.mockReturnValue([]);
		const { container } = render(
			<PlanLinkStrip sessionId="s1" messages={[]} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("falls back to the first plan when no plan-review is in the messages", () => {
		listPlansMock.mockReturnValue([summary("alpha", "Alpha plan")]);
		render(<PlanLinkStrip sessionId="s1" messages={[]} />);
		expect(screen.getByText("Alpha plan")).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run the test — confirm PASS.**

Run: `bun x vitest run src/features/panel/message-components/plan-link-strip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit.**

```bash
git add src/features/panel/message-components/plan-link-strip.tsx src/features/panel/message-components/plan-link-strip.test.tsx
git commit -m "feat(panel): PlanLinkStrip persistent plan link component"
```

---

## Task 3: Mount the strip in the thread viewport

**Files:**
- Modify: `src/features/panel/thread-viewport.tsx` (the `ActiveThreadViewport` function, ~lines 177-195)

- [ ] **Step 1: Add the import.** At the top of `thread-viewport.tsx`, add:

```ts
import { PlanLinkStrip } from "./message-components/plan-link-strip";
```
(If `message-components` exposes a barrel `index.ts(x)` that re-exports components, prefer adding `PlanLinkStrip` to that barrel and importing from `./message-components` to match the file's existing import style — verify which the file uses. The existing import is `from "./message-components"`. Add a re-export there if that barrel exists.)

- [ ] **Step 2: Restructure `ActiveThreadViewport`'s return to a column with the strip on top.** Replace:

```tsx
	return (
		<div
			ref={stackRef}
			className="relative flex min-h-0 flex-1 overflow-hidden"
		>
			<div className="relative z-10 flex min-h-0 min-w-0 flex-1">
				<ChatThread
					hasSession={hasSession}
					workspaceName={workspaceName}
					messages={pane.messages}
					missingScriptTypes={missingScriptTypes}
					onInitializeScript={onInitializeScript}
					paneWidth={paneWidth}
					sessionId={pane.sessionId}
					sending={pane.sending}
				/>
			</div>
		</div>
	);
```

with:

```tsx
	return (
		<div
			ref={stackRef}
			className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
		>
			<PlanLinkStrip sessionId={pane.sessionId} messages={pane.messages} />
			<div className="relative z-10 flex min-h-0 min-w-0 flex-1">
				<ChatThread
					hasSession={hasSession}
					workspaceName={workspaceName}
					messages={pane.messages}
					missingScriptTypes={missingScriptTypes}
					onInitializeScript={onInitializeScript}
					paneWidth={paneWidth}
					sessionId={pane.sessionId}
					sending={pane.sending}
				/>
			</div>
		</div>
	);
```

(The only changes: add `flex-col` to the wrapper, and add `<PlanLinkStrip>` as the first child. `stackRef` still measures `clientWidth`, which is unaffected.)

- [ ] **Step 3: Typecheck.**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the panel + plan-viewer test suites to confirm no regressions.**

Run: `bun x vitest run src/features/panel src/lib/plan-review.test.ts`
Expected: PASS (existing thread-viewport / panel tests unaffected; strip renders null in tests that have no plans).

- [ ] **Step 5: Commit.**

```bash
git add src/features/panel/thread-viewport.tsx src/features/panel/message-components/index.tsx
git commit -m "feat(panel): pin PlanLinkStrip above the chat thread"
```
(Only add `index.tsx` if you modified a barrel; otherwise omit it.)

---

## Task 4: Verification

- [ ] **Step 1: Frontend tests for touched areas.**

Run: `bun x vitest run src/lib/plan-review.test.ts src/features/panel`
Expected: PASS.

- [ ] **Step 2: Typecheck + biome.**

Run: `bun run typecheck && bun x biome check src/lib/plan-review.ts src/features/panel/message-components/plan-link-strip.tsx src/features/panel/thread-viewport.tsx`
Expected: clean.

- [ ] **Step 3: Manual smoke (human).** In `bun run dev`, with a session that has a plan: confirm a slim strip with the plan title + "Open" appears pinned at the top of the chat thread, stays put while scrolling messages, and clicking "Open" switches to the Plan tab. Confirm it does NOT appear for sessions with no plan, and is absent while the Plan tab itself is open.

---

## Notes / limitations

- The featured plan is the latest plan-review in the loaded message window, else the first
  listed plan. Multiple plans show a "· N plans" hint; switching between them uses the Plan
  tab's existing plan-tabs.
- No backend changes; relies on `usePlanList` (already invalidated live by the
  `planFileChanged` ui-sync event) so the strip appears/updates as the agent writes plans.
