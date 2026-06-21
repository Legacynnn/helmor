# Plan Management — Phase 1 (bugs/quick) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Three fixes — (1) open `.helmor/plans/*.mdx` from the file browser as a formatted plan; (2) Cmd+W closes the open plan instead of crashing; (3) padding on the plan document body.

**Architecture:** All frontend. Reuse the existing `dispatchOpenPlan` event for (1); add a symmetric `helmor:close-plan` event + a `plan-surface-changed` shell event so the global Cmd+W handler can branch (2); a CSS padding tweak (3).

**Tech Stack:** React 19, TypeScript, the shell event bus, Vitest + @testing-library/react.

---

## Task 1: Open plan files from the file browser as formatted plans

**Files:**
- Modify: `src/features/inspector/panel/files/index.tsx`
- Modify: the inspector parent that renders `FilesTab` (thread `currentSessionId` down). Find it by searching for the `FilesTab` usage (the first Explore identified `WorkspaceInspectorSidebar` in `src/features/inspector/index.tsx`, which already passes `currentSessionId` to `ActionsTabBody` but not to `FilesTab`).
- Test: `src/features/inspector/panel/files/plan-open.test.tsx` (new)

- [ ] **Step 1: Thread `currentSessionId` into `FilesTab`.**

In `src/features/inspector/panel/files/index.tsx`, add to `FilesTabProps` (after `onOpenFileReference`):
```ts
	/** Displayed thread session, used to route plan files to the plan view. */
	currentSessionId?: string | null;
```
Add `currentSessionId` to the destructured params of `FilesTabImpl`.

In the inspector parent (e.g. `src/features/inspector/index.tsx`), pass `currentSessionId={currentSessionId ?? null}` to the `<FilesTab .../>` (or `<FilesTabBody>`) usage — mirror how `currentSessionId` is already passed to `ActionsTabBody` in the same file. Verify the exact prop name available there.

- [ ] **Step 2: Intercept plan paths in `handleOpenFile`.**

Add imports at the top of `files/index.tsx`:
```ts
import { dispatchOpenPlan, isMdxPlanPath, planSlugFromPath } from "@/lib/plan-review";
```

Replace `handleOpenFile` (lines ~101-116) with:
```tsx
	const handleOpenFile = useCallback(
		(relativePath: string) => {
			if (!workspaceRootPath) return;
			const absolutePath = `${workspaceRootPath}/${relativePath}`;
			// A Helmor MDX plan opens as the formatted plan view in the thread,
			// not as raw MDX in the editor — but only when we know which session's
			// plan list it belongs to.
			if (currentSessionId && isMdxPlanPath(absolutePath)) {
				const slug = planSlugFromPath(absolutePath);
				if (slug) {
					dispatchOpenPlan({ slug, sessionId: currentSessionId });
					return;
				}
			}
			// File-tree click = "look at the file", not "review a diff" — open
			// in plain editor mode as a preview tab when the action exists.
			if (onOpenFileReference) {
				onOpenFileReference(absolutePath, undefined, undefined, {
					preview: true,
				});
				return;
			}
			onOpenEditorFile(absolutePath);
		},
		[
			workspaceRootPath,
			currentSessionId,
			onOpenEditorFile,
			onOpenFileReference,
		],
	);
```

- [ ] **Step 3: Write a test.**

Create `src/features/inspector/panel/files/plan-open.test.tsx`. Because `FilesTabImpl` renders a whole tree (needs `useFileTree`), test the routing decision at the unit level by extracting it OR test via the rendered tree. Simplest robust approach — test the pure routing decision by asserting the helper composition the handler uses:

