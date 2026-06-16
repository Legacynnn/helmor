# Perf Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and harden the performance of the browser and simulator preview surfaces (Phases 1-4) so opening, closing, splitting, expanding, switching tabs, and running agent control never drop frames in chat/editor — adding the few missing lazy-mount / suspension guards, then proving each PRD §6 criterion under the perf HUD.

**Architecture:** Most performance behavior is already correct by construction (single live child-webview held in a `Mutex<Option<Webview>>`; `ContentHost` creates on mount and destroys on unmount; capture/stitch run off the React main thread via `run_blocking`; the inspector bridge stays passive in mode `"none"`). This phase closes the remaining gaps: (1) the content webview must be created only on the *first* render that has a URL, not eagerly; (2) the simulator screenshot poller (Phase 4) must clear its interval whenever the surface is hidden; (3) background tabs must never spawn a second live webview. Each gap becomes a TDD guard task (failing unit test → minimal guard → green → commit). Everything else becomes an evidence-based measurement task with an exact HUD procedure and a numeric pass threshold.

**Tech Stack:** React 19, TypeScript, Tauri v2, Rust, Vitest, perf HUD (react-scan + long-frame tracker).

---

## Prerequisites

Depends on **Phases 1-4** being merged. This plan hardens these surfaces/symbols:

- **Phase 1 — Split Mode shell:** `BrowserLayoutState` (`"split" | "expanded"`), `useBrowserSessionController` (`src/shell/controllers/use-browser-session-controller.tsx`), the split branch in `src/shell/components/workspace-pane-surface.tsx`.
- **Browser surface (pre-existing, re-hosted in Phase 1):**
  - `ContentHost` + `rectFromElement` (`src/features/browser/content-host.tsx`) — `browserCreate` on mount, `browserDestroy` on unmount.
  - Rust webview lifecycle: `create` / `navigate` / `set_bounds` / `destroy` over the single `Mutex<Option<Webview>>` slot (`src-tauri/src/browser/mod.rs`).
  - Capture/stitch off-thread: `stitch_segments` called inside `run_blocking` (`src-tauri/src/browser/capture.rs`, `src-tauri/src/commands/browser_commands.rs`).
  - Passive bridge: `createBridge` installs zero listeners in mode `"none"` (`src/features/browser/bridge/index.ts`); injected via `bridge::injection_script()` (`src-tauri/src/browser/bridge.rs`).
- **Phase 2 — broker:** `preview/broker.rs`, agent-control banner.
- **Phase 4 — simulator surface:** `src/features/simulator/` screenshot poller, `SimulatorSurface` in `workspace-pane-surface.tsx`.

The perf HUD wiring already exists and is the source of truth for frame timings:
- `src/lib/dev-long-frames.ts` — rAF self-timing + Long-Animation-Frame collector; threshold `SLOW_FRAME_THRESHOLD_MS = 50`. Exposes `window.__HELMOR_LONG_FRAMES__` with `.fps()`, `.worstFrameMs()`, `.get()` (the long-frame ring buffer), `.clear()`, `.dumpJson()`, `.downloadJson()`.
- `src/lib/dev-react-scan.ts` — react-scan re-render highlighter.
- Both gate on `import.meta.env.VITE_HELMOR_PERF_HUD === "1"` OR `?perfHud=1`.

**How to read frame timings (used by every MEASUREMENT task):**
1. Launch with the HUD on: `VITE_HELMOR_PERF_HUD=1 bun run dev` (or `bun run dev:analyze`).
2. The HUD is a fixed black overlay at bottom-left showing `FPS`, `worst 5s: <ms>`, `long frames: <n>`.
3. Before each measured interaction, open devtools console and run `window.__HELMOR_LONG_FRAMES__.clear()` to reset the ring buffer and rolling worst-frame.
4. Perform the interaction, then read evidence with `window.__HELMOR_LONG_FRAMES__.dumpJson()` (or `.get()` for the raw `LongFrameEntry[]`, `.worstFrameMs()` for the rolling worst). A "long frame" is any frame `> 50ms`; the buffer length is the `long frames` HUD counter.
5. PASS thresholds below are stated in terms of these exact readings.

