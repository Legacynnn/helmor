# Vesper Tooltip Fix + Unified Session/Terminal Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vesper tooltips legible, merge the "new session" and "new terminal" controls into one button with a tabbed, keyboard-navigable popover, and add a dedicated keybind for terminal sessions.

**Architecture:** A Vesper-scoped CSS override fixes the invisible tooltip without touching the shared component. The two header launch controls (`Plus` button + `NewSessionMenu` dropdown) collapse into one `NewSessionPopover` (Radix Popover) with `Conversation` / `Terminal` tabs; the Terminal tab is an arrow-navigable list with per-agent digit quick-keys. A new `session.newTerminal` registry shortcut opens the popover on the Terminal tab via the typed shell event bus; `session.reopenClosed` moves off `Mod+Shift+T` to free that hotkey.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (oklch tokens), Radix UI (Popover/Tabs/Tooltip), TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-10-vesper-tooltip-unified-session-launcher-design.md`

> **Commit note:** This workspace is on `main` with unrelated in-progress changes. Each commit step stages **only the files it names** — never `git add -A`. If the user hasn't asked you to commit, stage the named files and pause instead.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/styles/color-theme.css` | Vesper-scoped tooltip override | Modify |
| `src/features/shortcuts/registry.ts` | Move `session.reopenClosed` default; add `session.newTerminal` | Modify |
| `src/features/shortcuts/types.ts` | Add `"session.newTerminal"` to `ShortcutId` | Modify |
| `src/features/shortcuts/registry.test.ts` | Assert new + moved shortcuts, no conflicts | Modify |
| `src/shell/event-bus.ts` | Add `open-new-session` event variant | Modify |
| `src/shell/hooks/use-global-shortcut-handlers.ts` | Register `session.newTerminal` handler | Modify |
| `src/features/terminals/new-session-popover.tsx` | Tabbed launcher popover (replaces menu) | Create |
| `src/features/terminals/new-session-popover.test.tsx` | Popover behavior tests (replaces menu test) | Create |
| `src/features/terminals/new-session-menu.tsx` | Old dropdown | Delete |
| `src/features/terminals/new-session-menu.test.tsx` | Old test | Delete |
| `src/features/panel/header.tsx` | Render the single launcher; thread `newTerminalShortcut` | Modify |
| `src/features/panel/index.tsx` | Thread `newTerminalShortcut` prop | Modify |
| `src/features/panel/container.tsx` | Compute `newTerminalShortcut` from settings | Modify |

---

## Task 1: Vesper tooltip readability fix

**Files:**
- Modify: `src/styles/color-theme.css` (inside the `.dark.theme-vesper` block area, after the existing `--terminal-chrome-bg` rule ~line 893)

This is a CSS-only change (no unit test; verified manually in Task 7).

- [ ] **Step 1: Add the Vesper-scoped tooltip override**

Add this rule immediately **after** the closing `}` of the `.dark.theme-vesper { … }` block (i.e. after line ~893, before the `/* Collapse each sidebar … */` comment at line ~895):

```css
/* Tooltips: the shared component uses bg-foreground + text-background, which is
   a deliberately inverted light pill in the default themes. In Vesper
   --background is transparent, so that pill renders white-on-white (invisible).
   Floating UI stays opaque in Vesper, so give the tooltip an opaque dark pill
   with near-white text. Scoped to Vesper only — other themes are untouched. */
html.theme-vesper [data-slot="tooltip-content"] {
	background-color: var(--bg-overlay);
	color: var(--fg-default);
}
```

- [ ] **Step 2: Typecheck/lint the stylesheet**

Run: `bun run lint`
Expected: PASS (biome has no complaint; this is plain CSS).

- [ ] **Step 3: Commit**

```bash
git add src/styles/color-theme.css
git commit -m "fix(vesper): make icon tooltips legible (opaque dark pill)"
```

---

## Task 2: Shortcut registry — move `reopenClosed`, add `session.newTerminal`

**Files:**
- Modify: `src/features/shortcuts/types.ts` (the `ShortcutId` union)
- Modify: `src/features/shortcuts/registry.ts:73-80` (`session.reopenClosed`) and the `Session` group
- Test: `src/features/shortcuts/registry.test.ts`

