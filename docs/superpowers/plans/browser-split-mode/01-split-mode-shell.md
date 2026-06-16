# Split Mode Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-host the existing full-pane browser surface as a Split Mode companion shell with three layout states — closed, split (chat left + browser right, resizable), and expanded (today's full-pane behavior) — driven by new shortcuts, header controls, and shell events, with the split width persisted per workspace.

**Architecture:** The existing `useBrowserSessionController` (in `src/shell/controllers/use-browser-session-controller.tsx`) gains a `layout: BrowserLayoutState` field plus `setLayout`/`toggleExpand` actions; it already owns the enter/exit transitions via `selectionActions.setViewMode("browser")`. The reused `ShellViewMode` member `"browser"` still gates the browser surface in `workspace-pane-surface.tsx`, but that branch is rewritten so `layout === "split"` renders chat AND the browser side-by-side in a resizable flex row, while `layout === "expanded"` keeps the current full-pane render. Split width lives in `localStorage` (`helmor.workspaceBrowserSplitWidth`) via a new `useBrowserSplitPanel` hook modeled on `useShellPanels`. Two new shell events (`toggle-browser-split`, `toggle-browser-expand`) and two new shortcut ids (`browser.toggleSplit` = `Mod+Shift+B`, `browser.toggleExpand` = `Mod+Shift+Enter`) wire keyboard + header controls into the controller. The editor full-pane branch is untouched.

**Tech Stack:** React 19, TypeScript, Tauri v2, Vitest, Zustand, TanStack Query.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shell/layout.ts` | **(modify)** Add `BROWSER_SPLIT_WIDTH_STORAGE_KEY`, the three width constants, `clampBrowserSplitWidth`, and `getInitialBrowserSplitWidth`. |
| `src/shell/layout.test.ts` | **(create)** Unit tests for `clampBrowserSplitWidth` + `getInitialBrowserSplitWidth`. |
| `src/shell/controllers/use-browser-session-controller.tsx` | **(modify)** Add `BrowserLayoutState`, `state.layout`, and `setLayout`/`toggleExpand` actions. `openUrl` resets layout to `"split"`. |
| `src/shell/controllers/use-browser-session-controller.test.tsx` | **(modify)** Add tests for the new layout field + actions. |
| `src/shell/event-bus.ts` | **(modify)** Add `toggle-browser-split` and `toggle-browser-expand` to the `ShellEvent` union. |
| `src/features/shortcuts/types.ts` | **(modify)** Add `browser.toggleSplit` and `browser.toggleExpand` to the `ShortcutId` union and add `"Browser"` to `ShortcutGroup`. |
| `src/features/shortcuts/registry.ts` | **(modify)** Add the two `ShortcutDefinition` entries with default chords. |
| `src/features/shortcuts/registry.test.ts` | **(create)** Assert the two new defaults resolve via `getShortcut`. |
| `src/shell/hooks/use-browser-split-panel.ts` | **(create)** Width-persistence + pointer-drag resize hook for the split panel (modeled on `useShellPanels`). |
| `src/shell/hooks/use-browser-split-panel.test.ts` | **(create)** Unit tests for the hook's persistence + keyboard resize. |
| `src/shell/hooks/use-global-shortcut-handlers.ts` | **(modify)** Register handlers for the two new shortcut ids that publish the shell events. |
| `src/shell/components/workspace-pane-surface.tsx` | **(modify)** Rewrite the `workspaceViewMode === "browser"` branch into the split/expanded layout; subscribe to the two shell events. |
| `src/features/browser/index.tsx` | **(modify)** Add `layout`, `onToggleExpand` props + header expand/restore control. |
| `src/features/browser/index.test.tsx` | **(create)** Assert the header expand control calls `onToggleExpand`. |

---

## Task 1 — Layout constants + clamp helpers

**Files:**
- `src/shell/layout.ts` (add after line 18, the existing `clampSidebarWidth`)
- `src/shell/layout.test.ts` (create)

- [ ] Write the failing test. Create `src/shell/layout.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clampBrowserSplitWidth,
	DEFAULT_BROWSER_SPLIT_WIDTH,
	getInitialBrowserSplitWidth,
	MAX_BROWSER_SPLIT_WIDTH,
	MIN_BROWSER_SPLIT_WIDTH,
} from "./layout";

