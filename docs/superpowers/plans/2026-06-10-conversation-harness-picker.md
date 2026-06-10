# Conversation Harness Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "+" launcher's Conversation tab list the available conversation harnesses (Claude, Codex, OpenCode, Cursor) and create a conversation seeded with the picked harness's default model.

**Architecture:** Frontend-only. The Conversation tab in `NewSessionPopover` reads the existing `agentModelSectionsQueryOptions()` catalog, filters to `ready` sections with options, and renders one row per harness. Clicking a harness threads its first model id through an optional `model` argument added to `onCreateConversation` → `createSessionAction` → the existing `createSession(workspaceId, { model })` IPC. The backend already infers the provider from the model id, so no Rust/schema/pipeline changes.

**Tech Stack:** React 19, TanStack React Query, Vitest + @testing-library/react, Tauri IPC (`createSession`), existing `ModelIcon` component.

---

## File Structure

- Modify: `src/features/panel/header/use-session-actions.ts` — `createSessionAction` gains optional `model` arg.
- Modify: `src/features/panel/header.tsx:744` — pass `model` from `onCreateConversation` into `sessionActions.createSession`.
- Modify: `src/features/terminals/new-session-popover.tsx` — Conversation tab becomes a harness list; `onCreateConversation` signature gains optional `model`.
- Test: `src/features/terminals/new-session-popover.test.tsx` — new test file (create if absent).
- Test: `src/features/panel/header/use-session-actions.test.ts` — new test file (create if absent) OR extend existing panel tests.

Reference (do not modify): `src/components/model-icon.tsx` exports `ModelIcon({ model?: AgentModelOption | null, className? })`; `src/lib/query-client.ts` exports `agentModelSectionsQueryOptions()`; `src/lib/api.ts` exports `AgentModelSection` (`{ id, label, status?, options }`) and `createSession(workspaceId, { model })`.

---

## Task 1: Thread optional `model` through conversation creation

**Files:**
- Modify: `src/features/panel/header/use-session-actions.ts:31` (interface) and `:67-87` (`createSessionAction`)
- Modify: `src/features/panel/header.tsx:744`
- Test: `src/features/panel/header/use-session-actions.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/features/panel/header/use-session-actions.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDetail } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
	createSession: vi.fn(),
	deleteSession: vi.fn(),
	renameSession: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		createSession: apiMocks.createSession,
		deleteSession: apiMocks.deleteSession,
		renameSession: apiMocks.renameSession,
	};
});

import { useSessionActions } from "./use-session-actions";

const workspace = {
	id: "workspace-1",
	repoId: "repo-1",
} as unknown as WorkspaceDetail;

function setup() {
	const queryClient = new QueryClient();
	return renderHook(() =>
		useSessionActions({
			workspace,
			sessions: [],
			selectedSessionId: null,
			queryClient,
			pushToast: vi.fn(),
		}),
	);
}

describe("createSessionAction model arg", () => {
	beforeEach(() => {
		apiMocks.createSession.mockReset();
		apiMocks.createSession.mockResolvedValue({ sessionId: "session-new" });
	});

	it("passes the model when provided", async () => {
		const { result } = setup();
		await act(async () => {
			await result.current.createSession("gpt-5.5");
		});
		expect(apiMocks.createSession).toHaveBeenCalledWith("workspace-1", {
			model: "gpt-5.5",
		});
	});

	it("omits options when no model is provided", async () => {
		const { result } = setup();
		await act(async () => {
			await result.current.createSession();
		});
		expect(apiMocks.createSession).toHaveBeenCalledWith("workspace-1");
	});
});
```

> Note: `useSessionActions` requires the full options object. If the real hook needs more required fields than shown above (check its `Params` shape at the top of `use-session-actions.ts`), add them to the `setup()` call as `undefined`/empty values — only `workspace`, `sessions`, `queryClient`, and `pushToast` are exercised by these tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/panel/header/use-session-actions.test.ts`
Expected: FAIL — `createSession` called with `"workspace-1"` only (no `{ model }`) in the first test.

- [ ] **Step 3: Update the interface and implementation**

In `src/features/panel/header/use-session-actions.ts`, change the controller interface (currently `createSession(): Promise<void>;` near line 31):

```ts
	createSession(model?: string): Promise<void>;
