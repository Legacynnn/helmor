# Cmd+1…9 Session Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users switch the active session inside a workspace by pressing Cmd+1…Cmd+9, indexing the session tab bar by position (Cmd+9 acts as an overflow stepper).

**Architecture:** Add a pure resolver in `src/shell/layout.ts` that maps an ordinal (1–9) + the current selection to a target session id, reusing the same `helmorQueryKeys.workspaceSessions` query data the tab bar renders from. Register 9 new registry shortcuts (`session.select1`…`session.select9`, defaults `Mod+1`…`Mod+9`, scope `chat`), wire a `handleSelectSessionByOrdinal` callback through the existing navigation → action-controllers → app-shell-state → global-shortcut-handlers chain, and gate it on `workspaceViewMode === "conversation"` exactly like `session.next`/`session.previous`.

**Tech Stack:** React 19, TypeScript, Vitest (frontend tests). Frontend-only — no Rust/sidecar/pipeline changes.

---

## File Structure

- **`src/shell/layout.ts`** (modify) — add pure `resolveSessionIdByOrdinal()` next to the existing `findAdjacentSessionId()`.
- **`src/shell/layout.test.ts`** (create) — unit tests for the resolver.
- **`src/features/shortcuts/types.ts`** (modify) — add 9 `ShortcutId` union members.
- **`src/features/shortcuts/registry.ts`** (modify) — add 9 `ShortcutDefinition`s.
- **`src/features/shortcuts/registry.test.ts`** (modify) — assert the new defaults + no conflicts.
- **`src/shell/hooks/use-workspace-navigation.ts`** (modify) — add `handleSelectSessionByOrdinal`.
- **`src/shell/hooks/use-workspace-action-controllers.ts`** (modify) — re-export it.
- **`src/shell/hooks/use-app-shell-state.tsx`** (modify) — pass it to the global shortcut handlers hook.
- **`src/shell/hooks/use-global-shortcut-handlers.ts`** (modify) — accept the prop and register 9 handlers.

---

### Task 1: Pure ordinal resolver

**Files:**
- Modify: `src/shell/layout.ts` (add after `findAdjacentSessionId`, ends at line 66)
- Test: `src/shell/layout.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/shell/layout.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { WorkspaceSessionSummary } from "@/lib/api";
import { resolveSessionIdByOrdinal } from "./layout";

function sessions(count: number): WorkspaceSessionSummary[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `s${i + 1}`,
		workspaceId: "ws-1",
		title: `Session ${i + 1}`,
		status: "idle",
		permissionMode: "default",
		unreadCount: 0,
		fastMode: false,
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		isHidden: false,
	})) as WorkspaceSessionSummary[];
}

describe("resolveSessionIdByOrdinal", () => {
	it("returns null for empty lists and out-of-range ordinals", () => {
		expect(resolveSessionIdByOrdinal([], null, 1)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), null, 0)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), null, 10)).toBeNull();
	});

	it("maps Cmd+1..8 to absolute 1-based positions", () => {
		const list = sessions(5);
		expect(resolveSessionIdByOrdinal(list, "s3", 1)).toBe("s1");
		expect(resolveSessionIdByOrdinal(list, "s3", 2)).toBe("s2");
		expect(resolveSessionIdByOrdinal(list, "s3", 5)).toBe("s5");
	});

	it("no-ops when an absolute position does not exist", () => {
		expect(resolveSessionIdByOrdinal(sessions(3), "s1", 4)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), "s1", 8)).toBeNull();
	});

	it("Cmd+9 is a no-op with fewer than 9 sessions", () => {
		expect(resolveSessionIdByOrdinal(sessions(8), "s5", 9)).toBeNull();
	});

	it("Cmd+9 jumps to position 9 when the selection is below the overflow region", () => {
		const list = sessions(11);
		expect(resolveSessionIdByOrdinal(list, "s1", 9)).toBe("s9");
		expect(resolveSessionIdByOrdinal(list, "s5", 9)).toBe("s9");
		expect(resolveSessionIdByOrdinal(list, null, 9)).toBe("s9");
	});

	it("Cmd+9 advances within the overflow region and wraps after the last tab", () => {
		const list = sessions(11);
		expect(resolveSessionIdByOrdinal(list, "s9", 9)).toBe("s10");
		expect(resolveSessionIdByOrdinal(list, "s10", 9)).toBe("s11");
		expect(resolveSessionIdByOrdinal(list, "s11", 9)).toBe("s9");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/shell/layout.test.ts`