describe("clampBrowserSplitWidth", () => {
	it("clamps below the min", () => {
		expect(clampBrowserSplitWidth(10)).toBe(MIN_BROWSER_SPLIT_WIDTH);
	});
	it("clamps above the max", () => {
		expect(clampBrowserSplitWidth(9999)).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});
	it("passes a value in range through", () => {
		expect(clampBrowserSplitWidth(700)).toBe(700);
	});
});

describe("getInitialBrowserSplitWidth", () => {
	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});
	it("returns the default when nothing is stored", () => {
		expect(getInitialBrowserSplitWidth()).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
	});
	it("returns the clamped stored value", () => {
		window.localStorage.setItem("helmor.workspaceBrowserSplitWidth", "9999");
		expect(getInitialBrowserSplitWidth()).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});
	it("falls back to default on a non-numeric stored value", () => {
		window.localStorage.setItem("helmor.workspaceBrowserSplitWidth", "abc");
		expect(getInitialBrowserSplitWidth()).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
	});
});
```

- [ ] Run the test, expect FAIL (imports do not exist yet):

```bash
bun x vitest run src/shell/layout.test.ts
```

- [ ] Implement. In `src/shell/layout.ts`, insert immediately after the existing `clampSidebarWidth` function (after line 18):

```ts
export const BROWSER_SPLIT_WIDTH_STORAGE_KEY =
	"helmor.workspaceBrowserSplitWidth";
export const DEFAULT_BROWSER_SPLIT_WIDTH = 640;
export const MIN_BROWSER_SPLIT_WIDTH = 360;
export const MAX_BROWSER_SPLIT_WIDTH = 1100;

export function clampBrowserSplitWidth(width: number) {
	return Math.min(
		MAX_BROWSER_SPLIT_WIDTH,
		Math.max(MIN_BROWSER_SPLIT_WIDTH, width),
	);
}

export function getInitialBrowserSplitWidth(
	storageKey = BROWSER_SPLIT_WIDTH_STORAGE_KEY,
) {
	if (typeof window === "undefined") {
		return DEFAULT_BROWSER_SPLIT_WIDTH;
	}
	try {
		const stored = window.localStorage.getItem(storageKey);
		if (!stored) {
			return DEFAULT_BROWSER_SPLIT_WIDTH;
		}
		const parsed = Number.parseInt(stored, 10);
		return Number.isFinite(parsed)
			? clampBrowserSplitWidth(parsed)
			: DEFAULT_BROWSER_SPLIT_WIDTH;
	} catch {
		return DEFAULT_BROWSER_SPLIT_WIDTH;
	}
}
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/shell/layout.test.ts
```

- [ ] Commit:

```bash
git add src/shell/layout.ts src/shell/layout.test.ts && git commit -m "feat(browser): split-width layout constants + clamp helpers"
```

---

## Task 2 — `BrowserLayoutState` in the session controller

**Files:**
- `src/shell/controllers/use-browser-session-controller.tsx` (modify: type block lines 18–37, hook body lines 47–154)
- `src/shell/controllers/use-browser-session-controller.test.tsx` (modify: append tests)

- [ ] Write the failing tests. Append to `src/shell/controllers/use-browser-session-controller.test.tsx`, inside the existing `describe("useBrowserSessionController", ...)` block (before its closing `});` on line 93):

```ts
	it("defaults layout to split and resets to split on openUrl", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		expect(result.current.state.layout).toBe("split");
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("expanded");
		act(() => result.current.actions.openUrl("http://a"));
		expect(result.current.state.layout).toBe("split");
	});

	it("toggleExpand flips between split and expanded", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("expanded");
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("split");
	});

	it("setLayout sets an explicit layout", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.setLayout("expanded"));
		expect(result.current.state.layout).toBe("expanded");
	});
```

- [ ] Run the test, expect FAIL (`layout`, `toggleExpand`, `setLayout` do not exist):

```bash
bun x vitest run src/shell/controllers/use-browser-session-controller.test.tsx
```

- [ ] Implement the type additions. In `src/shell/controllers/use-browser-session-controller.tsx`, add the exported type above `BrowserSessionActions` (above line 18):

```ts
export type BrowserLayoutState = "split" | "expanded";
```

- [ ] Add the two actions to the `BrowserSessionActions` type (inside the block at lines 18–28, before `exit(): void;`):

```ts
	/** Set the companion-panel layout explicitly. */
	setLayout(layout: BrowserLayoutState): void;
	/** Flip between split and expanded layouts. */
	toggleExpand(): void;
```

- [ ] Add `layout` to the `state` shape (inside the `BrowserSessionController` type, lines 30–37, after `activeTabId: string | null;`):

```ts
		layout: BrowserLayoutState;