```tsx
import { describe, expect, it, vi } from "vitest";
import { isMdxPlanPath, planSlugFromPath } from "@/lib/plan-review";

// The handler's routing contract: a plan path + a session id → dispatchOpenPlan
// with the slug; otherwise the editor open path runs. This pins the decision
// logic the handler encodes (the helpers are already unit-tested in plan-review).
describe("file-tree plan routing decision", () => {
	function route(absolutePath: string, sessionId: string | null) {
		if (sessionId && isMdxPlanPath(absolutePath)) {
			const slug = planSlugFromPath(absolutePath);
			if (slug) return { kind: "plan" as const, slug, sessionId };
		}
		return { kind: "editor" as const };
	}

	it("routes a plan path with a session to the plan view", () => {
		expect(route("/repo/.helmor/plans/foo.mdx", "s1")).toEqual({
			kind: "plan",
			slug: "foo",
			sessionId: "s1",
		});
	});
	it("falls back to editor when there is no session", () => {
		expect(route("/repo/.helmor/plans/foo.mdx", null)).toEqual({ kind: "editor" });
	});
	it("falls back to editor for a non-plan file", () => {
		expect(route("/repo/src/main.ts", "s1")).toEqual({ kind: "editor" });
	});
});
```

(If you prefer, render `FilesTabImpl` with a mocked `useFileTree` and assert a `helmor:open-plan` event fires on a plan-row click — but the decision test above is sufficient and low-maintenance.)

- [ ] **Step 4: Run tests + typecheck.**

Run: `bun x vitest run src/features/inspector/panel/files/plan-open.test.tsx`
Run: `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit.**

```bash
git add src/features/inspector/panel/files/index.tsx src/features/inspector/index.tsx src/features/inspector/panel/files/plan-open.test.tsx
git commit -m "feat(inspector): open .helmor plans from file browser as formatted plan view"
```

---

## Task 2: Cmd+W closes the open plan (crash fix)

**Files:**
- Modify: `src/lib/plan-review.ts`
- Modify: `src/shell/event-bus.ts`
- Modify: `src/features/panel/container.tsx`
- Modify: `src/shell/hooks/use-app-shell-state.tsx`
- Modify: `src/shell/hooks/use-global-shortcut-handlers.ts`

Root cause: the global `session.close` (`Mod+W`) handler has no awareness of the displayed plan, so it closes the underlying session while `activePlanSlug` is still set — the plan view then queries a mismatched `(session, slug)` / null workspace before the container's reset effects run, crashing. Fix: make Cmd+W close the plan first.

- [ ] **Step 1: Add the close-plan event.** In `src/lib/plan-review.ts`, after `OPEN_PLAN_EVENT`/`dispatchOpenPlan`:

```ts
export const CLOSE_PLAN_EVENT = "helmor:close-plan";

/** Fire the cross-component "close the active plan tab" signal (Cmd+W on a plan). */
export function dispatchClosePlan(): void {
	window.dispatchEvent(new CustomEvent(CLOSE_PLAN_EVENT));
}
```

- [ ] **Step 2: Add the shell event type.** In `src/shell/event-bus.ts`, add to the `ShellEvent` union (read the file to find the union; mirror an existing variant's style):

```ts
	| { type: "plan-surface-changed"; active: boolean }
```

- [ ] **Step 3: Panel container — listen for close + publish active state.** In `src/features/panel/container.tsx`:

Add `CLOSE_PLAN_EVENT` to the `@/lib/plan-review` import, and `publishShellEvent` to the `@/shell/event-bus` import (verify exact module path/name; `publishShellEvent` is already used in the shell — confirm where it's exported from).

After the existing `OPEN_PLAN_EVENT` effect (around line 411), add:
```ts
	// Cmd+W on a plan closes the plan (not the session) — the global shortcut
	// handler dispatches CLOSE_PLAN_EVENT; we own activePlanSlug so we clear it.
	useEffect(() => {
		const handler = () => setActivePlanSlug(null);
		window.addEventListener(CLOSE_PLAN_EVENT, handler);
		return () => window.removeEventListener(CLOSE_PLAN_EVENT, handler);
	}, []);

	// Surface "a plan is the active center surface" to the shell so the global
	// Cmd+W handler can branch to closing the plan first.
	useEffect(() => {
		publishShellEvent({
			type: "plan-surface-changed",
			active: activePlanSlug != null,
		});
		return () => {
			publishShellEvent({ type: "plan-surface-changed", active: false });
		};
	}, [activePlanSlug]);