Hotkey strings are canonicalized by `normalizeShortcutEvent` as `Mod`(meta) → `Control`(ctrl) → `Alt` → `Shift` → key. So Cmd+Ctrl+T is exactly `"Mod+Control+T"`.

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the `describe("shortcut registry", …)` in `src/features/shortcuts/registry.test.ts`:

```ts
it("defines the terminal-session launcher shortcut and frees Mod+Shift+T", () => {
	const reopen = SHORTCUT_DEFINITIONS.find((d) => d.id === "session.reopenClosed");
	const newTerminal = SHORTCUT_DEFINITIONS.find((d) => d.id === "session.newTerminal");

	expect(reopen?.defaultHotkey).toBe("Mod+Control+T");
	expect(newTerminal?.defaultHotkey).toBe("Mod+Shift+T");
	expect(newTerminal?.scopes).toEqual(["chat"]);

	// No internal conflicts after the move.
	expect(getShortcutConflicts({}).disabledIds.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/shortcuts/registry.test.ts`
Expected: FAIL — `session.newTerminal` not found (`newTerminal` is `undefined`), and `reopen?.defaultHotkey` is still `"Mod+Shift+T"`.

- [ ] **Step 3: Add `"session.newTerminal"` to the `ShortcutId` union**

In `src/features/shortcuts/types.ts`, find the `session.*` ids in the `ShortcutId` union and add the new id alongside them (next to `"session.new"`):

```ts
	| "session.new"
	| "session.newTerminal"
```

- [ ] **Step 4: Move `session.reopenClosed` and add `session.newTerminal` in the registry**

In `src/features/shortcuts/registry.ts`, change the `session.reopenClosed` definition's `defaultHotkey` from `"Mod+Shift+T"` to `"Mod+Control+T"`:

```ts
	{
		id: "session.reopenClosed",
		title: "Reopen closed session",
		group: "Session",
		defaultHotkey: "Mod+Control+T",
		scopes: ["app"],
		editable: true,
	},
```

Then add the new definition immediately **after** the `session.new` definition (the block ending at line ~64):

```ts
	{
		id: "session.newTerminal",
		title: "New terminal session",
		group: "Session",
		defaultHotkey: "Mod+Shift+T",
		scopes: ["chat"],
		editable: true,
	},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun x vitest run src/features/shortcuts/registry.test.ts`
Expected: PASS (all registry tests green, including the new one).

- [ ] **Step 6: Commit**

```bash
git add src/features/shortcuts/types.ts src/features/shortcuts/registry.ts src/features/shortcuts/registry.test.ts
git commit -m "feat(shortcuts): add New terminal session (Mod+Shift+T); move Reopen to Mod+Ctrl+T"
```

---

## Task 3: Shell event variant `open-new-session`

**Files:**
- Modify: `src/shell/event-bus.ts:15-37` (the `ShellEvent` union)

- [ ] **Step 1: Add the event variant**

In `src/shell/event-bus.ts`, add this member to the `ShellEvent` union (e.g. right after the `focus-active-terminal` member ~line 35):

```ts
	// Opens the header's session launcher popover. `tab` selects which tab to
	// focus; omitted = "conversation".
	| { type: "open-new-session"; tab?: "conversation" | "terminal" }
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no callers yet; the union just grows).

- [ ] **Step 3: Commit**

```bash
git add src/shell/event-bus.ts
git commit -m "feat(shell): add open-new-session shell event"
```

---

## Task 4: `NewSessionPopover` component (replaces `NewSessionMenu`)

**Files:**
- Create: `src/features/terminals/new-session-popover.tsx`
- Create: `src/features/terminals/new-session-popover.test.tsx`
- Delete: `src/features/terminals/new-session-menu.tsx`
- Delete: `src/features/terminals/new-session-menu.test.tsx`

The component owns: the `Plus` trigger button (with its "New session" tooltip), the Popover, both tabs, keyboard navigation, and per-agent digit quick-keys. It opens on trigger click **or** on the `open-new-session` shell event.

- [ ] **Step 1: Write the failing test**

Create `src/features/terminals/new-session-popover.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalAgentInfo } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
	listTerminalAgents: vi.fn(),
	createTerminalSession: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	listTerminalAgents: apiMocks.listTerminalAgents,
	createTerminalSession: apiMocks.createTerminalSession,
}));

import { NewSessionPopover } from "./new-session-popover";