```

- [ ] Add the state cell. In the hook body, after line 51 (`const [activeTabId, setActiveTabId] = useState<string | null>(null);`):

```ts
	const [layout, setLayout] = useState<BrowserLayoutState>("split");
```

- [ ] Reset layout on open. In `openUrl` (lines 70–88), add `setLayout("split");` immediately before `enterBrowserMode();` (line 85):

```ts
			setLayout("split");
			enterBrowserMode();
```

- [ ] Add `toggleExpand` after the `setTabLoaded` callback (after line 140):

```ts
	const toggleExpand = useCallback(() => {
		setLayout((cur) => (cur === "expanded" ? "split" : "expanded"));
	}, []);
```

- [ ] Wire into the returned object (lines 142–153). Replace the `state` object and add the two actions:

```ts
	return {
		state: { workspaceId: selectedWorkspaceId, tabs, activeTabId, layout },
		actions: {
			openUrl,
			selectTab: setActiveTabId,
			closeTab: closeTabAction,
			navigate,
			fallbackToHttp,
			setTabLoaded,
			setLayout,
			toggleExpand,
			exit: exitBrowserMode,
		},
	};
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/shell/controllers/use-browser-session-controller.test.tsx
```

- [ ] Commit:

```bash
git add src/shell/controllers/use-browser-session-controller.tsx src/shell/controllers/use-browser-session-controller.test.tsx && git commit -m "feat(browser): add BrowserLayoutState to session controller"
```

---

## Task 3 — Shell events for split/expand

**Files:**
- `src/shell/event-bus.ts` (modify: `ShellEvent` union, after line 34)

> No dedicated test file — `event-bus.ts` is a type-only union change covered transitively by Task 7 (handlers) and Task 8 (surface). Type safety is enforced by `bun run typecheck`.

- [ ] Add the two events to the `ShellEvent` union in `src/shell/event-bus.ts`, after the `toggle-context-panel` member (after line 34):

```ts
	| { type: "toggle-browser-split" }
	| { type: "toggle-browser-expand" }
```

- [ ] Verify it type-checks:

```bash
bun run typecheck
```

- [ ] Commit:

```bash
git add src/shell/event-bus.ts && git commit -m "feat(browser): add toggle-browser-split/expand shell events"
```

---

## Task 4 — Shortcut definitions

**Files:**
- `src/features/shortcuts/types.ts` (modify: `ShortcutId` union lines 1–65, `ShortcutGroup` union lines 67–76)
- `src/features/shortcuts/registry.ts` (modify: append to `SHORTCUT_DEFINITIONS`, before line 538's closing `];`)
- `src/features/shortcuts/registry.test.ts` (create)

- [ ] Write the failing test. Create `src/features/shortcuts/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getShortcut } from "./registry";

describe("browser shortcut defaults", () => {
	it("browser.toggleSplit defaults to Mod+Shift+B", () => {
		expect(getShortcut({}, "browser.toggleSplit")).toBe("Mod+Shift+B");
	});
	it("browser.toggleExpand defaults to Mod+Shift+Enter", () => {
		expect(getShortcut({}, "browser.toggleExpand")).toBe("Mod+Shift+Enter");
	});
});
```

- [ ] Run the test, expect FAIL (ids are not in the `ShortcutId` union, so `getShortcut` rejects them at the type level and they have no default):

```bash
bun x vitest run src/features/shortcuts/registry.test.ts
```

- [ ] Add the ids to the `ShortcutId` union in `src/features/shortcuts/types.ts`, after `| "editor.close"` (line 55):

```ts
	| "browser.toggleSplit"
	| "browser.toggleExpand"
```

- [ ] Add `"Browser"` to the `ShortcutGroup` union in `src/features/shortcuts/types.ts` (lines 67–76), after `| "Editor"`:

```ts
	| "Browser"