Expected: FAIL — `resolveSessionIdByOrdinal` is not exported from `./layout`.

- [ ] **Step 3: Add the resolver implementation**

In `src/shell/layout.ts`, add this function immediately after `findAdjacentSessionId` (after line 66, before the `flattenWorkspaceRows` JSDoc block):

```typescript
/**
 * Resolve which session a Cmd+N shortcut should select, indexing the visible
 * session tab bar by position (1-based). The caller passes the same
 * `helmorQueryKeys.workspaceSessions` array the header renders as tabs, so
 * position N always equals the Nth tab the user sees.
 *
 * Cmd+1..8 select absolute positions 1..8 (no-op if absent). Cmd+9 is an
 * overflow stepper: it jumps to position 9, and pressing it again while the
 * selection already sits at position >= 9 advances one position, wrapping back
 * to position 9 after the last tab. Cmd+9 is a no-op when fewer than 9 sessions
 * exist.
 */
export function resolveSessionIdByOrdinal(
	workspaceSessions: WorkspaceSessionSummary[],
	selectedSessionId: string | null,
	ordinal: number,
): string | null {
	if (ordinal < 1 || ordinal > 9) {
		return null;
	}
	if (workspaceSessions.length === 0) {
		return null;
	}

	// Cmd+1..8 → absolute 1-based position.
	if (ordinal < 9) {
		return workspaceSessions[ordinal - 1]?.id ?? null;
	}

	// Cmd+9 → overflow stepper over positions >= 9 (zero-based index >= 8).
	const OVERFLOW_START_INDEX = 8;
	if (workspaceSessions.length <= OVERFLOW_START_INDEX) {
		return null;
	}
	const currentIndex = workspaceSessions.findIndex(
		(session) => session.id === selectedSessionId,
	);
	if (currentIndex < OVERFLOW_START_INDEX) {
		// Below the overflow region (or nothing selected) → jump to position 9.
		return workspaceSessions[OVERFLOW_START_INDEX]?.id ?? null;
	}
	// Already in the overflow region → advance one, wrapping to position 9.
	const nextIndex =
		currentIndex + 1 >= workspaceSessions.length
			? OVERFLOW_START_INDEX
			: currentIndex + 1;
	return workspaceSessions[nextIndex]?.id ?? null;
}
```

`WorkspaceSessionSummary` is already imported at the top of `layout.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/shell/layout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shell/layout.ts src/shell/layout.test.ts
git commit -m "feat(shortcuts): add ordinal session resolver"
```

---

### Task 2: Register the 9 shortcuts

**Files:**
- Modify: `src/features/shortcuts/types.ts:12-17` (the `session.*` block of the `ShortcutId` union)
- Modify: `src/features/shortcuts/registry.ts` (after the `session.next` definition, line 56)
- Test: `src/features/shortcuts/registry.test.ts`

- [ ] **Step 1: Add the failing registry-test assertions**

In `src/features/shortcuts/registry.test.ts`, add this test inside the `describe("shortcut registry", ...)` block (e.g. after the existing `"uses Mod+Shift+T for the new-session menu"` test, around line 143):