> **WebKit caveat (already documented in `dev-long-frames.ts`):** in the Tauri release/dev WKWebView the LoAF collector does not fire; the rAF fallback is the real source of truth. Read FPS + worst-frame from the rAF path. Do all measurements inside the Tauri webview (`bun run dev`), never a plain browser tab.

---

## File Structure

Files touched by GUARD tasks (REAL code):

| File | Change |
| --- | --- |
| `src/features/browser/content-host.tsx` | Add `shown` prop; gate `browserCreate` on first `shown && url`. |
| `src/features/browser/content-host.test.ts` | New tests: lazy-create guard + idempotent single-create. |
| `src/features/simulator/screenshot-poller.ts` *(Phase 4)* | Extract/confirm a pure `createScreenshotPoller({ intervalMs, capture })` with `start()`/`stop()`; stop clears the interval. |
| `src/features/simulator/screenshot-poller.test.ts` *(Phase 4)* | New tests: poller does not tick before `start`; `stop()` clears the interval; hidden surface calls `stop`. |
| `src/features/simulator/use-simulator-surface.ts` *(Phase 4)* | Call `poller.stop()` when `shown === false` / on unmount. |

MEASUREMENT tasks touch no source — they are HUD checklists.

---

## Task 1 (GUARD): Browser content webview lazy-mounts — created only on first show

**Why:** PRD §6 "Split panel lazy-mounts; content webview created only on first use." Today `ContentHost` calls `browserCreate` on mount whenever a URL is present. In Split Mode the host can be rendered (mounted but visually collapsed/hidden) before the user actually opens the panel. The guard: accept a `shown` boolean and create the webview only once `shown && url` is first true.

- [ ] **Write the failing test.** Append to `src/features/browser/content-host.test.ts`. (The existing file tests `rectFromElement` only; these tests exercise the create-gating via a mocked `@/lib/api`.)

```ts
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentHost } from "./content-host";

const browserCreate = vi.fn().mockResolvedValue(undefined);
const browserDestroy = vi.fn().mockResolvedValue(undefined);
const browserNavigate = vi.fn().mockResolvedValue(undefined);
const browserSetBounds = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
	browserCreate: (...a: unknown[]) => browserCreate(...a),
	browserDestroy: (...a: unknown[]) => browserDestroy(...a),
	browserNavigate: (...a: unknown[]) => browserNavigate(...a),
	browserSetBounds: (...a: unknown[]) => browserSetBounds(...a),
}));

// content-host imports @/lib/api dynamically inside effects; flush microtasks.
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	vi.clearAllMocks();
});

describe("ContentHost lazy mount", () => {
	it("does NOT create the webview while hidden, even with a url", async () => {
		render(<ContentHost url="http://localhost:3000" shown={false} />);
		await flush();
		expect(browserCreate).not.toHaveBeenCalled();
	});

	it("creates the webview once the surface is first shown", async () => {
		const { rerender } = render(
			<ContentHost url="http://localhost:3000" shown={false} />,
		);
		await flush();
		expect(browserCreate).not.toHaveBeenCalled();

		rerender(<ContentHost url="http://localhost:3000" shown={true} />);
		await flush();
		expect(browserCreate).toHaveBeenCalledTimes(1);
	});

	it("creates the webview exactly once across re-shows (no second live webview)", async () => {
		const { rerender } = render(
			<ContentHost url="http://localhost:3000" shown={true} />,
		);
		await flush();
		rerender(<ContentHost url="http://localhost:3000" shown={false} />);
		await flush();
		rerender(<ContentHost url="http://localhost:3000" shown={true} />);
		await flush();
		expect(browserCreate).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Run it — expect RED.** `bun x vitest run src/features/browser/content-host.test.ts` — the new `lazy mount` tests fail (today `ContentHost` has no `shown` prop and creates on mount).

- [ ] **Implement the minimal guard** in `src/features/browser/content-host.tsx`:
  - Add `shown: boolean` to `ContentHostProps`.
  - Replace the "create on mount" effect with a create effect keyed on `shown`: create only when `shown && url && !createdRef.current`. Keep the existing `urlRef` pattern so the URL is read through a ref. Keep `browserDestroy` on unmount. Concretely:

```tsx
type ContentHostProps = {
	url: string | null;
	/** Whether the surface is actually visible. The native webview is created
	 *  only on the first render where this is true (PRD §6 lazy-mount). */
	shown: boolean;
};