```

- [ ] Add the two definitions to `SHORTCUT_DEFINITIONS` in `src/features/shortcuts/registry.ts`, immediately before the closing `];` on line 538 (after the `panel.showActions` entry):

```ts
	{
		id: "browser.toggleSplit",
		title: "Toggle browser split mode",
		group: "Browser",
		defaultHotkey: "Mod+Shift+B",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "browser.toggleExpand",
		title: "Expand / restore browser",
		group: "Browser",
		defaultHotkey: "Mod+Shift+Enter",
		scopes: ["app"],
		editable: true,
	},
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/features/shortcuts/registry.test.ts
```

- [ ] Commit:

```bash
git add src/features/shortcuts/types.ts src/features/shortcuts/registry.ts src/features/shortcuts/registry.test.ts && git commit -m "feat(browser): register toggleSplit/toggleExpand shortcuts"
```

---

## Task 5 — Split panel width-persistence + resize hook

**Files:**
- `src/shell/hooks/use-browser-split-panel.ts` (create)
- `src/shell/hooks/use-browser-split-panel.test.ts` (create)

> Models `useShellPanels` (`src/shell/hooks/use-panels.ts`): `useState` seeded from storage, a `useEffect` that persists, a pointer-drag handler with rAF inline writes, and a keyboard ArrowLeft/ArrowRight stepper. This panel grows leftward (browser is on the RIGHT), so a rightward drag shrinks it: `startWidth - deltaX`.

- [ ] Write the failing test. Create `src/shell/hooks/use-browser-split-panel.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	BROWSER_SPLIT_WIDTH_STORAGE_KEY,
	DEFAULT_BROWSER_SPLIT_WIDTH,
	MAX_BROWSER_SPLIT_WIDTH,
} from "@/shell/layout";
import { useBrowserSplitPanel } from "./use-browser-split-panel";

describe("useBrowserSplitPanel", () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it("seeds from the default and persists writes", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		expect(result.current.browserSplitWidth).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
		act(() => result.current.setBrowserSplitWidth(720));
		expect(result.current.browserSplitWidth).toBe(720);
		expect(
			window.localStorage.getItem(BROWSER_SPLIT_WIDTH_STORAGE_KEY),
		).toBe("720");
	});

	it("clamps a setter write above the max", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		act(() => result.current.setBrowserSplitWidth(9999));
		expect(result.current.browserSplitWidth).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});

	it("ArrowLeft grows the panel by one step", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		const before = result.current.browserSplitWidth;
		act(() => {
			result.current.handleBrowserResizeKeyDown({
				key: "ArrowLeft",
				preventDefault: () => {},
			} as unknown as React.KeyboardEvent<HTMLDivElement>);
		});
		expect(result.current.browserSplitWidth).toBe(before + 16);
	});
});
```

- [ ] Run the test, expect FAIL (module does not exist):

```bash
bun x vitest run src/shell/hooks/use-browser-split-panel.test.ts
```

- [ ] Implement. Create `src/shell/hooks/use-browser-split-panel.ts`:

```ts
import {
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useState,
} from "react";
import {
	BROWSER_SPLIT_WIDTH_STORAGE_KEY,
	clampBrowserSplitWidth,
	getInitialBrowserSplitWidth,
} from "@/shell/layout";

const RESIZE_STEP = 16;
const RESIZE_HIT_AREA = 20;