```typescript
	it("registers Cmd+1..9 session selectors with no conflicts", () => {
		for (let ordinal = 1; ordinal <= 9; ordinal++) {
			const id = `session.select${ordinal}` as ShortcutId;
			expect(getShortcut({}, id)).toBe(`Mod+${ordinal}`);
			expect(SHORTCUT_DEFINITION_BY_ID.get(id)?.scopes).toEqual(["chat"]);
		}
		expect(getShortcutConflicts({}).disabledIds.size).toBe(0);
	});
```

Add `SHORTCUT_DEFINITION_BY_ID` to the existing import from `./registry` at the top of the file:

```typescript
import {
	findShortcutConflict,
	getShortcut,
	getShortcutConflicts,
	SHORTCUT_DEFINITION_BY_ID,
	SHORTCUT_DEFINITIONS,
	scopesOverlap,
	updateShortcutOverride,
} from "./registry";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/shortcuts/registry.test.ts`
Expected: FAIL — `getShortcut({}, "session.select1")` returns `null` (id not yet registered); also a TypeScript error on the `as ShortcutId` cast because the ids don't exist yet.

- [ ] **Step 3: Add the union members**

In `src/features/shortcuts/types.ts`, extend the `session.*` portion of the `ShortcutId` union (currently lines 12–17). After `| "session.reopenClosed"` add:

```typescript
	| "session.select1"
	| "session.select2"
	| "session.select3"
	| "session.select4"
	| "session.select5"
	| "session.select6"
	| "session.select7"
	| "session.select8"
	| "session.select9"
```

- [ ] **Step 4: Add the registry definitions**

In `src/features/shortcuts/registry.ts`, immediately after the `session.next` definition (closes at line 56) and before the `session.new` definition, insert:

```typescript
	{
		id: "session.select1",
		title: "Select session 1",
		group: "Navigation",
		defaultHotkey: "Mod+1",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select2",
		title: "Select session 2",
		group: "Navigation",
		defaultHotkey: "Mod+2",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select3",
		title: "Select session 3",
		group: "Navigation",
		defaultHotkey: "Mod+3",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select4",
		title: "Select session 4",
		group: "Navigation",
		defaultHotkey: "Mod+4",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select5",
		title: "Select session 5",
		group: "Navigation",
		defaultHotkey: "Mod+5",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select6",
		title: "Select session 6",
		group: "Navigation",
		defaultHotkey: "Mod+6",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select7",
		title: "Select session 7",
		group: "Navigation",
		defaultHotkey: "Mod+7",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select8",
		title: "Select session 8",
		group: "Navigation",
		defaultHotkey: "Mod+8",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.select9",
		title: "Select session 9 (then cycle overflow)",
		group: "Navigation",
		defaultHotkey: "Mod+9",
		scopes: ["chat"],
		editable: true,
	},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/shortcuts/registry.test.ts`
Expected: PASS (all registry tests, including the new one and the existing "ships with no internal shortcut conflicts").

- [ ] **Step 6: Commit**

```bash
git add src/features/shortcuts/types.ts src/features/shortcuts/registry.ts src/features/shortcuts/registry.test.ts
git commit -m "feat(shortcuts): register Cmd+1-9 session selectors"
```

---

### Task 3: Wire `handleSelectSessionByOrdinal` into workspace navigation

**Files:**
- Modify: `src/shell/hooks/use-workspace-navigation.ts:15` (import) and `:56-74` + `:131` (add callback + return)

- [ ] **Step 1: Import the resolver**

In `src/shell/hooks/use-workspace-navigation.ts`, update the import on line 15 to add `resolveSessionIdByOrdinal`:

```typescript
import {
	findAdjacentSessionId,
	findAdjacentWorkspaceId,
	resolveSessionIdByOrdinal,
} from "@/shell/layout";
```

- [ ] **Step 2: Add the callback**

In the same file, immediately after the `handleNavigateSessions` `useCallback` (closes at line 74) insert:

```typescript
	const handleSelectSessionByOrdinal = useCallback(
		(ordinal: number) => {
			const snapshot = selectionActions.getSnapshot();
			const workspaceId = snapshot.workspaceId;
			if (!workspaceId) return;
			const workspaceSessions =
				queryClient.getQueryData<WorkspaceSessionSummary[]>(
					helmorQueryKeys.workspaceSessions(workspaceId),
				) ?? [];
			const nextSessionId = resolveSessionIdByOrdinal(
				workspaceSessions,
				snapshot.sessionId,
				ordinal,
			);
			if (!nextSessionId) return;
			handleSelectSession(nextSessionId);
		},
		[handleSelectSession, queryClient, selectionActions],
	);
```

- [ ] **Step 3: Return it**

Change the return statement (line 131) to:

```typescript
	return {
		handleNavigateSessions,
		handleNavigateWorkspaces,
		handleSelectSessionByOrdinal,
	};
```

- [ ] **Step 4: Verify it typechecks**

Run: `bun run typecheck`
Expected: PASS (no errors). This confirms the new return key flows without breaking consumers yet.

- [ ] **Step 5: Commit**

```bash
git add src/shell/hooks/use-workspace-navigation.ts
git commit -m "feat(shortcuts): add ordinal session navigation callback"
```

---

### Task 4: Thread the callback through the controller + shell state

**Files:**
- Modify: `src/shell/hooks/use-workspace-action-controllers.ts:186-194` (destructure) and `:243` (return)
- Modify: `src/shell/hooks/use-app-shell-state.tsx:217` (pass to global handlers hook)

- [ ] **Step 1: Destructure the new callback in the action controller**

In `src/shell/hooks/use-workspace-action-controllers.ts`, change the `useWorkspaceNavigation` destructure (lines 186–194) to:

```typescript
	const {
		handleNavigateSessions,
		handleNavigateWorkspaces,
		handleSelectSessionByOrdinal,
	} = useWorkspaceNavigation({
		queryClient,
		selectionActions,
		workspaceGroups,
		archivedRows,
		handleSelectWorkspace,
		handleSelectSession,
	});
```

- [ ] **Step 2: Re-export it**

In the returned object of the same hook (after line 243, `handleNavigateSessions,`), add:

```typescript
		handleSelectSessionByOrdinal,
```

- [ ] **Step 3: Pass it to the global shortcut handlers hook**

In `src/shell/hooks/use-app-shell-state.tsx`, after line 217 (`handleNavigateSessions: data.handleNavigateSessions,`) add:

```typescript
		handleSelectSessionByOrdinal: data.handleSelectSessionByOrdinal,
```

- [ ] **Step 4: Verify it typechecks**

Run: `bun run typecheck`
Expected: FAIL — `use-global-shortcut-handlers.ts` does not yet declare a `handleSelectSessionByOrdinal` prop, so the object passed in `use-app-shell-state.tsx` has an excess property. This expected failure is fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/shell/hooks/use-workspace-action-controllers.ts src/shell/hooks/use-app-shell-state.tsx
git commit -m "feat(shortcuts): thread ordinal session callback to shell state"
```

---

### Task 5: Register the handlers in the global shortcut table

**Files:**
- Modify: `src/shell/hooks/use-global-shortcut-handlers.ts` (import, props type, handler array, deps)

- [ ] **Step 1: Import the `ShortcutId` type and add a module-level descriptor**

In `src/shell/hooks/use-global-shortcut-handlers.ts`, update the shortcuts import (lines 4–7) to also import `ShortcutId`:

```typescript
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import type { ShortcutId } from "@/features/shortcuts/types";
```

Then, directly below the imports (before the JSDoc block at line 15), add the static descriptor list:

```typescript
const SESSION_ORDINAL_SHORTCUTS: { id: ShortcutId; ordinal: number }[] = [
	{ id: "session.select1", ordinal: 1 },
	{ id: "session.select2", ordinal: 2 },
	{ id: "session.select3", ordinal: 3 },
	{ id: "session.select4", ordinal: 4 },
	{ id: "session.select5", ordinal: 5 },
	{ id: "session.select6", ordinal: 6 },
	{ id: "session.select7", ordinal: 7 },
	{ id: "session.select8", ordinal: 8 },
	{ id: "session.select9", ordinal: 9 },
];
```

- [ ] **Step 2: Add the prop to the parameter list and its type**

In the destructured parameter object (after `handleNavigateSessions,` on line 33) add:

```typescript
	handleSelectSessionByOrdinal,