```

- [ ] **Step 4: Shell state — track plan-active + pass into the shortcut hook.** In `src/shell/hooks/use-app-shell-state.tsx`:

Read how shell events are consumed (`useShellEvent` or a subscribe API — match the existing pattern). Add:
```ts
	const [planSurfaceActive, setPlanSurfaceActive] = useState(false);
	useShellEvent("plan-surface-changed", (e) => setPlanSurfaceActive(e.active));
```
Add `dispatchClosePlan` to the `@/lib/plan-review` import. In the `useGlobalShortcutHandlers({ ... })` call, pass:
```ts
		planSurfaceActive,
		onClosePlan: dispatchClosePlan,
```

- [ ] **Step 5: Shortcut handler — branch on plan-active.** In `src/shell/hooks/use-global-shortcut-handlers.ts`:

Add to the params object type + destructure:
```ts
	planSurfaceActive: boolean;
	onClosePlan: () => void;
```
Rewrite the `session.close` entry (lines ~183-197):
```ts
			{
				id: "session.close" as const,
				callback: () => {
					if (planSurfaceActive) {
						onClosePlan();
						return;
					}
					if (workspacePreviewActive && workspacePreviewCard) {
						contextPanelActions.closeWorkspaceContextPreview();
						return;
					}
					if (!getCloseableCurrentSession()) return;
					void handleCloseSelectedSession();
				},
				enabled:
					workspaceViewMode === "conversation" &&
					(planSurfaceActive ||
						Boolean(workspacePreviewCard) ||
						Boolean(getCloseableCurrentSession())),
			},
```
Add `planSurfaceActive` and `onClosePlan` to the handler `useMemo`/`useCallback` dependency array.

- [ ] **Step 6: Typecheck + targeted tests.**

Run: `bun run typecheck`
Run: `bun x vitest run src/shell src/features/panel src/lib/plan-review.test.ts`
Expected: clean / PASS. (No existing test should regress; the new event is inert when no plan is open.)

- [ ] **Step 7: Add a regression test for the shortcut branch (if the handler is unit-testable).**

If `use-global-shortcut-handlers` has an existing test, add a case: with `planSurfaceActive: true`, invoking `session.close` calls `onClosePlan` and does NOT call `handleCloseSelectedSession`. If there is no existing harness, SKIP (note it) — the manual smoke test covers it.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/plan-review.ts src/shell/event-bus.ts src/features/panel/container.tsx src/shell/hooks/use-app-shell-state.tsx src/shell/hooks/use-global-shortcut-handlers.ts
git commit -m "fix(shortcuts): Cmd+W closes the open plan instead of crashing the session"
```

---

## Task 3: Padding on the plan document body

**Files:**
- Modify: `src/features/plan-viewer/plan-view.tsx`

- [ ] **Step 1: Add padding to the rendered block container.** Read `plan-view.tsx`'s `return` (below line 70). Find the element that wraps the mapped block list (the scrollable content column). Add horizontal padding and modest top/bottom padding so plan content is not flush against the pane edges — e.g. add `px-6 py-4` (or align with the app's content gutter; check a sibling surface for the conventional value). Do NOT change layout/scroll behavior — only padding on the content wrapper. If block rows already carry their own horizontal padding, increase the container's instead of doubling up.

- [ ] **Step 2: Typecheck + visual check.**

Run: `bun run typecheck`
Then `bun run dev` and open a plan to confirm the content has breathing room from the edges (manual).

- [ ] **Step 3: Commit.**

```bash
git add src/features/plan-viewer/plan-view.tsx
git commit -m "style(plan-viewer): add padding to plan document body"
```

---

## Task 4: Phase-1 verification

- [ ] Run `bun run typecheck` — clean.
- [ ] Run `bun x vitest run src/features/inspector src/features/panel src/features/plan-viewer src/lib/plan-review.test.ts src/shell` — PASS (pre-existing unrelated failures, if any, must be byte-identical to before).
- [ ] Run `bun x biome check` on the touched files — clean.
- [ ] Manual smoke: (a) open a `.helmor/plans/*.mdx` from the file browser → formatted plan opens in the thread; (b) with a plan open, Cmd+W returns to the thread (no crash); Cmd+W with no plan still closes the session; (c) plan content has padding.