// The browser companion panel is anchored to the RIGHT of the workspace pane,
// so a rightward drag (positive deltaX) shrinks it: `startWidth - deltaX`.
// Modeled on `useShellPanels` (inspector side) — drag-time writes go straight
// to the DOM via rAF to skip React render + CSS-var invalidation; the final
// width is committed to React state (and persisted) on pointer-up.
export function useBrowserSplitPanel() {
	const [browserSplitWidth, setBrowserSplitWidthRaw] = useState(
		getInitialBrowserSplitWidth,
	);
	const [resizing, setResizing] = useState(false);

	const setBrowserSplitWidth = useCallback((width: number) => {
		setBrowserSplitWidthRaw(clampBrowserSplitWidth(width));
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				BROWSER_SPLIT_WIDTH_STORAGE_KEY,
				String(browserSplitWidth),
			);
		} catch (error) {
			console.error(
				`[helmor] browser split width save failed for "${BROWSER_SPLIT_WIDTH_STORAGE_KEY}"`,
				error,
			);
		}
	}, [browserSplitWidth]);

	const handleBrowserResizeStart = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();

			const node = event.currentTarget;
			const pointerId = event.pointerId;
			try {
				node.setPointerCapture(pointerId);
			} catch {}

			const startX = event.clientX;
			const startWidth = browserSplitWidth;
			const targetPane = document.querySelector<HTMLElement>(
				`[data-shell-pane="browser-split"]`,
			);

			let pendingWidth = startWidth;
			let rafId: number | null = null;

			const flushInlineSize = () => {
				rafId = null;
				const widthPx = `${pendingWidth}px`;
				if (targetPane) targetPane.style.width = widthPx;
				node.style.right = `${pendingWidth - RESIZE_HIT_AREA}px`;
			};

			const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
				if (moveEvent.pointerId !== pointerId) return;
				const deltaX = moveEvent.clientX - startX;
				pendingWidth = clampBrowserSplitWidth(startWidth - deltaX);
				if (rafId === null) {
					rafId = window.requestAnimationFrame(flushInlineSize);
				}
			};

			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;
			document.body.style.cursor = "ew-resize";
			document.body.style.userSelect = "none";

			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "2147483647";
			overlay.style.cursor = "ew-resize";
			overlay.setAttribute("data-helmor-resize-overlay", "");
			overlay.setAttribute("aria-hidden", "true");
			document.body.appendChild(overlay);

			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				if (rafId !== null) {
					window.cancelAnimationFrame(rafId);
					rafId = null;
				}
				flushInlineSize();
				setBrowserSplitWidthRaw(pendingWidth);
				try {
					node.releasePointerCapture(pointerId);
				} catch {}
				node.removeEventListener("pointermove", handlePointerMove);
				node.removeEventListener("pointerup", finish);
				node.removeEventListener("pointercancel", finish);
				node.removeEventListener("lostpointercapture", finish);
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
				overlay.remove();
				setResizing(false);
			};

			node.addEventListener("pointermove", handlePointerMove);
			node.addEventListener("pointerup", finish);
			node.addEventListener("pointercancel", finish);
			node.addEventListener("lostpointercapture", finish);
			setResizing(true);
		},
		[browserSplitWidth],
	);

	const handleBrowserResizeKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				setBrowserSplitWidthRaw((cur) => clampBrowserSplitWidth(cur + RESIZE_STEP));
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				setBrowserSplitWidthRaw((cur) => clampBrowserSplitWidth(cur - RESIZE_STEP));
			}
		},
		[],
	);

	return {
		browserSplitWidth,
		setBrowserSplitWidth,
		isBrowserResizing: resizing,
		handleBrowserResizeStart,
		handleBrowserResizeKeyDown,
	};
}
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/shell/hooks/use-browser-split-panel.test.ts
```

- [ ] Commit:

```bash
git add src/shell/hooks/use-browser-split-panel.ts src/shell/hooks/use-browser-split-panel.test.ts && git commit -m "feat(browser): split panel width-persistence + resize hook"
```

---

## Task 6 — Browser surface: expand/restore header control

**Files:**
- `src/features/browser/index.tsx` (modify: props type lines 52–62, params lines 64–73, header controls lines 182–193)
- `src/features/browser/index.test.tsx` (create)

> The surface stays presentational. It receives `layout` + `onToggleExpand` and renders a header button whose icon/label reflects the layout. The expand/restore wiring is driven entirely from the controller upstream.

- [ ] Write the failing test. Create `src/features/browser/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceBrowserSurface } from "./index";

vi.mock("@/lib/api", () => ({
	browserListComments: vi.fn().mockResolvedValue([]),
	browserSendBridgeMessage: vi.fn().mockResolvedValue(undefined),
}));

const noop = () => {};
const baseProps = {
	workspaceId: "ws1",
	tabs: [{ id: "t1", url: "http://a", title: "a", loading: false }],
	activeTabId: "t1",
	onNavigate: noop,
	onSelectTab: noop,
	onCloseTab: noop,
	onOpenUrl: noop,
	onExit: noop,
};

describe("WorkspaceBrowserSurface expand control", () => {
	it("calls onToggleExpand when the expand button is clicked", async () => {
		const onToggleExpand = vi.fn();
		render(
			<WorkspaceBrowserSurface
				{...baseProps}
				layout="split"
				onToggleExpand={onToggleExpand}
			/>,
		);
		await userEvent.click(
			screen.getByRole("button", { name: "Expand browser" }),
		);
		expect(onToggleExpand).toHaveBeenCalledTimes(1);
	});

	it("labels the control Restore when expanded", () => {
		render(
			<WorkspaceBrowserSurface
				{...baseProps}
				layout="expanded"
				onToggleExpand={vi.fn()}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Restore split" }),
		).toBeInTheDocument();
	});
});
```

- [ ] Run the test, expect FAIL (`layout` / `onToggleExpand` props do not exist, button is absent):

```bash
bun x vitest run src/features/browser/index.test.tsx
```

- [ ] Add the import for the icons + the `BrowserLayoutState` type. At the top of `src/features/browser/index.tsx`, add after the existing `Button` import (line 8):

```tsx
import { Maximize2, Minimize2 } from "lucide-react";
import type { BrowserLayoutState } from "@/shell/controllers/use-browser-session-controller";
```

- [ ] Add the two props to `WorkspaceBrowserSurfaceProps` (lines 52–62), after `onExit: () => void;`:

```tsx
	layout: BrowserLayoutState;
	onToggleExpand: () => void;