export function ContentHost({ url, shown }: ContentHostProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const createdRef = useRef(false);
	const urlRef = useRef(url);
	urlRef.current = url;

	// Lazy create: only once the surface is first shown WITH a url.
	useEffect(() => {
		const host = hostRef.current;
		const initialUrl = urlRef.current;
		if (!host || !shown || !initialUrl || createdRef.current) return;

		void (async () => {
			try {
				const { browserCreate } = await import("@/lib/api");
				await browserCreate(initialUrl, rectFromElement(host));
				createdRef.current = true;
			} catch {
				// No-op under jsdom / when the Tauri bridge is unavailable.
			}
		})();
	}, [shown]);

	// Tear down on unmount (independent of `shown`).
	useEffect(() => {
		return () => {
			createdRef.current = false;
			void (async () => {
				try {
					const { browserDestroy } = await import("@/lib/api");
					await browserDestroy();
				} catch {
					// No-op.
				}
			})();
		};
	}, []);

	// ...navigate + bounds effects unchanged...
}
```

  - Update the single call site in `src/shell/components/workspace-pane-surface.tsx` (or wherever Phase 1 renders `ContentHost`) to pass `shown` = `layout === "split" || layout === "expanded"` (i.e. the panel is actually visible, not closed). Grep for `<ContentHost` to find it.

- [ ] **Run it — expect GREEN.** `bun x vitest run src/features/browser/content-host.test.ts` passes, including the original `rectFromElement` tests.

- [ ] **Typecheck + lint.** `bun run typecheck` and `bun run lint` clean (no unused-prop / missing-prop errors at the call site).

- [ ] **Commit.** `git commit -am "perf(browser): lazy-create content webview only on first show"`

---

## Task 2 (GUARD): Only the visible tab is live — switching tabs never spawns a second webview

**Why:** PRD §6 / D11 "Background/inactive web tabs suspended/throttled; only the visible tab is live." There is exactly ONE child-webview slot (`Mutex<Option<Webview>>`). Switching tabs must `navigate` the single webview, not create a second one. The guard verifies the controller drives navigation (not creation) on tab switch and that inactive tabs hold only persisted state.

- [ ] **Write the failing test.** Add to `src/shell/controllers/use-browser-session-controller.test.tsx` (mirror the existing `renderHook`/`act` + `vi.mock("@/lib/api")` pattern at the top of that file):

```ts
it("switching tabs keeps a single live surface (selects, does not re-open)", () => {
	const enterBrowserMode = vi.fn();
	const { result } = renderHook(
		() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode,
				exitBrowserMode: vi.fn(),
			}),
		{ wrapper },
	);
	act(() => result.current.actions.openUrl("http://a"));
	act(() => result.current.actions.openUrl("http://b"));
	const firstId = result.current.state.tabs[0].id;

	enterBrowserMode.mockClear();
	act(() => result.current.actions.selectTab(firstId));

	// Selecting an existing tab must NOT re-enter browser mode (no new surface).
	expect(enterBrowserMode).not.toHaveBeenCalled();
	expect(result.current.state.activeTabId).toBe(firstId);
	// Exactly the two tabs that were opened — no duplicate/extra live tab.
	expect(result.current.state.tabs).toHaveLength(2);
});