```

In the parameter type object (after `handleNavigateSessions: (offset: -1 | 1) => void;` on line 73) add:

```typescript
	handleSelectSessionByOrdinal: (ordinal: number) => void;
```

- [ ] **Step 3: Register the handlers**

Inside the `globalShortcutHandlers` `useMemo` array, immediately after the `session.next` handler object (closes at line 162) insert:

```typescript
				...SESSION_ORDINAL_SHORTCUTS.map(({ id, ordinal }) => ({
					id,
					callback: () => handleSelectSessionByOrdinal(ordinal),
					enabled: workspaceViewMode === "conversation",
				})),
```

- [ ] **Step 4: Add the callback to the memo deps**

In the dependency array of the same `useMemo` (after `handleNavigateSessions,` on line 310) add:

```typescript
			handleSelectSessionByOrdinal,
```

- [ ] **Step 5: Verify it typechecks**

Run: `bun run typecheck`
Expected: PASS — the excess-property error from Task 4 is resolved.

- [ ] **Step 6: Commit**

```bash
git add src/shell/hooks/use-global-shortcut-handlers.ts
git commit -m "feat(shortcuts): bind Cmd+1-9 to session selection"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the full frontend test suite**

Run: `bun run test:frontend`
Expected: PASS — all existing tests plus the new `layout.test.ts` and registry assertion.

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS with zero errors/warnings.

- [ ] **Step 3: Manual smoke test (dev build)**

Run: `bun run dev`
Then, in a workspace with multiple sessions and the conversation view open:
- Press Cmd+1, Cmd+2, Cmd+3 → the active session tab changes to the 1st/2nd/3rd tab.
- With ≥9 sessions: press Cmd+9 → 9th tab selected; press Cmd+9 again → 10th; repeat past the last → wraps back to the 9th.
- Switch to the editor view → Cmd+1…9 no longer change sessions (gated on conversation view).
- Open Settings → Shortcuts → confirm "Select session 1…9" appear under Navigation and are rebindable.

Expected: all behaviors match. If any fail, debug before claiming completion (superpowers:systematic-debugging).

- [ ] **Step 4: Confirm no stray artifacts**

Run: `git status --short`
Expected: only the intended source/doc files; nothing under scratch dirs.

---

## Notes for the implementer

- **Why read from `queryClient.getQueryData(helmorQueryKeys.workspaceSessions(workspaceId))`:** `src/features/panel/container.tsx:117` renders the tab bar directly from this same query (`sessions = sessionsQuery.data ?? EMPTY_SESSIONS`) with no extra filtering or reordering, so the array order IS the visual tab order. The `__context_preview__` tab is rendered separately and is not part of this array, so it is correctly excluded from the ordinal count.
- **Why `enabled: workspaceViewMode === "conversation"`:** mirrors the existing `session.previous`/`session.next` handlers (lines 154/160) so the shortcuts are inert in editor/start views.
- **Scope `chat` vs the `enabled` gate:** registry `scopes: ["chat"]` governs focus-based matching + settings conflict detection (matching the sibling `session.*` shortcuts); the `enabled` predicate is the runtime view-mode gate. Both are intentionally present.
- **No backend/pipeline changes** — nothing touches `pipeline/`, `agents/`, `schema.rs`, or the storage shape, so no insta snapshot tests are required.