function agent(overrides: Partial<TerminalAgentInfo>): TerminalAgentInfo {
	return {
		id: "claude-code",
		displayName: "Claude Code",
		installed: true,
		version: "2.1.170",
		binaryPath: "/usr/local/bin/claude",
		firstClass: true,
		iconKey: "claude",
		skillCount: 3,
		extensionCount: 0,
		pluginCount: 1,
		docsUrl: "https://example.com",
		...overrides,
	};
}

function renderPopover(
	props: Partial<React.ComponentProps<typeof NewSessionPopover>> = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<NewSessionPopover
				workspaceId="w1"
				onCreateConversation={props.onCreateConversation ?? vi.fn()}
				onSelectSession={props.onSelectSession}
				onSessionsChanged={props.onSessionsChanged}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => cleanup());

beforeEach(() => {
	vi.clearAllMocks();
	apiMocks.listTerminalAgents.mockResolvedValue([
		agent({}),
		agent({
			id: "codex",
			displayName: "Codex CLI",
			firstClass: false,
			iconKey: "openai",
			skillCount: 0,
		}),
		agent({ id: "amp", displayName: "Amp", installed: false, version: null }),
	]);
	apiMocks.createTerminalSession.mockResolvedValue({ sessionId: "ts-1" });
});

describe("NewSessionPopover", () => {
	it("creates a conversation from the Conversation tab", async () => {
		const onCreateConversation = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onCreateConversation });
		await user.click(screen.getByLabelText("New session"));
		await user.click(await screen.findByText("New conversation"));
		expect(onCreateConversation).toHaveBeenCalledTimes(1);
		expect(apiMocks.createTerminalSession).not.toHaveBeenCalled();
	});

	it("lists only installed terminal agents on the Terminal tab", async () => {
		const user = userEvent.setup();
		renderPopover();
		await user.click(screen.getByLabelText("New session"));
		await user.click(screen.getByRole("button", { name: /Terminal/ }));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		expect(screen.getByText("Codex CLI")).toBeInTheDocument();
		expect(screen.queryByText("Amp")).not.toBeInTheDocument();
	});

	it("starts a terminal session via the digit quick-key", async () => {
		const onSelectSession = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onSelectSession });
		await user.click(screen.getByLabelText("New session"));
		await user.click(screen.getByRole("button", { name: /Terminal/ }));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		// "1" => first installed agent (claude-code).
		await user.keyboard("1");
		await waitFor(() => {
			expect(apiMocks.createTerminalSession).toHaveBeenCalledWith(
				"w1",
				"claude-code",
			);
		});
		await waitFor(() => {
			expect(onSelectSession).toHaveBeenCalledWith("ts-1");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/features/terminals/new-session-popover.test.tsx`
Expected: FAIL — module `./new-session-popover` does not exist.

- [ ] **Step 3: Create the component**

Create `src/features/terminals/new-session-popover.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Plus, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { createTerminalSession, type TerminalAgentInfo } from "@/lib/api";
import { terminalAgentsQueryOptions } from "@/lib/query-client";
import { publishShellEvent, useShellEvent } from "@/shell/event-bus";
import { cn } from "@/lib/utils";
import { terminalAgentIconByKey } from "./agent-meta";

type LauncherTab = "conversation" | "terminal";

type NewSessionPopoverProps = {
	workspaceId: string | null;
	/** Hotkey label for the Conversation tab/tooltip (e.g. "Mod+T"). */
	conversationShortcut?: string | null;
	/** Hotkey label for the Terminal tab (e.g. "Mod+Shift+T"). */
	terminalShortcut?: string | null;
	/** Plain "new conversation" action — owned by the panel header. */
	onCreateConversation: () => void;
	onSelectSession?: (sessionId: string) => void;
	onSessionsChanged?: () => void;
};

function agentRank(agent: TerminalAgentInfo): number {
	return agent.firstClass ? 0 : 1;
}

function TabButton({
	active,
	label,
	shortcut,
	onClick,
}: {
	active: boolean;
	label: string;
	shortcut?: string | null;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-2 py-1.5 text-small",
				active
					? "border-foreground text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground",
			)}
		>
			<span>{label}</span>
			{shortcut ? (
				<InlineShortcutDisplay hotkey={shortcut} className="opacity-60" />
			) : null}
		</button>
	);
}