```

Change `createSessionAction` (lines 67-87) to accept and forward the model:

```ts
	const createSessionAction = useCallback(
		async (model?: string) => {
			if (!workspace) return;
			try {
				const result = await createSession(
					workspace.id,
					model ? { model } : undefined,
				);
				seedNewSessionInCache({
					queryClient,
					workspaceId: workspace.id,
					sessionId: result.sessionId,
					workspace,
					existingSessions: sessions,
					createdAt: new Date().toISOString(),
				});
				void queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.repoScripts(workspace.repoId, workspace.id),
				});
				onSessionsChanged?.();
				onSelectSession?.(result.sessionId);
			} catch (error) {
				console.error("Failed to create session:", error);
			}
		},
		[onSelectSession, onSessionsChanged, queryClient, sessions, workspace],
	);
```

- [ ] **Step 4: Wire the header callback**

In `src/features/panel/header.tsx` line 744, change:

```tsx
					onCreateConversation={() => void sessionActions.createSession()}
```

to:

```tsx
					onCreateConversation={(model) =>
						void sessionActions.createSession(model)
					}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/panel/header/use-session-actions.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: no errors. (`onCreateConversation`'s prop type changes in Task 2; if typecheck flags the header callback arg as `any`/mismatch before Task 2, that is expected and resolved by Task 2 — re-run typecheck at the end of Task 2.)

- [ ] **Step 7: Commit**

```bash
git add src/features/panel/header/use-session-actions.ts src/features/panel/header.tsx src/features/panel/header/use-session-actions.test.ts
git commit -m "feat: thread optional model through conversation creation"
```

---

## Task 2: Harness list in the Conversation tab

**Files:**
- Modify: `src/features/terminals/new-session-popover.tsx`
- Test: `src/features/terminals/new-session-popover.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/features/terminals/new-session-popover.test.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentModelSection, TerminalAgentInfo } from "@/lib/api";
import { createHelmorQueryClient } from "@/lib/query-client";

const apiMocks = vi.hoisted(() => ({
	loadAgentModelSections: vi.fn(),
	loadTerminalAgents: vi.fn(),
	createTerminalSession: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		loadAgentModelSections: apiMocks.loadAgentModelSections,
		loadTerminalAgents: apiMocks.loadTerminalAgents,
		createTerminalSession: apiMocks.createTerminalSession,
	};
});

import { NewSessionPopover } from "./new-session-popover";

const SECTIONS: AgentModelSection[] = [
	{
		id: "claude",
		label: "Claude Code",
		status: "ready",
		options: [
			{
				id: "default",
				provider: "claude",
				label: "Opus 4.8 1M",
				cliModel: "default",
				effortLevels: [],
				supportsContextUsage: true,
			},
		],
	},
	{
		id: "codex",
		label: "Codex",
		status: "ready",
		options: [
			{
				id: "gpt-5.5",
				provider: "codex",
				label: "GPT-5.5",
				cliModel: "gpt-5.5",
				effortLevels: [],
				supportsContextUsage: true,
			},
		],
	},
	{
		id: "opencode",
		label: "OpenCode",
		status: "unavailable",
		options: [],
	},
];

function renderPopover(onCreateConversation = vi.fn()) {
	const queryClient = createHelmorQueryClient();
	render(
		<QueryClientProvider client={queryClient}>
			<NewSessionPopover
				workspaceId="workspace-1"
				onCreateConversation={onCreateConversation}
			/>
		</QueryClientProvider>,
	);
	return { onCreateConversation };
}

describe("NewSessionPopover conversation harnesses", () => {
	beforeEach(() => {
		apiMocks.loadAgentModelSections.mockReset();
		apiMocks.loadTerminalAgents.mockReset();
		apiMocks.loadAgentModelSections.mockResolvedValue(SECTIONS);
		apiMocks.loadTerminalAgents.mockResolvedValue([] as TerminalAgentInfo[]);
	});

	it("lists only ready harnesses and hides unavailable ones", async () => {
		const user = userEvent.setup();
		renderPopover();
		await user.click(screen.getByRole("button", { name: "New session" }));
		await waitFor(() =>
			expect(screen.getByText("Claude Code")).toBeInTheDocument(),
		);
		expect(screen.getByText("Codex")).toBeInTheDocument();
		expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();
	});

	it("creates a conversation with the harness's first model id", async () => {
		const user = userEvent.setup();
		const { onCreateConversation } = renderPopover();
		await user.click(screen.getByRole("button", { name: "New session" }));
		await waitFor(() =>
			expect(screen.getByText("Codex")).toBeInTheDocument(),
		);
		await user.click(screen.getByText("Codex"));
		expect(onCreateConversation).toHaveBeenCalledWith("gpt-5.5");
	});
});
```

> Note: confirm the actual exported names for the terminal-agents loader and the `AgentModelOption` field names (`cliModel`, `effortLevels`, `supportsContextUsage`) against `src/lib/api.ts` before running; adjust the mock object keys to match exactly. The terminal-agents query is mocked empty so only the Conversation tab matters here.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/terminals/new-session-popover.test.tsx`
Expected: FAIL — "Codex" / harness rows not found (current component renders only a single "New conversation" button).

- [ ] **Step 3: Add the catalog query and harness derivation**

In `src/features/terminals/new-session-popover.tsx`:

Add imports near the top (merge with existing import groups):

```tsx
import { ModelIcon } from "@/components/model-icon";
import { agentModelSectionsQueryOptions } from "@/lib/query-client";
import type { AgentModelSection } from "@/lib/api";
```

Inside the component, after the existing `agentsQuery` block (around line 97), add:

```tsx
	const modelSectionsQuery = useQuery({
		...agentModelSectionsQueryOptions(),
		enabled: open,
	});
	const harnesses: AgentModelSection[] = (modelSectionsQuery.data ?? []).filter(
		(section) => section.status === "ready" && section.options.length > 0,
	);
```

- [ ] **Step 4: Update `startConversation` and the conversation-tab keyboard handling**

Change the `onCreateConversation` prop type (line 32) to accept an optional model:

```tsx
	/** Plain "new conversation" action — owned by the panel header. Optional
	 * `model` seeds the new session's harness/model. */
	onCreateConversation: (model?: string) => void;
```

Replace `startConversation` (lines 108-111):

```tsx
	const startConversation = (model?: string) => {
		setOpen(false);
		onCreateConversation(model);
	};
```

In `handleKeyDown`, the `conversation` branch currently calls `startConversation()` on Enter (lines 140-146). Replace that branch so Enter/arrows/quick-keys drive the harness list (mirrors the terminal branch):

```tsx
		if (tab === "conversation") {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlight((current) =>
					Math.max(0, Math.min(harnesses.length - 1, current + 1)),
				);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight((current) => Math.max(0, current - 1));
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const section = harnesses[highlight];
				if (section) startConversation(section.options[0]?.id);
				else startConversation();
				return;
			}
			if (/^[1-9]$/.test(event.key)) {
				const section = harnesses[Number(event.key) - 1];
				if (section) {
					event.preventDefault();
					startConversation(section.options[0]?.id);
				}
			}
			return;
		}