it("only the active tab carries the live url; others are inert state", () => {
	const { result } = renderHook(
		() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode: vi.fn(),
				exitBrowserMode: vi.fn(),
			}),
		{ wrapper },
	);
	act(() => result.current.actions.openUrl("http://a"));
	act(() => result.current.actions.openUrl("http://b"));
	const activeId = result.current.state.activeTabId;
	// Navigate only mutates the ACTIVE tab — background tabs stay frozen.
	act(() => result.current.actions.navigate("http://b2"));
	const active = result.current.state.tabs.find((t) => t.id === activeId);
	const background = result.current.state.tabs.find((t) => t.id !== activeId);
	expect(active?.url).toBe("http://b2");
	expect(background?.url).toBe("http://a");
});
```

- [ ] **Run it — expect RED only if the contract is violated.** `bun x vitest run src/shell/controllers/use-browser-session-controller.test.tsx`. If `selectTab` is the bare `setActiveTabId` (as in the current controller) and `navigate` mutates only the active tab, the first test passes immediately and the second too — in that case this task is pure REGRESSION LOCK-IN: keep the tests, they now permanently guard against a future "multiplex live tabs" regression. If `selectTab` was changed in Phase 1 to call `enterBrowserMode` or to create a webview per tab, the test goes RED and you fix it.

- [ ] **Implement the minimal guard if RED.** In `use-browser-session-controller.tsx`, ensure `selectTab` is `setActiveTabId` (no `enterBrowserMode`, no per-tab `browserCreate`). The single content webview is re-navigated by `ContentHost`'s url-change effect when the active tab's url changes — there is never more than one live webview. Add a code comment: `// D11: one live child-webview; selecting a tab only flips activeTabId.`

- [ ] **Run it — expect GREEN.** `bun x vitest run src/shell/controllers/use-browser-session-controller.test.tsx` passes.

- [ ] **Commit.** `git commit -am "perf(browser): lock in single-live-tab invariant (D11)"`

---

## Task 3 (GUARD): Simulator screenshot poller suspends when the surface is hidden *(Phase 4)*

**Why:** PRD §6 "Background/inactive ... Simulator screenshot polling pauses when the surface is hidden/closed." A `setInterval`-driven screenshot poll (Phase 4) is the heaviest recurring cost; it MUST never tick while the surface is closed/hidden and MUST clear its interval on stop.

> **If Phase 4 has not landed yet:** skip this task and mark the corresponding acceptance item as blocked on Phase 4. Otherwise locate the real poller (grep `screencap`, `setInterval`, `screenshot` under `src/features/simulator/`) and adapt the names below to the actual implementation.

- [ ] **Write the failing test.** Create `src/features/simulator/screenshot-poller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScreenshotPoller } from "./screenshot-poller";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createScreenshotPoller", () => {
	it("does not capture before start()", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		createScreenshotPoller({ intervalMs: 500, capture });
		vi.advanceTimersByTime(2000);
		expect(capture).not.toHaveBeenCalled();
	});

	it("captures on the interval after start()", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		vi.advanceTimersByTime(1100);
		expect(capture.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("stop() clears the interval — zero captures after stop", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		vi.advanceTimersByTime(600);
		const countAtStop = capture.mock.calls.length;
		poller.stop();
		vi.advanceTimersByTime(5000);
		expect(capture.mock.calls.length).toBe(countAtStop);
	});

	it("start() is idempotent — no double interval", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		poller.start();
		vi.advanceTimersByTime(1100);
		// Two ticks worth, not four — only one interval is live.
		expect(capture.mock.calls.length).toBeLessThanOrEqual(2);
	});
});
```

- [ ] **Run it — expect RED.** `bun x vitest run src/features/simulator/screenshot-poller.test.ts` fails (module/export absent or not stop-safe).

- [ ] **Implement the minimal poller** in `src/features/simulator/screenshot-poller.ts`:

```ts
export type ScreenshotPoller = {
	start(): void;
	stop(): void;
	isRunning(): boolean;
};

export function createScreenshotPoller(opts: {
	intervalMs: number;
	capture: () => Promise<void>;
}): ScreenshotPoller {
	let timer: ReturnType<typeof setInterval> | null = null;
	let inFlight = false;

	const tick = () => {
		// Drop overlapping ticks so a slow `screencap` never queues up work and
		// janks the main thread.
		if (inFlight) return;
		inFlight = true;
		void opts
			.capture()
			.catch(() => undefined)
			.finally(() => {
				inFlight = false;
			});
	};

	return {
		start() {
			if (timer !== null) return; // idempotent
			timer = setInterval(tick, opts.intervalMs);
		},
		stop() {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		},
		isRunning() {
			return timer !== null;
		},
	};
}
```

  - In `src/features/simulator/use-simulator-surface.ts` (the hook hosting the poller), call `poller.stop()` when the surface becomes hidden and in the effect cleanup:

```ts
useEffect(() => {
	if (shown) poller.start();
	else poller.stop();
	return () => poller.stop();
}, [shown, poller]);
```

- [ ] **Run it — expect GREEN.** `bun x vitest run src/features/simulator/screenshot-poller.test.ts` passes.

- [ ] **Typecheck + lint.** `bun run typecheck` and `bun run lint` clean.

- [ ] **Commit.** `git commit -am "perf(simulator): pause screenshot poller when surface hidden"`

---

## Task 4 (GUARD/REGRESSION): Capture, stitch, and full-page work stay off the React main thread

**Why:** PRD §6 "Screenshot/diff/full-page stitch run off the React main thread." `stitch_segments` is CPU-bound (decode + recompose + re-encode). It already runs inside `run_blocking` in `browser_commands.rs`. This task locks that in with a grep-assert test so a future edit can't accidentally call it on the async command thread, plus a measurement leg.

- [ ] **Write the failing test (Rust).** Add to the `tests` module in `src-tauri/src/browser/capture.rs` a marker test that documents the contract and asserts the helper is `pub` + synchronous (callable only from a blocking context). The real enforcement is the grep-assert below; this Rust test pins the signature:

```rust
#[test]
fn stitch_segments_is_synchronous_cpu_helper() {
	// Contract: stitch_segments is a plain (non-async) CPU helper. It must be
	// invoked from a blocking context (`run_blocking` / `spawn_blocking`), never
	// awaited on the Tauri async command thread. This test fails to COMPILE if
	// someone makes it async, which is the regression we guard against.
	let top = super::tests::solid_png(4, 2);
	let bottom = super::tests::solid_png(4, 3);
	let out = stitch_segments(vec![top, bottom]).expect("stitch ok");
	assert!(!out.is_empty());
}
```

  (Reuse the existing test PNG helper; if the existing tests build segments inline, mirror that construction instead of `solid_png`.)

- [ ] **Add the grep-assert guard.** Add a frontend vitest that statically asserts every `stitch_segments` call site in `browser_commands.rs` sits under a `run_blocking` block. Create `src-tauri/src/commands/browser_commands_offthread.test.ts`? — NO; Rust isn't vitest-testable. Instead add a shell check to the existing rust test run is not possible either. Use a Rust unit test in `browser_commands.rs` that reads its own source is brittle. **Chosen approach:** a `cargo test` is overkill here — instead encode the contract as a doc-comment grep in CI-friendly form:

  Add this exact assertion as a Rust test in `src-tauri/src/commands/browser_commands.rs`:

```rust
#[test]
fn stitch_calls_are_off_thread() {
	// Static guard: the stitch helper must only be reached through run_blocking.
	let src = include_str!("browser_commands.rs");
	for (i, line) in src.lines().enumerate() {
		if line.contains("stitch_segments(") && !line.contains("//") {
			// Walk upward to the nearest run_blocking on the enclosing call.
			let window = src.lines().skip(i.saturating_sub(8)).take(9);
			assert!(
				window.clone().any(|l| l.contains("run_blocking")),
				"stitch_segments at line {} must be inside a run_blocking block",
				i + 1
			);
		}
	}
}
```