```

- [ ] Destructure them in the component params (lines 64–73), after `onExit,`:

```tsx
	layout,
	onToggleExpand,
```

- [ ] Add the header control. In the header actions cluster (lines 182–193), insert the expand button before the existing Close `<Button>` (before line 183):

```tsx
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onToggleExpand}
						aria-label={layout === "expanded" ? "Restore split" : "Expand browser"}
						className="gap-1 px-1.5 text-muted-foreground hover:text-foreground"
					>
						{layout === "expanded" ? (
							<Minimize2 className="size-4" />
						) : (
							<Maximize2 className="size-4" />
						)}
					</Button>
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/features/browser/index.test.tsx
```

- [ ] Commit:

```bash
git add src/features/browser/index.tsx src/features/browser/index.test.tsx && git commit -m "feat(browser): expand/restore header control on browser surface"
```

---

## Task 7 — Wire shortcuts to shell events

**Files:**
- `src/shell/hooks/use-global-shortcut-handlers.ts` (modify: handler array, insert near the `composer.toggleContextPanel` entry at lines 296–301)

> Mirrors the `composer.toggleContextPanel` handler that calls `publishShellEvent`. `browser.toggleSplit` is enabled in `conversation`/`browser`/`start` (it opens/closes the companion panel). `browser.toggleExpand` is enabled only while the browser is already active (`browser` view-mode).

- [ ] Confirm `publishShellEvent` is already imported in the file:

```bash
grep -n "publishShellEvent" src/shell/hooks/use-global-shortcut-handlers.ts
```

(It is — used by the existing `workspace.new` / `composer.toggleContextPanel` handlers. No new import needed.)

- [ ] Add the two handlers to the `globalShortcutHandlers` array, immediately after the `composer.toggleContextPanel` entry (after line 301):

```ts
				{
					id: "browser.toggleSplit" as const,
					callback: () => publishShellEvent({ type: "toggle-browser-split" }),
					enabled:
						workspaceViewMode === "conversation" ||
						workspaceViewMode === "browser" ||
						workspaceViewMode === "start",
				},
				{
					id: "browser.toggleExpand" as const,
					callback: () => publishShellEvent({ type: "toggle-browser-expand" }),
					enabled: workspaceViewMode === "browser",
				},
```

- [ ] Verify it type-checks (the ids must be valid `ShortcutId`s from Task 4):

```bash
bun run typecheck
```

- [ ] Commit:

```bash
git add src/shell/hooks/use-global-shortcut-handlers.ts && git commit -m "feat(browser): wire toggleSplit/toggleExpand shortcuts to shell events"
```

---

## Task 8 — Split/expanded layout in the workspace pane

**Files:**
- `src/shell/components/workspace-pane-surface.tsx` (modify: imports lines 1–31, `Props` type lines 36–89, the `workspaceViewMode === "browser"` branch lines 171–184, and the chat `hidden` gate lines 185–192)

> This is the load-bearing change. Today the `"browser"` view-mode hides chat and renders the full-pane browser. We split that branch:
> - **expanded:** unchanged full-pane render (chat hidden) — preserves today's behavior.
> - **split:** the browser renders in a right-anchored, resizable column sized to `browserSplitWidth`; chat stays visible to its left (the `hidden` class is NOT applied in split).
>
> The editor branch (lines 160–170) and its `hidden` gate are untouched. The pane subscribes to the two shell events and calls `browserSession.actions.toggleExpand()` / a toggle-split helper.

- [ ] Write the failing test. Create `src/shell/components/workspace-pane-surface.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/browser", () => ({
	WorkspaceBrowserSurface: () => <div data-testid="browser-surface" />,
}));
vi.mock("./shell-workspace-conversation", () => ({
	ShellWorkspaceConversation: () => <div data-testid="chat-surface" />,
}));
vi.mock("./start-surface-pane", () => ({
	StartSurfacePane: () => <div data-testid="start-surface" />,
}));
vi.mock("@/features/editor", () => ({
	WorkspaceEditorSurface: () => <div data-testid="editor-surface" />,
}));

import { WorkspacePaneSurface } from "./workspace-pane-surface";