/** Single launcher: a Plus button that opens a tabbed popover for starting a
 * conversation or a terminal session. Replaces the old Plus + chevron dropdown
 * pair. Opens on click or on the `open-new-session` shell event (fired by the
 * `session.newTerminal` global shortcut). */
export function NewSessionPopover({
	workspaceId,
	conversationShortcut,
	terminalShortcut,
	onCreateConversation,
	onSelectSession,
	onSessionsChanged,
}: NewSessionPopoverProps) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<LauncherTab>("conversation");
	const [highlight, setHighlight] = useState(0);

	useShellEvent("open-new-session", (event) => {
		setTab(event.tab ?? "conversation");
		setHighlight(0);
		setOpen(true);
	});

	const agentsQuery = useQuery({
		...terminalAgentsQueryOptions(),
		enabled: open,
	});
	const installed = (agentsQuery.data ?? [])
		.filter((agentInfo) => agentInfo.installed)
		.sort((a, b) => agentRank(a) - agentRank(b));

	useEffect(() => {
		setHighlight((current) =>
			installed.length === 0 ? 0 : Math.min(current, installed.length - 1),
		);
	}, [installed.length]);

	const startConversation = () => {
		setOpen(false);
		onCreateConversation();
	};

	const startTerminal = async (agent: TerminalAgentInfo) => {
		if (!workspaceId) return;
		setOpen(false);
		try {
			const { sessionId } = await createTerminalSession(workspaceId, agent.id);
			onSessionsChanged?.();
			onSelectSession?.(sessionId);
		} catch (error) {
			console.error("Failed to create terminal session:", error);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			setTab((current) =>
				current === "conversation" ? "terminal" : "conversation",
			);
			return;
		}
		if (tab === "conversation") {
			if (event.key === "Enter") {
				event.preventDefault();
				startConversation();
			}
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlight((current) => Math.min(installed.length - 1, current + 1));
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlight((current) => Math.max(0, current - 1));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const agent = installed[highlight];
			if (agent) void startTerminal(agent);
			return;
		}
		if (/^[1-9]$/.test(event.key)) {
			const agent = installed[Number(event.key) - 1];
			if (agent) {
				event.preventDefault();
				void startTerminal(agent);
			}
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							aria-label="New session"
							variant="ghost"
							size="icon-sm"
							className="ml-0.5 shrink-0 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
						>
							<Plus className="size-3.5" strokeWidth={1.8} />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					sideOffset={4}
					className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
				>
					<span>New session</span>
					{conversationShortcut ? (
						<InlineShortcutDisplay
							hotkey={conversationShortcut}
							className="text-background/60"
						/>
					) : null}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={4}
				className="w-64 p-0"
				onKeyDown={handleKeyDown}
			>
				<div className="flex border-border/60 border-b">
					<TabButton
						active={tab === "conversation"}
						label="Conversation"
						shortcut={conversationShortcut}
						onClick={() => setTab("conversation")}
					/>
					<TabButton
						active={tab === "terminal"}
						label="Terminal"
						shortcut={terminalShortcut}
						onClick={() => setTab("terminal")}
					/>
				</div>

				{tab === "conversation" ? (
					<div className="p-1">
						<button
							type="button"
							onClick={startConversation}
							className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small hover:bg-accent/60"
						>
							<MessageSquare className="size-3.5 shrink-0" />
							New conversation
						</button>
					</div>
				) : (
					<div className="p-1">
						{agentsQuery.isPending ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								Detecting agents…
							</div>
						) : installed.length === 0 ? (
							<div className="px-2 py-1.5 text-small text-muted-foreground">
								No terminal agents detected
							</div>
						) : (
							installed.map((agent, index) => {
								const Icon = terminalAgentIconByKey(agent.iconKey);
								const quickKey = index < 9 ? String(index + 1) : null;
								return (
									<button
										type="button"
										key={agent.id}
										onClick={() => void startTerminal(agent)}
										onMouseEnter={() => setHighlight(index)}
										data-highlighted={index === highlight ? "" : undefined}
										className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small data-[highlighted]:bg-accent/60"
									>
										<Icon className="size-3.5 shrink-0" />
										<span className="min-w-0 flex-1 truncate text-left">
											{agent.displayName}
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
						<div className="my-1 border-border/60 border-t" />
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								publishShellEvent({
									type: "open-settings",
									section: "terminal-agents",
								});
							}}
							className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small text-muted-foreground hover:bg-accent/60"
						>
							<Settings2 className="size-3.5 shrink-0" />
							Manage terminal agents…
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/features/terminals/new-session-popover.test.tsx`
Expected: PASS (all three tests green).

> If the digit-key test fails because focus isn't inside the popover, ensure the test presses the key after the agents render (the `waitFor` for "Claude Code") — Radix focuses `PopoverContent` on open, so `user.keyboard("1")` lands on the content's `onKeyDown`. Do not add synthetic focus; fix the ordering.

- [ ] **Step 5: Delete the old menu + its test**

```bash
git rm src/features/terminals/new-session-menu.tsx src/features/terminals/new-session-menu.test.tsx
```

(`header.tsx` still imports `NewSessionMenu` — that compile break is fixed in Task 5. Do **not** typecheck between here and Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/features/terminals/new-session-popover.tsx src/features/terminals/new-session-popover.test.tsx
git commit -m "feat(terminals): tabbed New session popover with keyboard quick-keys"
```

---

## Task 5: Wire the launcher into the panel header

**Files:**
- Modify: `src/features/panel/container.tsx:678` (compute `newTerminalShortcut`)
- Modify: `src/features/panel/index.tsx:54-57,86-90,168-171` (thread the prop)
- Modify: `src/features/panel/header.tsx` (props, imports, replace Plus + NewSessionMenu)

- [ ] **Step 1: Thread `newTerminalShortcut` through `container.tsx`**

In `src/features/panel/container.tsx`, next to the existing `newSessionShortcut` prop (line ~678), add:

```tsx
			newSessionShortcut={getShortcut(settings.shortcuts, "session.new")}
			newTerminalShortcut={getShortcut(settings.shortcuts, "session.newTerminal")}
```

- [ ] **Step 2: Thread the prop through `index.tsx`**

In `src/features/panel/index.tsx`:

Add to the props type (after `newSessionShortcut?: string | null;`, line ~56):

```tsx
	newTerminalShortcut?: string | null;
```

Add to the destructured params (after `newSessionShortcut,`, line ~88):

```tsx
	newTerminalShortcut,
```

Add to the `<WorkspacePanelHeader … />` props (after `newSessionShortcut={newSessionShortcut}`, line ~170):

```tsx
					newTerminalShortcut={newTerminalShortcut}
```

- [ ] **Step 3: Update `header.tsx` props + imports**

In `src/features/panel/header.tsx`:

Add to the props type (after `newSessionShortcut?: string | null;`, line ~111):

```tsx
	newTerminalShortcut?: string | null;
```

Add to the destructured params (after `newSessionShortcut,`, line ~143):

```tsx
	newTerminalShortcut,
```

Replace the import on line 56:

```tsx
import { NewSessionMenu } from "@/features/terminals/new-session-menu";
```

with:

```tsx
import { NewSessionPopover } from "@/features/terminals/new-session-popover";
```

Remove the now-unused `Plus` from the `lucide-react` import (line 15) and the now-unused `InlineShortcutDisplay` import (line 54) — they only appeared in the block being replaced below. (Keep `Tooltip`/`TooltipContent`/`TooltipTrigger`; they're still used for session-title tooltips.)

- [ ] **Step 4: Replace the Plus button + NewSessionMenu with the popover**

In `src/features/panel/header.tsx`, replace the entire block from line ~740 (`<Tooltip>` wrapping the `aria-label="New session"` button) through the end of the `<NewSessionMenu … />` element (line ~772) with:

```tsx
					<NewSessionPopover
						workspaceId={workspace?.id ?? null}
						conversationShortcut={newSessionShortcut}
						terminalShortcut={newTerminalShortcut}
						onCreateConversation={() => void sessionActions.createSession()}
						onSelectSession={onSelectSession}
						onSessionsChanged={onSessionsChanged}
					/>
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS — no dangling `NewSessionMenu` / `Plus` / `InlineShortcutDisplay` references; `newTerminalShortcut` flows container → index → header.

> If typecheck reports `Plus`/`InlineShortcutDisplay` as still-used, you missed a usage — grep `header.tsx` for each and only remove the import if there are zero remaining references.

- [ ] **Step 6: Run the panel tests**

Run: `bun x vitest run src/features/panel`
Expected: PASS. If a header/panel test asserted the old chevron control (`aria-label="New session options"`) or rendered `NewSessionMenu`, update it to expect the single `aria-label="New session"` button instead.

- [ ] **Step 7: Commit**

```bash
git add src/features/panel/container.tsx src/features/panel/index.tsx src/features/panel/header.tsx
git commit -m "feat(panel): use unified New session launcher in header"
```

---

## Task 6: Register the `session.newTerminal` global shortcut handler

**Files:**
- Modify: `src/shell/hooks/use-global-shortcut-handlers.ts:169-177` (handler table)

`publishShellEvent` is already imported (line 11) and is a stable module function, so no dependency-array change is needed.

- [ ] **Step 1: Add the handler**

In `src/shell/hooks/use-global-shortcut-handlers.ts`, add this entry immediately **after** the `session.new` handler object (the block ending ~line 173, before `session.reopenClosed`):

```ts
				{
					id: "session.newTerminal" as const,
					callback: () =>
						publishShellEvent({ type: "open-new-session", tab: "terminal" }),
					enabled: workspaceViewMode === "conversation",
				},
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS — `"session.newTerminal"` is a valid `ShortcutId` (Task 2) and `open-new-session` is a valid `ShellEvent` (Task 3).

- [ ] **Step 3: Run the shortcut tests**

Run: `bun x vitest run src/App.shortcuts.test.tsx src/features/shortcuts`
Expected: PASS. (If `App.shortcuts.test.tsx` enumerates registered handler ids, add `session.newTerminal` to that expectation.)

- [ ] **Step 4: Commit**

```bash
git add src/shell/hooks/use-global-shortcut-handlers.ts
git commit -m "feat(shortcuts): wire New terminal session to open the launcher popover"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend test suite**

Run: `bun run test:frontend`
Expected: PASS (all suites). Fix any test that referenced the removed `NewSessionMenu` / `aria-label="New session options"` / old `session.reopenClosed` default.

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both PASS, zero biome warnings, zero clippy warnings.

- [ ] **Step 3: Manual verification in the dev app**

Run: `bun run dev`

Verify:
1. **Vesper tooltip** — switch to the Vesper theme, hover the `+` "New session" button: the tooltip pill is opaque dark with legible near-white text. Switch to a non-Vesper theme and confirm the tooltip looks unchanged (inverted light pill). Confirm the inline shortcut chip inside the tooltip is still readable in Vesper.
2. **Unified launcher** — click `+`: a popover opens with `Conversation` and `Terminal` tabs. `Conversation` → "New conversation" creates a conversation. `Terminal` → lists installed agents, each with a digit chip; `↑`/`↓` move the highlight, `Enter` starts the highlighted agent, a digit key starts that agent directly, `←`/`→` switch tabs.
3. **Keybinds** — `Mod+T` still instantly creates a conversation (no popover). `Mod+Shift+T` opens the popover on the Terminal tab. `Mod+Ctrl+T` reopens the last closed session. Confirm Settings → Shortcuts lists "New terminal session" and shows "Reopen closed session" as `⌘⌃T`.

- [ ] **Step 4: Final status check**

Run: `git status --short`
Expected: clean (all changes committed). Move any stray scratch files into `.agent-contexts/` or remove them.

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 tooltip → Task 1; §2 unified launcher (tabs, arrow-nav, digit quick-keys, manage-agents footer) → Task 4 + Task 5; §3 keybinds (Mod+T unchanged, reopen → Mod+Ctrl+T, new Mod+Shift+T opening Terminal tab via shell event) → Tasks 2, 3, 6. Conversation tab = single action (no provider picker) per non-goals → Task 4.
- **Placeholder scan:** none — every code step shows full content.
- **Type consistency:** `NewSessionPopover` prop names (`conversationShortcut`, `terminalShortcut`, `onCreateConversation`, `onSelectSession`, `onSessionsChanged`, `workspaceId`) match the header callsite (Task 5) and the test (Task 4). `open-new-session` event `tab` field matches producer (Task 6) and consumer (`useShellEvent` in Task 4). `session.newTerminal` id matches across types.ts, registry.ts, the handler, and tests.