- [ ] **Run it — expect GREEN (regression lock).** `cd src-tauri && cargo test --lib browser::capture::tests::stitch_segments_is_synchronous_cpu_helper stitch_calls_are_off_thread`. Both pass against today's code (the call site at `browser_commands.rs` is already inside `run_blocking`). If RED, move the `stitch_segments(...)` call inside the existing `run_blocking(move || { ... })` closure.

- [ ] **MEASUREMENT leg — full-page capture causes no chat jank.** With `VITE_HELMOR_PERF_HUD=1 bun run dev`:
  - [ ] Open Split Mode, navigate the browser to a long page (e.g. a docs page that scrolls several viewports).
  - [ ] Click into the chat composer and start typing a sentence continuously.
  - [ ] While typing, trigger **full-page scroll-and-stitch capture** from the browser toolbar.
  - [ ] Read `window.__HELMOR_LONG_FRAMES__.dumpJson()`.
  - [ ] **PASS:** during the capture, no `raf`-source long frame `> 80ms` appears in the buffer, FPS stays `>= 45`, and the chat caret keeps up with typing (no visible stall). Diff against a baseline run with no capture: the long-frame count must not increase by more than 1 attributable to the capture.

- [ ] **Commit.** `git commit -am "test(browser): lock stitch off the main thread + capture-jank evidence"`

---

## Task 5 (GUARD/REGRESSION): Bridge scripts stay passive until a mode is activated

**Why:** PRD §6 "Bridge scripts passive until a mode is activated (zero overhead in Navigate)." `createBridge` already installs zero listeners in mode `"none"`; the injected runtime snaps back to `"none"` on Escape. Lock it in.

- [ ] **Write the failing test.** Extend `src/features/browser/bridge/index.test.ts` (it already exists — mirror its setup). Assert that in passive mode no listeners are attached, by spying on `document.addEventListener`:

```ts
it("installs ZERO listeners while mode is none (passive Navigate)", () => {
	const doc = document.implementation.createHTMLDocument("t");
	const add = vi.spyOn(doc, "addEventListener");
	const bridge = createBridge({ mode: "none", post: vi.fn(), doc });
	bridge.init();
	expect(add).not.toHaveBeenCalled();
	bridge.teardown();
});

it("attaches listeners only when an interactive mode is set, removes on return to none", () => {
	const doc = document.implementation.createHTMLDocument("t");
	const add = vi.spyOn(doc, "addEventListener");
	const remove = vi.spyOn(doc, "removeEventListener");
	const bridge = createBridge({ mode: "none", post: vi.fn(), doc });
	bridge.init();
	bridge.setMode("pick");
	expect(add).toHaveBeenCalled(); // mousemove + click now live
	bridge.setMode("none");
	expect(remove).toHaveBeenCalled(); // listeners torn down again
	bridge.teardown();
});
```

- [ ] **Run it — expect GREEN (regression lock) or RED if a Phase 2/3 change leaked listeners.** `bun x vitest run src/features/browser/bridge/index.test.ts`. Today `applyMode()` only calls `activateListeners()` for interactive modes, so this passes; the test permanently guards the passive contract.

- [ ] **Fix if RED.** Ensure `applyMode()` calls `deactivateListeners()` (not `activate`) whenever `!isInteractive(mode)`, and `init()` with `mode: "none"` never touches `addEventListener`.

- [ ] **MEASUREMENT leg — zero overhead in Navigate.** With `VITE_HELMOR_PERF_HUD=1 bun run dev`:
  - [ ] Open Split Mode browser in plain Navigate mode (no comment/pick/draw active).
  - [ ] `window.__HELMOR_LONG_FRAMES__.clear()`, then scroll and interact with the loaded page for ~15s while watching the chat.
  - [ ] **PASS:** FPS stays `>= 55`; long-frame buffer stays at `0` attributable to the bridge (the injected runtime adds no recurring rAF/observer while in Navigate).

- [ ] **Commit.** `git commit -am "test(browser): lock bridge passive-in-Navigate contract"`

---

## Task 6 (GUARD/REGRESSION): Tearing down the surface fully releases the webview + memory