```

Also extend the existing highlight-clamp `useEffect` (lines 102-106) so it stays valid as the user switches tabs. Replace it with:

```tsx
	const activeListLength =
		tab === "conversation" ? harnesses.length : installed.length;
	useEffect(() => {
		setHighlight((current) =>
			activeListLength === 0 ? 0 : Math.min(current, activeListLength - 1),
		);
	}, [activeListLength]);
```

(Remove the old `installed.length`-only effect.)

- [ ] **Step 5: Replace the Conversation tab body**

Replace the conversation-tab JSX (lines 224-234, the `{tab === "conversation" ? (...)}` branch) with the harness list:

```tsx
				{tab === "conversation" ? (
					<div className="p-1">
						{modelSectionsQuery.isPending ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								Detecting harnesses…
							</div>
						) : harnesses.length === 0 ? (
							<button
								type="button"
								onClick={() => startConversation()}
								className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60"
							>
								<MessageSquare className="size-3.5 shrink-0" />
								New conversation
							</button>
						) : (
							harnesses.map((section, index) => {
								const quickKey = index < 9 ? String(index + 1) : null;
								return (
									<button
										key={section.id}
										type="button"
										onClick={() => startConversation(section.options[0]?.id)}
										onMouseEnter={() => setHighlight(index)}
										data-highlighted={index === highlight ? "" : undefined}
										className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60 data-[highlighted]:bg-accent/60"
									>
										<ModelIcon
											model={section.options[0]}
											className="size-3.5 shrink-0"
										/>
										<span className="min-w-0 flex-1 truncate text-left">
											{section.label}
										</span>
										{quickKey ? (
											<kbd className="shrink-0 rounded-sm border border-border/70 bg-background px-1 text-[10px] text-muted-foreground">
												{quickKey}
											</kbd>
										) : null}
									</button>
								);
							})
						)}
					</div>
				) : (
```

`MessageSquare` is already imported; keep its import. (If lint flags `MessageSquare` as unused after this change, it is still used in the empty-state fallback above, so it stays.)

- [ ] **Step 6: Run test to verify it passes**

Run: `bun x vitest run src/features/terminals/new-session-popover.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 7: Typecheck + lint**

Run: `bun run typecheck`
Expected: no errors (header callback from Task 1 now matches the `(model?: string) => void` prop).

Run: `bun run lint`
Expected: no biome errors on the changed files. (Clippy will run too but no Rust changed.)

- [ ] **Step 8: Commit**

```bash
git add src/features/terminals/new-session-popover.tsx src/features/terminals/new-session-popover.test.tsx
git commit -m "feat: harness picker in conversation launcher tab"
```

---

## Task 3: Full verification + changeset

**Files:**
- Create: `.changeset/<random-name>.md`

- [ ] **Step 1: Run the full frontend test suite**

Run: `bun run test:frontend`
Expected: PASS. Pay attention to `src/features/panel/index.test.tsx` and `src/features/panel/container.test.tsx` — they assert `createSession` is called with `"workspace-1"` (no options) on auto-create / session-close paths. Those paths pass no model, so `createSession(workspace.id, undefined)` must still call the API as `createSession("workspace-1")`. The `model ? { model } : undefined` guard in Task 1 preserves this. If any of these tests fail, the guard was implemented wrong — fix it, do not loosen the test.

- [ ] **Step 2: Manual sanity check (optional, debug build)**

Run: `bun run dev`, click the "+" launcher, confirm the Conversation tab lists Claude Code + Codex (and OpenCode/Cursor only if configured), and clicking Codex starts a Codex conversation.

- [ ] **Step 3: Write the changeset**

Create `.changeset/conversation-harness-picker.md`:

```md
---
"helmor": patch
---

The new-conversation launcher now lets you pick which harness (Claude, Codex, OpenCode, or Cursor) to start a conversation with, showing only the harnesses you have connected.
```

- [ ] **Step 4: Commit**

```bash
git add .changeset/conversation-harness-picker.md
git commit -m "chore: changeset for conversation harness picker"
```

---

## Self-Review Notes

- **Spec coverage:** Harness source = catalog query (Task 2 Step 3). Selection → first model id (Task 2 Steps 4-5). Hide unavailable = `status === "ready" && options.length > 0` filter (Task 2 Step 3). Optional-model threading without breaking existing callers (Task 1 + Task 3 Step 1 regression note). All spec sections mapped.
- **Type consistency:** `createSession(model?: string)` controller method, `onCreateConversation: (model?: string) => void` prop, and `startConversation(model?: string)` all use the same optional-string shape. `ModelIcon` receives `AgentModelOption | undefined` (`section.options[0]`), matching its `model?` prop.
- **No backend changes:** confirmed — `create_session`, `catalog.rs`, `schema.rs`, pipeline untouched; no Rust snapshot tests needed.