function makeProps(layout: "split" | "expanded") {
	const browserSession = {
		state: {
			workspaceId: "ws1",
			tabs: [{ id: "t1", url: "http://a", title: "a", loading: false }],
			activeTabId: "t1",
			layout,
		},
		actions: {
			openUrl: vi.fn(),
			selectTab: vi.fn(),
			closeTab: vi.fn(),
			navigate: vi.fn(),
			fallbackToHttp: vi.fn(),
			setTabLoaded: vi.fn(),
			setLayout: vi.fn(),
			toggleExpand: vi.fn(),
			exit: vi.fn(),
		},
	};
	// Only the fields this test reads are populated; the component tolerates the
	// rest being undefined because the mocked child surfaces ignore them.
	return {
		workspaceViewMode: "browser" as const,
		browserSession,
		appShortcuts: {},
	} as unknown as Parameters<typeof WorkspacePaneSurface>[0];
}

describe("WorkspacePaneSurface browser layout", () => {
	it("renders chat alongside the browser in split layout", () => {
		render(<WorkspacePaneSurface {...makeProps("split")} />);
		expect(screen.getByTestId("browser-surface")).toBeInTheDocument();
		expect(screen.getByTestId("chat-surface")).toBeInTheDocument();
	});

	it("hides chat in expanded layout", () => {
		render(<WorkspacePaneSurface {...makeProps("expanded")} />);
		expect(screen.getByTestId("browser-surface")).toBeInTheDocument();
		// Chat is still mounted (it owns selection state) but visually hidden.
		const chat = screen.getByTestId("chat-surface");
		expect(chat.closest("[data-focus-scope='chat']")).toHaveClass("hidden");
	});
});
```

- [ ] Run the test, expect FAIL (`browserSession.state.layout` is not yet read; in split the chat is currently hidden and the browser is not sized as a column):

```bash
bun x vitest run src/shell/components/workspace-pane-surface.test.tsx
```

- [ ] Add the imports. In `src/shell/components/workspace-pane-surface.tsx`, after the existing `useShellEvent` is needed — add at the top (after line 8's `WorkspaceBrowserSurface` import):

```tsx
import { useShellEvent } from "@/shell/event-bus";
import { useBrowserSplitPanel } from "@/shell/hooks/use-browser-split-panel";
```

- [ ] Inside the `WorkspacePaneSurface` function body, before the `return` (after line 138's `}: Props) {`), add the split-panel hook + shell-event subscriptions:

```tsx
	const {
		browserSplitWidth,
		isBrowserResizing,
		handleBrowserResizeStart,
		handleBrowserResizeKeyDown,
	} = useBrowserSplitPanel();
	const browserLayout = browserSession.state.layout;
	const browserActive = workspaceViewMode === "browser";

	useShellEvent("toggle-browser-expand", () => {
		if (browserActive) browserSession.actions.toggleExpand();
	});
	useShellEvent("toggle-browser-split", () => {
		if (browserActive) {
			browserSession.actions.exit();
		} else if (browserSession.state.tabs.length > 0) {
			browserSession.actions.setLayout("split");
			selectionActions.setViewMode("browser");
		} else {
			browserSession.actions.openUrl("about:blank");
		}
	});
```

- [ ] Define a derived flag for whether the browser occupies the full pane (expanded). Add right after the block above:

```tsx
	const browserExpanded = browserActive && browserLayout === "expanded";
	const browserSplit = browserActive && browserLayout === "split";
```

- [ ] Replace the existing `workspaceViewMode === "browser"` branch (lines 171–184) with a split-aware render. The browser sits in a right-anchored resizable column in split, or full-pane when expanded:

```tsx
				{browserActive && (
					<div
						data-shell-pane="browser-split"
						className={
							browserExpanded
								? "absolute inset-0 z-30 flex min-h-0 flex-col"
								: "absolute inset-y-0 right-0 z-30 flex min-h-0 flex-col border-border/40 border-l"
						}
						style={browserExpanded ? undefined : { width: browserSplitWidth }}
					>
						{browserSplit && (
							<div
								data-shell-resize-handle="browser-split"
								role="separator"
								aria-orientation="vertical"
								aria-label="Resize browser panel"
								tabIndex={0}
								className="absolute top-0 bottom-0 left-0 z-40 w-1 -translate-x-1/2 cursor-ew-resize hover:bg-primary/40"
								data-resizing={isBrowserResizing ? "" : undefined}
								onPointerDown={handleBrowserResizeStart}
								onKeyDown={handleBrowserResizeKeyDown}
							/>
						)}
						<WorkspaceBrowserSurface
							workspaceId={browserSession.state.workspaceId}
							tabs={browserSession.state.tabs}
							activeTabId={browserSession.state.activeTabId}
							layout={browserLayout}
							onNavigate={browserSession.actions.navigate}
							onSelectTab={browserSession.actions.selectTab}
							onCloseTab={browserSession.actions.closeTab}
							onOpenUrl={browserSession.actions.openUrl}
							onExit={browserSession.actions.exit}
							onToggleExpand={browserSession.actions.toggleExpand}
							onFallbackToHttp={browserSession.actions.fallbackToHttp}
							onTabLoaded={browserSession.actions.setTabLoaded}
						/>
					</div>
				)}
```

- [ ] Update the chat `hidden` gate (lines 185–192) so chat stays VISIBLE in split layout — only hide it for the editor or the EXPANDED browser:

```tsx
				<div
					data-focus-scope="chat"
					className={
						workspaceViewMode === "editor" || browserExpanded
							? "hidden"
							: "flex min-h-0 flex-1 flex-col"
					}
				>
```

- [ ] In split layout the chat must not sit under the browser column — pad the workspace viewport's right edge by the panel width when split is active. Update the `Workspace viewport` wrapper (lines 156–159) to apply right padding in split:

```tsx
				<div
					aria-label="Workspace viewport"
					className="relative z-20 flex min-h-0 flex-1 flex-col bg-background"
					style={browserSplit ? { paddingRight: browserSplitWidth } : undefined}
				>
```

- [ ] Run the test, expect PASS:

```bash
bun x vitest run src/shell/components/workspace-pane-surface.test.tsx
```

- [ ] Run the full frontend suite to confirm no regressions in neighboring surfaces:

```bash
bun x vitest run src/shell src/features/browser src/features/shortcuts
```

- [ ] Commit:

```bash
git add src/shell/components/workspace-pane-surface.tsx src/shell/components/workspace-pane-surface.test.tsx && git commit -m "feat(browser): split/expanded layout in workspace pane surface"
```

---

## Task 9 — Final verification

**Files:** none (verification only)

- [ ] Typecheck the whole frontend + sidecar:

```bash
bun run typecheck
```

- [ ] Lint (Biome):

```bash
bun run lint
```

- [ ] Run the full frontend test suite:

```bash
bun run test:frontend
```

- [ ] Manual smoke test (debug build, Tauri MCP per CLAUDE.md): `bun run dev`, open a workspace, press `Cmd+Shift+B` → browser opens as a right-side split with chat still visible; press `Cmd+Shift+Enter` → browser expands full-pane, chat hidden; press again → restores split; drag the left edge of the panel → width changes and survives a reload; close the last tab → split closes and chat reclaims the pane; open the editor → editor full-pane is unchanged.

- [ ] Commit any lint autofixes if produced:

```bash
git add -A && git commit -m "chore(browser): lint + typecheck pass for split mode shell"
```

---

## Self-review notes

| Acceptance criterion | Covered by |
| --- | --- |
| Browser opens in a right-side split panel beside chat; chat stays visible. | Task 8 (split layout renders the browser in a right-anchored column, chat `hidden` gate keeps chat visible in split, viewport right-padding reserves space). Default `layout = "split"` from Task 2. |
| `Cmd+Shift+B` toggles Split Mode; `Cmd+Shift+Enter` expands/restores; header controls do the same. | Task 4 (shortcut defaults `Mod+Shift+B` / `Mod+Shift+Enter`), Task 7 (handlers publish shell events), Task 8 (`useShellEvent` subscriptions toggle split/expand), Task 6 (header expand/restore button calls `onToggleExpand`). |
| Expanded state replicates today's full-pane browser behavior; existing tabs/capture/inspector features unchanged. | Task 8 (`browserExpanded` renders the same full-pane `WorkspaceBrowserSurface` with chat hidden); the surface internals from `src/features/browser/index.tsx` are untouched except for the additive expand control in Task 6. |
| Closing the last tab/surface closes Split Mode; panel width persists per workspace. | Task 2 (`closeTab` already calls `exitBrowserMode` when no tabs remain — unchanged), Task 1 + Task 5 (`helmor.workspaceBrowserSplitWidth` localStorage persistence + clamp). |
| No regression to editor full-pane mode. | Task 8 leaves the `workspaceViewMode === "editor"` branch and its `hidden` gate untouched (only `browserExpanded` was added to the chat-hide condition; editor still hides chat exactly as before). Verified by Task 9's full suite. |