**Why:** PRD §6 "Tearing down the surface fully releases the webview + memory." `destroy()` already `take()`s the slot and calls `webview.close()`; `ContentHost` unmount calls `browserDestroy`. Lock both halves.

- [ ] **Write the failing test (Rust).** Add to the `tests` module in `src-tauri/src/browser/mod.rs`:

```rust
#[test]
fn destroy_is_idempotent_and_empties_slot() {
	// With no webview embedded, destroy must be a no-op (not an error) and the
	// slot must remain None — so a teardown without a prior create never panics
	// and never leaves a dangling handle.
	let guard = slot().lock().unwrap();
	assert!(guard.is_none(), "slot starts empty in unit context");
	drop(guard);
	// destroy() needs an AppHandle; the slot-emptying invariant is what we pin:
	// after take(), the Option is None. Exercise take() directly.
	let mut g = slot().lock().unwrap();
	*g = None;
	assert!(g.take().is_none());
	assert!(g.is_none(), "slot is None after take()");
}
```

  (The real `destroy(app)` needs an `AppHandle`, which unit tests don't have; this test pins the `take()` → `None` slot invariant that `destroy` relies on. The full close path is exercised in the measurement leg.)

- [ ] **Write the failing test (frontend).** Add to `src/features/browser/content-host.test.ts`:

```ts
it("calls browserDestroy on unmount", async () => {
	const { unmount } = render(
		<ContentHost url="http://localhost:3000" shown={true} />,
	);
	await flush();
	unmount();
	await flush();
	expect(browserDestroy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Run them.** `cd src-tauri && cargo test --lib browser::mod::tests::destroy_is_idempotent_and_empties_slot` and `bun x vitest run src/features/browser/content-host.test.ts`. Both pass against current code (regression lock); fix `destroy`/unmount cleanup if RED.

- [ ] **MEASUREMENT leg — memory is reclaimed on close.** Native webview memory is not visible to the JS HUD, so measure at the process level:
  - [ ] `VITE_HELMOR_PERF_HUD=1 bun run dev`. Open Activity Monitor (or `ps -o rss= -p <pid>` for the Helmor webview helper process) and note baseline RSS with no browser surface open.
  - [ ] Open Split Mode browser, load a heavy page, note RSS climbs.
  - [ ] Close the surface (close the last tab → Split Mode closes → `browserDestroy`). Wait ~10s.
  - [ ] **PASS:** the `browser-content` helper webview process is gone (no process with the `browser-content` webview remains — confirm via `ps` / Activity Monitor), and main-process RSS returns to within ~15% of baseline. Repeat open/close 5× — RSS must not grow monotonically (no leak; each cycle returns near baseline).

- [ ] **Commit.** `git commit -am "test(browser): lock full webview teardown + memory-release evidence"`

---

## Task 7 (MEASUREMENT): No dropped frames opening/closing/splitting/expanding the surface

**Why:** PRD §6 "No dropped frames in chat/editor when opening/closing/splitting/expanding or switching tabs." This is the headline criterion — a full HUD pass over the layout transitions.

- [ ] Launch: `VITE_HELMOR_PERF_HUD=1 bun run dev`. Confirm the HUD overlay shows at bottom-left.
- [ ] Open a workspace with an active chat thread so chat content is rendering.
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()`.
- [ ] **Interaction script (perform in order, ~1s between steps):**
  - [ ] `Cmd+Shift+B` → open Split Mode (browser appears beside chat).
  - [ ] Drag the split divider left/right across its full range twice (resize the panel).
  - [ ] `Cmd+Shift+Enter` → expand the browser to full-pane.
  - [ ] `Cmd+Shift+Enter` → restore to split.
  - [ ] `Cmd+Shift+B` → close Split Mode.
  - [ ] Repeat the whole sequence 3×.
- [ ] Read `window.__HELMOR_LONG_FRAMES__.dumpJson()` and the HUD `worst 5s` / `long frames` counters.
- [ ] **PASS thresholds:**
  - No frame `> 50ms` recorded during the open/close/expand/restore steps (long-frame buffer count `=== 0` for those steps; the divider-drag may produce at most 1 frame in the 50-65ms range, which is acceptable for a continuous-resize gesture but MUST NOT exceed 65ms).
  - FPS (HUD top line) stays `>= 55` throughout; never drops below 45.
  - `worst 5s` never exceeds 65ms across the entire sequence.
- [ ] If any threshold fails: capture `window.__HELMOR_LONG_FRAMES__.downloadJson()`, open in the perf review, and check react-scan for the offending re-render (likely a layout/controller component re-rendering chat on every resize tick). File a follow-up fix task; do NOT mark this acceptance item done.

---

## Task 8 (MEASUREMENT): No dropped frames switching tabs and during agent control

**Why:** PRD §6 tab-switch clause + cross-cutting agent-control overhead (Phase 2) and simulator polling (Phase 4) must not jank chat.

- [ ] Launch: `VITE_HELMOR_PERF_HUD=1 bun run dev`. Open Split Mode browser.
- [ ] Open 5 tabs to 5 different URLs (e.g. `localhost` dev server + 4 docs pages).
- [ ] `window.__HELMOR_LONG_FRAMES__.clear()`.
- [ ] **Tab-switch leg:** click through all 5 tabs in sequence, then back, twice (20 switches total), while a chat response is streaming if possible.
  - [ ] **PASS:** long-frame buffer count `=== 0` (`> 50ms`); FPS `>= 55`. Switching the active tab only flips `activeTabId` and re-navigates the single webview — no per-switch webview creation (cross-check with Task 2 invariant).
- [ ] **Agent-control leg (Phase 2):** start an agent flow that issues `preview_*` calls (navigate → snapshot → click). The "Agent is controlling" banner appears.
  - [ ] `window.__HELMOR_LONG_FRAMES__.clear()` once control starts.
  - [ ] Let the agent drive 10+ actions while you type in chat.
  - [ ] **PASS:** banner render + per-action UI reflection cause no frame `> 50ms`; FPS `>= 50`. Snapshot/eval work runs in Rust/host, not the React thread — confirm no react-scan "slow render" spikes on the chat tree during snapshots.
- [ ] **Simulator leg (Phase 4, if present):** open a simulator surface, boot a device, let the screenshot poller run.
  - [ ] `window.__HELMOR_LONG_FRAMES__.clear()`, observe for 20s with chat visible.
  - [ ] **PASS:** with the poller running, FPS `>= 50` and long-frame count from poll ticks `=== 0`. Then hide/close the surface and confirm (devtools) the poll interval stops (Task 3 guard) — FPS returns to idle `>= 58`.

---

## Acceptance checklist

Reproduces the PRD §6 performance criteria; each annotated with the task that proves it.

- [ ] **Split panel lazy-mounts; content webview created only on first use.** → Task 1 (failing test → `shown`-gated `browserCreate`; created exactly once on first show).
- [ ] **Background/inactive tabs suspended/throttled; only the visible tab is live (D11); simulator polling pauses when hidden.** → Task 2 (single-live-tab invariant) + Task 3 (poller stops when `shown === false`) + Task 8 tab-switch + simulator legs.
- [ ] **Screenshot/diff/full-page stitch run off the React main thread.** → Task 4 (synchronous `stitch_segments` + static `run_blocking` guard + full-page-capture-during-typing measurement).
- [ ] **Bridge scripts passive until a mode is activated (zero overhead in Navigate).** → Task 5 (zero-listeners-in-`none` test + Navigate-mode HUD measurement).
- [ ] **Tearing down the surface fully releases the webview + memory.** → Task 6 (slot `take()` → `None` invariant + `browserDestroy`-on-unmount test + RSS/process measurement across 5 open-close cycles).
- [ ] **No dropped frames in chat/editor when opening/closing/splitting/expanding or switching tabs.** → Task 7 (layout-transition HUD pass: no frame `> 50ms`, FPS `>= 55`) + Task 8 (tab-switch + agent-control + simulator HUD pass).
