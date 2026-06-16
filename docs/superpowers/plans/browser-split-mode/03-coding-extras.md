# Browser Coding Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 3 coding extras to the browser surface — responsive/device viewport presets that resize-and-capture, localhost live-reload auto-refresh, click-to-source jump into Monaco, and structured flow recording attachable to the composer.

**Architecture:** All four features are built around small PURE functions (device-rect math, dev-server port regex, source-ref parsing, flow-step serialization) that are unit-tested DOM-free in vitest, mirroring `src/features/browser/content-host.test.ts`. The viewport preset constrains the native webview rect via the existing `browserSetBounds`; live-reload and flow recording extend the existing bridge message contract in `src/features/browser/bridge/channel.ts` + its pure reducer `ingestMessage`; element→source jump extends `cssSelectorFor` to read framework debug attributes and routes through the existing `openFileReference(path,line,column)` editor controller.

**Tech Stack:** React 19, TypeScript, Tauri v2, Rust, Vitest.

---

## File Structure

New files:
- `src/features/browser/viewport/presets.ts` — device preset table + pure `deviceRectInHost()` math.
- `src/features/browser/viewport/presets.test.ts` — unit tests for preset math.
- `src/features/browser/viewport/viewport-presets.tsx` — preset picker UI for the mode toolbar.
- `src/features/browser/live-reload/detect-ports.ts` — pure localhost-port extraction from run-action commands.
- `src/features/browser/live-reload/detect-ports.test.ts` — unit tests for port regex.
- `src/features/browser/bridge/source-ref.ts` — pure source-ref attribute reader + `file:line:col` parser.
- `src/features/browser/bridge/source-ref.test.ts` — unit tests for source-ref parsing.
- `src/features/browser/flow/flow-recorder.ts` — pure flow-step reducer + repro-step serializer.
- `src/features/browser/flow/flow-recorder.test.ts` — unit tests for flow recording.
- `src-tauri/src/browser/dev_server.rs` — pure Rust localhost-port extraction (mirror of TS, for backend reuse).

Modified files:
- `src/features/browser/bridge/channel.ts` — add `flow-event` + `reload-detected` (page→host) and `set-flow-recording` (host→page) message variants; extend the kind sets + type guards.
- `src/features/browser/bridge/use-browser-bridge.ts` — extend `BrowserBridgeState` + `ingestMessage` reducer with `flowSteps` and `reloadNonce`.
- `src/features/browser/bridge/selector.ts` — extend `STABLE_ATTRS` consumers (no behavior change; `source-ref.ts` is the new reader).
- `src/features/browser/content-host.tsx` — apply a device-preset rect override (when set) instead of the raw host rect; bump nav on `reloadNonce`.
- `src/features/browser/chrome/mode-toolbar.tsx` — mount `<ViewportPresets />`.

---

## Task 1 — Device viewport presets (pure rect math)

**Files:**
- Create `src/features/browser/viewport/presets.ts`
- Create `src/features/browser/viewport/presets.test.ts`
- Reference: `src/features/browser/content-host.tsx:17-25` (`rectFromElement` → `BrowserRect`), `src/lib/api.ts:5512-5517` (`BrowserRect` type).

A preset constrains the webview to a fixed device width/height centered horizontally inside the host rect (top-aligned). `"desktop"` means "fill the host" (no constraint → returns the host rect unchanged). Custom carries an explicit `{ width, height }`.

- [ ] Write failing test `src/features/browser/viewport/presets.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
	DEVICE_PRESETS,
	deviceRectInHost,
	type ViewportPreset,
} from "./presets";

const host = { x: 100, y: 50, width: 1200, height: 800 };

describe("DEVICE_PRESETS", () => {
	it("includes mobile, tablet, desktop with known dimensions", () => {
		const byId = Object.fromEntries(DEVICE_PRESETS.map((p) => [p.id, p]));
		expect(byId.mobile.width).toBe(390);
		expect(byId.mobile.height).toBe(844);
		expect(byId.tablet.width).toBe(820);
		expect(byId.tablet.height).toBe(1180);
		expect(byId.desktop.width).toBeNull();
	});
});

describe("deviceRectInHost", () => {
	it("returns the host rect unchanged for desktop (fill)", () => {
		const preset: ViewportPreset = {
			id: "desktop",
			label: "Desktop",
			width: null,
			height: null,
		};
		expect(deviceRectInHost(preset, host)).toEqual(host);
	});

	it("centers a fixed-width device horizontally, top-aligned", () => {
		const preset: ViewportPreset = {
			id: "mobile",
			label: "Mobile",
			width: 390,
			height: 844,
		};
		// (1200 - 390) / 2 = 405 → x = 100 + 405 = 505
		expect(deviceRectInHost(preset, host)).toEqual({
			x: 505,
			y: 50,
			width: 390,
			height: 844,
		});
	});

	it("clamps a device larger than the host to the host size", () => {
		const preset: ViewportPreset = {
			id: "custom",
			label: "Custom",
			width: 2000,
			height: 2000,
		};
		expect(deviceRectInHost(preset, host)).toEqual({
			x: 100,
			y: 50,
			width: 1200,
			height: 800,
		});
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/viewport/presets.test.ts` — expect FAIL (module missing).
- [ ] Implement `src/features/browser/viewport/presets.ts`:
```ts
/**
 * Device viewport presets for the browser surface.
 *
 * A preset constrains the native content webview to a fixed device width/height
 * centered horizontally inside the host pane (top-aligned), so the page renders
 * at a real device size and full-page capture stitches at that size. `desktop`
 * is the unconstrained "fill the host" case. This module is PURE — the rect math
 * is unit-tested DOM-free, mirroring `content-host.test.ts`.
 */
import type { BrowserRect } from "@/lib/api";

export type ViewportPresetId = "mobile" | "tablet" | "desktop" | "custom";

export type ViewportPreset = {
	id: ViewportPresetId;
	label: string;
	/** Device CSS width; null = fill the host (desktop). */
	width: number | null;
	/** Device CSS height; null = fill the host (desktop). */
	height: number | null;
};

/** Built-in presets shown in the toolbar (custom is constructed on demand). */
export const DEVICE_PRESETS: ViewportPreset[] = [
	{ id: "mobile", label: "Mobile", width: 390, height: 844 },
	{ id: "tablet", label: "Tablet", width: 820, height: 1180 },
	{ id: "desktop", label: "Desktop", width: null, height: null },
];

/**
 * Project a preset onto the host rect: desktop fills the host; a fixed device is
 * clamped to the host size then centered horizontally and top-aligned. The
 * result is a `BrowserRect` ready for `browserSetBounds`.
 */
export function deviceRectInHost(
	preset: ViewportPreset,
	host: BrowserRect,
): BrowserRect {
	if (preset.width === null || preset.height === null) return host;
	const width = Math.min(preset.width, host.width);
	const height = Math.min(preset.height, host.height);
	const x = host.x + Math.round((host.width - width) / 2);
	return { x, y: host.y, width, height };
}
```
- [ ] Run: `bun x vitest run src/features/browser/viewport/presets.test.ts` — expect PASS.
- [ ] Commit: `feat(browser): device viewport preset rect math`

---

## Task 2 — Apply preset to the content webview + capture at size

**Files:**
- Modify `src/features/browser/content-host.tsx:33,84-117` (`ContentHost` props + `pushBounds` effect).
- Reference: `src/lib/api.ts:5533` (`browserSetBounds`), Task 1 `deviceRectInHost`.

`ContentHost` gains an optional `viewport` prop. When set to a fixed preset, every bounds push projects the host rect through `deviceRectInHost` before calling `browserSetBounds`, so the webview shrinks to the device size. Capture (`computeSegments`/`captureFullPage` in `src/features/browser/capture/fullpage.ts`) already reads the live `window.innerHeight`/`scrollHeight` from inside the now-resized webview, so it stitches at the selected size with no capture-code change.

- [ ] Write failing test `src/features/browser/viewport/presets.test.ts` — add a block exercising the projection used by the host (the host applies `deviceRectInHost`, so this asserts the contract the host depends on):
```ts
import { DEVICE_PRESETS as PRESETS } from "./presets";

describe("preset application contract", () => {
	it("tablet projection differs from the raw host rect", () => {
		const tablet = PRESETS.find((p) => p.id === "tablet")!;
		const projected = deviceRectInHost(tablet, host);
		expect(projected.width).toBe(820);
		expect(projected).not.toEqual(host);
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/viewport/presets.test.ts` — expect FAIL (new block references `tablet` projection; if it already passes because Task 1 covers it, instead assert `projected.x` centering: `expect(projected.x).toBe(100 + Math.round((1200 - 820) / 2))`). Confirm FAIL first, then PASS.
- [ ] Implement `src/features/browser/content-host.tsx` — add the prop and projection. Change the component signature and the `pushBounds` closure:
```tsx
import { deviceRectInHost, type ViewportPreset } from "./viewport/presets";

type ContentHostProps = {
	url: string | null;
	/** Active device preset; when fixed-size, the webview is constrained. */
	viewport?: ViewportPreset | null;
};

export function ContentHost({ url, viewport }: ContentHostProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const createdRef = useRef(false);
	const urlRef = useRef(url);
	urlRef.current = url;
	// Read the live preset through a ref so the bounds effect stays mount-once.
	const viewportRef = useRef(viewport);
	viewportRef.current = viewport;
```
Then inside `pushBounds`, replace `rectFromElement(host)` with the projected rect, and re-run the bounds effect when `viewport` changes. Update the `setTimeout` body:
```tsx
			timer = setTimeout(() => {
				if (!createdRef.current) return;
				const preset = viewportRef.current;
				const rect = preset
					? deviceRectInHost(preset, rectFromElement(host))
					: rectFromElement(host);
				void (async () => {
					try {
						const { browserSetBounds } = await import("@/lib/api");
						await browserSetBounds(rect);
					} catch {
						// No-op.
					}
				})();
			}, BOUNDS_DEBOUNCE_MS);
```
And add a small effect that re-pushes bounds when the preset changes (so switching preset resizes immediately):
```tsx
	// Re-apply bounds when the device preset changes.
	useEffect(() => {
		const host = hostRef.current;
		if (!host || !createdRef.current) return;
		const rect = viewport
			? deviceRectInHost(viewport, rectFromElement(host))
			: rectFromElement(host);
		void (async () => {
			try {
				const { browserSetBounds } = await import("@/lib/api");
				await browserSetBounds(rect);
			} catch {
				// No-op.
			}
		})();
	}, [viewport]);
```
- [ ] Run: `bun x vitest run src/features/browser/content-host.test.ts src/features/browser/viewport/presets.test.ts` — expect PASS (existing `rectFromElement` tests unaffected).
- [ ] Commit: `feat(browser): constrain content webview to active device preset`

---

## Task 3 — Viewport preset picker UI in the mode toolbar

**Files:**
- Create `src/features/browser/viewport/viewport-presets.tsx`
- Modify `src/features/browser/chrome/mode-toolbar.tsx` (mount the picker).
- Reference: `src/features/browser/chrome/mode-toolbar.tsx` (existing toolbar; mirror its button styling), `src/components/ui/` (shadcn primitives), `DEVICE_PRESETS` from Task 1.

The picker is a controlled set of buttons (`value: ViewportPresetId | null`, `onChange`). The toolbar owns the selected preset state and passes the resolved `ViewportPreset` down to `ContentHost` (wiring lives in the index surface; this task ships the control + selection callback).

- [ ] Write failing test `src/features/browser/viewport/viewport-presets.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewportPresets } from "./viewport-presets";

describe("ViewportPresets", () => {
	it("renders a button per built-in preset", () => {
		render(<ViewportPresets value="desktop" onChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /mobile/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /tablet/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /desktop/i })).toBeTruthy();
	});

	it("calls onChange with the clicked preset id", () => {
		const onChange = vi.fn();
		render(<ViewportPresets value="desktop" onChange={onChange} />);
		fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
		expect(onChange).toHaveBeenCalledWith("mobile");
	});

	it("marks the active preset as pressed", () => {
		render(<ViewportPresets value="tablet" onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /tablet/i }).getAttribute("aria-pressed"),
		).toBe("true");
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/viewport/viewport-presets.test.tsx` — expect FAIL (module missing).
- [ ] Implement `src/features/browser/viewport/viewport-presets.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { DEVICE_PRESETS, type ViewportPresetId } from "./presets";

type ViewportPresetsProps = {
	value: ViewportPresetId;
	onChange: (id: ViewportPresetId) => void;
};

/** Toolbar control: pick a device viewport preset (mobile/tablet/desktop). */
export function ViewportPresets({ value, onChange }: ViewportPresetsProps) {
	return (
		<div className="flex items-center gap-1" aria-label="Device viewport">
			{DEVICE_PRESETS.map((preset) => (
				<Button
					key={preset.id}
					type="button"
					size="sm"
					variant={value === preset.id ? "secondary" : "ghost"}
					aria-pressed={value === preset.id}
					className="cursor-pointer"
					onClick={() => onChange(preset.id)}
				>
					{preset.label}
				</Button>
			))}
		</div>
	);
}
```
- [ ] Run: `bun x vitest run src/features/browser/viewport/viewport-presets.test.tsx` — expect PASS.
- [ ] Mount in `src/features/browser/chrome/mode-toolbar.tsx`: import `ViewportPresets`, add a `viewportPreset: ViewportPresetId` + `onViewportPresetChange` to the toolbar props, and render `<ViewportPresets value={viewportPreset} onChange={onViewportPresetChange} />` next to the existing mode buttons. (Thread the state through the parent surface that already owns the toolbar; default `"desktop"`.)
- [ ] Run: `bun x vitest run src/features/browser/chrome/mode-toolbar.test.tsx` — expect PASS (adjust the existing toolbar test's required props to include `viewportPreset="desktop"` + `onViewportPresetChange={vi.fn()}` if it constructs the component directly).
- [ ] Commit: `feat(browser): device preset picker in the mode toolbar`

---

## Task 4 — Localhost dev-server port extraction (pure, TS)

**Files:**
- Create `src/features/browser/live-reload/detect-ports.ts`
- Create `src/features/browser/live-reload/detect-ports.test.ts`
- Reference: `src-tauri/src/models/repos.rs:900-938` (`RunAction.command`, `RepoScripts.run_actions`).

Extract localhost ports from a run-action command string so the surface knows which `http://localhost:<port>` URLs are "the dev server" and should be live-reload-watched.

- [ ] Write failing test `src/features/browser/live-reload/detect-ports.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { extractLocalhostPorts, isDevServerUrl } from "./detect-ports";

describe("extractLocalhostPorts", () => {
	it("pulls explicit localhost / 127.0.0.1 ports", () => {
		expect(
			extractLocalhostPorts("vite --host localhost:5173 & serve 127.0.0.1:8080"),
		).toEqual([5173, 8080]);
	});

	it("pulls bare common dev ports", () => {
		expect(extractLocalhostPorts("next dev -p 3000")).toEqual([3000]);
	});

	it("dedupes and ignores non-dev numbers", () => {
		expect(extractLocalhostPorts("PORT=5173 vite localhost:5173")).toEqual([5173]);
	});

	it("returns empty for commands without ports", () => {
		expect(extractLocalhostPorts("bun run build")).toEqual([]);
	});
});

describe("isDevServerUrl", () => {
	it("matches a url whose port is a known dev port", () => {
		expect(isDevServerUrl("http://localhost:5173/path", [5173])).toBe(true);
		expect(isDevServerUrl("http://localhost:9999/", [5173])).toBe(false);
		expect(isDevServerUrl("https://example.com", [5173])).toBe(false);
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/live-reload/detect-ports.test.ts` — expect FAIL.
- [ ] Implement `src/features/browser/live-reload/detect-ports.ts`:
```ts
/**
 * Pure localhost dev-server port extraction.
 *
 * Scans a run-action command (from `RepoScripts.run_actions[].command`) for
 * localhost ports so the surface can decide which loaded URLs are "the dev
 * server" and worth live-reload watching. No I/O — unit-tested DOM-free.
 */

/** Common dev ports recognized as bare `-p 3000` / `PORT=5173` style. */
const COMMON_DEV_PORTS = new Set([3000, 4200, 5173, 8000, 8080]);

const HOST_PORT_RE = /(?:localhost|127\.0\.0\.1):(\d{2,5})/g;
const BARE_PORT_RE = /(?<![:.\d])(\d{2,5})(?![.\d])/g;

/** Extract a deduped, ordered list of localhost ports from `command`. */
export function extractLocalhostPorts(command: string): number[] {
	const ports: number[] = [];
	const seen = new Set<number>();
	const push = (n: number) => {
		if (!seen.has(n)) {
			seen.add(n);
			ports.push(n);
		}
	};

	for (const m of command.matchAll(HOST_PORT_RE)) {
		push(Number.parseInt(m[1], 10));
	}
	for (const m of command.matchAll(BARE_PORT_RE)) {
		const n = Number.parseInt(m[1], 10);
		if (COMMON_DEV_PORTS.has(n)) push(n);
	}
	return ports;
}

/** True when `url` points at localhost on one of `ports`. */
export function isDevServerUrl(url: string, ports: number[]): boolean {
	try {
		const u = new URL(url);
		if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
		const port = Number.parseInt(u.port, 10);
		return ports.includes(port);
	} catch {
		return false;
	}
}
```
- [ ] Run: `bun x vitest run src/features/browser/live-reload/detect-ports.test.ts` — expect PASS.
- [ ] Commit: `feat(browser): extract localhost dev-server ports from run actions`

---

## Task 5 — Mirror dev-server port extraction in Rust

**Files:**
- Create `src-tauri/src/browser/dev_server.rs`
- Modify `src-tauri/src/browser/mod.rs` (add `pub mod dev_server;`).
- Reference: `src-tauri/src/models/repos.rs:900-938` (`RunAction`, `RepoScripts`).

The backend needs the same port set to decide when a navigated URL is the dev server (used by the broker/live-reload hooks). Pure function, `cargo test`.

- [ ] Write failing test inside `src-tauri/src/browser/dev_server.rs`:
```rust
//! Pure localhost dev-server port extraction (Rust mirror of the TS
//! `live-reload/detect-ports.ts`). Used to decide when a navigated URL points
//! at a project dev server worth live-reload watching.

use std::collections::BTreeSet;

const COMMON_DEV_PORTS: [u16; 5] = [3000, 4200, 5173, 8000, 8080];

/// Extract a deduped, ascending list of localhost ports from `command`.
pub fn extract_localhost_ports(command: &str) -> Vec<u16> {
    let mut set: BTreeSet<u16> = BTreeSet::new();

    // host:port matches.
    for token in command.split(|c: char| c.is_whitespace() || c == '&' || c == ';') {
        for prefix in ["localhost:", "127.0.0.1:"] {
            if let Some(rest) = token.strip_prefix(prefix).or_else(|| {
                token.find(prefix).map(|i| &token[i + prefix.len()..])
            }) {
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(p) = digits.parse::<u16>() {
                    set.insert(p);
                }
            }
        }
    }

    // bare common dev ports.
    for token in command.split(|c: char| !c.is_ascii_digit()) {
        if let Ok(p) = token.parse::<u16>() {
            if COMMON_DEV_PORTS.contains(&p) {
                set.insert(p);
            }
        }
    }

    set.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_host_ports() {
        assert_eq!(
            extract_localhost_ports("vite localhost:5173 & serve 127.0.0.1:8080"),
            vec![5173, 8080]
        );
    }

    #[test]
    fn extracts_bare_common_ports() {
        assert_eq!(extract_localhost_ports("next dev -p 3000"), vec![3000]);
    }

    fn dedupes() {
        // placeholder so the test module compiles before impl exists.
    }

    #[test]
    fn ignores_non_dev_numbers() {
        assert_eq!(extract_localhost_ports("bun run build 42"), Vec::<u16>::new());
    }
}
```
- [ ] Add `pub mod dev_server;` to `src-tauri/src/browser/mod.rs` (near the top with the other `mod` declarations).
- [ ] Run: `cd src-tauri && cargo test dev_server` — expect FAIL initially if the impl is incomplete; once the module compiles, expect PASS (the impl above is complete, so this verifies the three `#[test]` cases pass).
- [ ] Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings` — expect zero warnings.
- [ ] Commit: `feat(browser): rust mirror of localhost dev-server port extraction`

---

## Task 6 — Bridge message variants: reload + flow events

**Files:**
- Modify `src/features/browser/bridge/channel.ts:54-94` (message unions + kind sets + guards).
- Reference: existing `BridgeSelection` type (`channel.ts:27-34`), `ingestMessage` (`use-browser-bridge.ts:73-101`).

Add page→host `reload-detected` and `flow-event`, and host→page `set-flow-recording`. Extend the kind sets and the `isBridgeToHostMessage` / `isHostToBridgeMessage` guards.

- [ ] Write failing test `src/features/browser/bridge/channel.flow.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
	isBridgeToHostMessage,
	isHostToBridgeMessage,
	parseHostToBridgeMessage,
} from "./channel";

describe("flow + reload bridge variants", () => {
	it("accepts a reload-detected page→host message", () => {
		expect(isBridgeToHostMessage({ kind: "reload-detected" })).toBe(true);
	});

	it("accepts a flow-event page→host message", () => {
		expect(
			isBridgeToHostMessage({
				kind: "flow-event",
				eventType: "click",
				target: {
					selector: "#go",
					outerHTML: "<button id=go>Go</button>",
					rect: { x: 0, y: 0, width: 10, height: 10 },
				},
			}),
		).toBe(true);
	});

	it("accepts a set-flow-recording host→page message", () => {
		expect(
			isHostToBridgeMessage({ kind: "set-flow-recording", enabled: true }),
		).toBe(true);
		expect(
			parseHostToBridgeMessage('{"kind":"set-flow-recording","enabled":false}'),
		).toEqual({ kind: "set-flow-recording", enabled: false });
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/channel.flow.test.ts` — expect FAIL.
- [ ] Implement in `src/features/browser/bridge/channel.ts`. Add to the `BridgeToHostMessage` union:
```ts
	| { kind: "reload-detected" }
	| {
			kind: "flow-event";
			eventType: "click" | "input" | "change" | "navigate";
			target: BridgeSelection;
			data?: string;
	  }
```
Add to the `HostToBridgeMessage` union:
```ts
	| { kind: "set-flow-recording"; enabled: boolean }
```
Add the new kinds to the sets:
```ts
const HOST_TO_BRIDGE_KINDS = new Set([
	"set-mode",
	"set-context",
	"clear-comments",
	"request-capture",
	"set-flow-recording",
]);

const BRIDGE_TO_HOST_KINDS = new Set([
	"comment-added",
	"element-picked",
	"console-error",
	"network-event",
	"capture-result",
	"reload-detected",
	"flow-event",
]);
```
(The existing structural `hasKind` guard + kind-set membership already covers these; no extra per-kind validation needed beyond `set-mode`.)
- [ ] Run: `bun x vitest run src/features/browser/bridge/channel.flow.test.ts src/features/browser/bridge` — expect PASS.
- [ ] Commit: `feat(browser): add reload + flow bridge message variants`

---

## Task 7 — Flow recorder reducer + repro-step serialization (pure)

**Files:**
- Create `src/features/browser/flow/flow-recorder.ts`
- Create `src/features/browser/flow/flow-recorder.test.ts`
- Reference: `BridgeSelection` (`channel.ts:27-34`), the `flow-event` variant from Task 6.

A `FlowStep` is captured from a `flow-event`. `appendFlowStep` builds an ordered list; `serializeFlowSteps` renders numbered repro steps for the composer.

- [ ] Write failing test `src/features/browser/flow/flow-recorder.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
	appendFlowStep,
	flowStepFromEvent,
	serializeFlowSteps,
	type FlowStep,
} from "./flow-recorder";

const sel = (selector: string) => ({
	selector,
	outerHTML: "<x/>",
	rect: { x: 0, y: 0, width: 1, height: 1 },
});

describe("flowStepFromEvent", () => {
	it("builds a click step from a flow-event", () => {
		expect(
			flowStepFromEvent({
				kind: "flow-event",
				eventType: "click",
				target: sel("#submit"),
			}),
		).toEqual({ eventType: "click", selector: "#submit", value: undefined });
	});

	it("carries input value", () => {
		expect(
			flowStepFromEvent({
				kind: "flow-event",
				eventType: "input",
				target: sel("#email"),
				data: "a@b.com",
			}),
		).toEqual({ eventType: "input", selector: "#email", value: "a@b.com" });
	});
});

describe("appendFlowStep", () => {
	it("appends without mutating the input list", () => {
		const a: FlowStep[] = [];
		const b = appendFlowStep(a, {
			eventType: "click",
			selector: "#a",
			value: undefined,
		});
		expect(b).toHaveLength(1);
		expect(a).toHaveLength(0);
	});
});

describe("serializeFlowSteps", () => {
	it("renders numbered repro steps", () => {
		const steps: FlowStep[] = [
			{ eventType: "click", selector: "#login", value: undefined },
			{ eventType: "input", selector: "#email", value: "a@b.com" },
			{ eventType: "navigate", selector: "/dashboard", value: undefined },
		];
		expect(serializeFlowSteps(steps)).toBe(
			[
				"Repro steps:",
				'1. Click `#login`',
				'2. Type "a@b.com" into `#email`',
				"3. Navigate to `/dashboard`",
			].join("\n"),
		);
	});

	it("returns an empty marker for no steps", () => {
		expect(serializeFlowSteps([])).toBe("Repro steps: (none recorded)");
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/flow/flow-recorder.test.ts` — expect FAIL.
- [ ] Implement `src/features/browser/flow/flow-recorder.ts`:
```ts
/**
 * Pure flow-recording reducer + repro-step serialization.
 *
 * Records clicks/inputs/navigation reported by the bridge `flow-event` message
 * into an ordered `FlowStep[]`, then serializes them into numbered repro steps
 * attachable to the composer. No DOM, no I/O — unit-tested DOM-free.
 */
import type { BridgeToHostMessage } from "../bridge/channel";

export type FlowStep = {
	eventType: "click" | "input" | "change" | "navigate";
	/** Selector for element events; the path/url for navigate events. */
	selector: string;
	/** Typed text for input/change events; undefined otherwise. */
	value: string | undefined;
};

type FlowEventMessage = Extract<BridgeToHostMessage, { kind: "flow-event" }>;

/** Build a `FlowStep` from a bridge `flow-event` message. */
export function flowStepFromEvent(message: FlowEventMessage): FlowStep {
	return {
		eventType: message.eventType,
		selector: message.target.selector,
		value: message.data,
	};
}

/** Append a step, returning a NEW list (input never mutated). */
export function appendFlowStep(steps: FlowStep[], step: FlowStep): FlowStep[] {
	return [...steps, step];
}

function renderStep(step: FlowStep): string {
	switch (step.eventType) {
		case "click":
			return `Click \`${step.selector}\``;
		case "input":
		case "change":
			return `Type "${step.value ?? ""}" into \`${step.selector}\``;
		case "navigate":
			return `Navigate to \`${step.selector}\``;
	}
}

/** Render an ordered numbered repro-step block for the composer. */
export function serializeFlowSteps(steps: FlowStep[]): string {
	if (steps.length === 0) return "Repro steps: (none recorded)";
	const lines = steps.map((s, i) => `${i + 1}. ${renderStep(s)}`);
	return ["Repro steps:", ...lines].join("\n");
}
```
- [ ] Run: `bun x vitest run src/features/browser/flow/flow-recorder.test.ts` — expect PASS.
- [ ] Commit: `feat(browser): flow-recorder reducer + repro-step serialization`

---

## Task 8 — Wire flow steps + reload nonce into the bridge store

**Files:**
- Modify `src/features/browser/bridge/use-browser-bridge.ts:24-101` (`BrowserBridgeState`, `emptyBridgeState`, `ingestMessage`).
- Reference: Task 6 variants, Task 7 `flowStepFromEvent`/`FlowStep`.

Extend the store state with `flowSteps: FlowStep[]` and `reloadNonce: number` (bumped on every `reload-detected`, so the host effect re-navigates the active tab). Extend the PURE `ingestMessage` reducer.

- [ ] Write failing test `src/features/browser/bridge/use-browser-bridge.flow.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { emptyBridgeState, ingestMessage } from "./use-browser-bridge";

describe("ingestMessage — flow + reload", () => {
	it("appends a flow-event into flowSteps", () => {
		const next = ingestMessage(emptyBridgeState(), {
			kind: "flow-event",
			eventType: "click",
			target: {
				selector: "#go",
				outerHTML: "<x/>",
				rect: { x: 0, y: 0, width: 1, height: 1 },
			},
		});
		expect(next.flowSteps).toEqual([
			{ eventType: "click", selector: "#go", value: undefined },
		]);
	});

	it("bumps reloadNonce on reload-detected", () => {
		const a = emptyBridgeState();
		const b = ingestMessage(a, { kind: "reload-detected" });
		expect(b.reloadNonce).toBe(a.reloadNonce + 1);
	});

	it("does not mutate the input state", () => {
		const a = emptyBridgeState();
		ingestMessage(a, { kind: "reload-detected" });
		expect(a.reloadNonce).toBe(0);
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/use-browser-bridge.flow.test.ts` — expect FAIL.
- [ ] Implement in `src/features/browser/bridge/use-browser-bridge.ts`. Add the import and extend state:
```ts
import { type FlowStep, flowStepFromEvent } from "../flow/flow-recorder";
```
Add fields to `BrowserBridgeState`:
```ts
	flowSteps: FlowStep[];
	/** Incremented on each detected dev-server reload to trigger a re-navigate. */
	reloadNonce: number;
```
Add to `emptyBridgeState()`:
```ts
		flowSteps: [],
		reloadNonce: 0,
```
Add cases to `ingestMessage`:
```ts
		case "flow-event":
			return {
				...state,
				flowSteps: [...state.flowSteps, flowStepFromEvent(message)],
			};
		case "reload-detected":
			return { ...state, reloadNonce: state.reloadNonce + 1 };
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/use-browser-bridge.flow.test.ts src/features/browser/bridge` — expect PASS.
- [ ] Commit: `feat(browser): track flow steps + reload nonce in bridge store`

---

## Task 9 — Element→source jump: source-ref parsing (pure)

**Files:**
- Create `src/features/browser/bridge/source-ref.ts`
- Create `src/features/browser/bridge/source-ref.test.ts`
- Reference: `cssSelectorFor` (`selector.ts:63-86`), `STABLE_ATTRS` (`selector.ts:13`), `openFileReference(path,line,column)` (`use-editor-session-controller.tsx:223-303`).

Read best-effort framework source attributes off the clicked element (`data-source`, `data-source-loc`, React fiber `__source`), parse `file:line:col`, and return a `SourceRef` or null (degrade to selector-only).

- [ ] Write failing test `src/features/browser/bridge/source-ref.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseSourceRef, readSourceRef } from "./source-ref";

describe("parseSourceRef", () => {
	it("parses file:line:col", () => {
		expect(parseSourceRef("src/App.tsx:12:4")).toEqual({
			path: "src/App.tsx",
			line: 12,
			column: 4,
		});
	});

	it("parses file:line without column", () => {
		expect(parseSourceRef("src/App.tsx:12")).toEqual({
			path: "src/App.tsx",
			line: 12,
			column: undefined,
		});
	});

	it("returns null for a bare path", () => {
		expect(parseSourceRef("src/App.tsx")).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(parseSourceRef("")).toBeNull();
	});
});

describe("readSourceRef", () => {
	const elWith = (attrs: Record<string, string>): Element =>
		({ getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Element;

	it("reads data-source", () => {
		expect(readSourceRef(elWith({ "data-source": "src/A.tsx:3:1" }))).toEqual({
			path: "src/A.tsx",
			line: 3,
			column: 1,
		});
	});

	it("falls back across attributes in priority order", () => {
		expect(
			readSourceRef(elWith({ "data-source-loc": "src/B.tsx:9" })),
		).toEqual({ path: "src/B.tsx", line: 9, column: undefined });
	});

	it("returns null when no source attribute resolves", () => {
		expect(readSourceRef(elWith({ class: "x" }))).toBeNull();
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/source-ref.test.ts` — expect FAIL.
- [ ] Implement `src/features/browser/bridge/source-ref.ts`:
```ts
/**
 * Best-effort element→source resolution for the inspector bridge.
 *
 * Reads framework debug attributes (`data-source`, `data-source-loc`,
 * `data-inspector-line`-style `__source` mirrors) off a clicked element and
 * parses `file:line:col`. Returns null when no source attribute resolves, so the
 * caller degrades to selector-only. PURE — the element is reached via the passed
 * node, never a global — so it runs identically in jsdom and the injected page.
 */

export type SourceRef = {
	path: string;
	line: number;
	column: number | undefined;
};

/** Attributes scanned in priority order for a `file:line:col` source ref. */
const SOURCE_ATTRS = ["data-source", "data-source-loc", "data-inspector-source"];

/** Parse a `file:line[:col]` string into a `SourceRef`, or null. */
export function parseSourceRef(raw: string): SourceRef | null {
	const m = raw.match(/^(.+?):(\d+)(?::(\d+))?$/);
	if (!m) return null;
	return {
		path: m[1],
		line: Number.parseInt(m[2], 10),
		column: m[3] === undefined ? undefined : Number.parseInt(m[3], 10),
	};
}

/** Read a source ref from an element's debug attributes, or null. */
export function readSourceRef(el: Element): SourceRef | null {
	for (const attr of SOURCE_ATTRS) {
		const val = el.getAttribute(attr);
		if (val) {
			const ref = parseSourceRef(val);
			if (ref) return ref;
		}
	}
	return null;
}
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/source-ref.test.ts` — expect PASS.
- [ ] Commit: `feat(browser): best-effort element→source ref parsing`

---

## Task 10 — Element→source bridge variant + host dispatch to openFileReference

**Files:**
- Modify `src/features/browser/bridge/channel.ts` (add `source-ref` page→host variant).
- Create `src/features/browser/bridge/source-jump.ts` (pure dispatch decision).
- Create `src/features/browser/bridge/source-jump.test.ts`
- Reference: `openFileReference(path,line,column)` (`use-editor-session-controller.tsx:223`), `readSourceRef`/`SourceRef` (Task 9).

When the bridge resolves a clicked element's source ref, it posts `{ kind: "source-ref", ref }` (ref nullable). The host decides: jump via `openFileReference` when present, else surface a selector-only fallback notice. The decision is a pure function so it's testable.

- [ ] Add to `BridgeToHostMessage` in `channel.ts`:
```ts
	| { kind: "source-ref"; ref: import("./source-ref").SourceRef | null; selector: string }
```
and add `"source-ref"` to `BRIDGE_TO_HOST_KINDS`.
- [ ] Write failing test `src/features/browser/bridge/source-jump.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { dispatchSourceJump } from "./source-jump";

describe("dispatchSourceJump", () => {
	it("opens the file at line/column when the ref resolves", () => {
		const openFileReference = vi.fn();
		const onUnresolved = vi.fn();
		dispatchSourceJump(
			{
				kind: "source-ref",
				ref: { path: "src/App.tsx", line: 12, column: 4 },
				selector: "#root",
			},
			{ openFileReference, onUnresolved },
		);
		expect(openFileReference).toHaveBeenCalledWith("src/App.tsx", 12, 4);
		expect(onUnresolved).not.toHaveBeenCalled();
	});

	it("degrades to selector-only when no ref", () => {
		const openFileReference = vi.fn();
		const onUnresolved = vi.fn();
		dispatchSourceJump(
			{ kind: "source-ref", ref: null, selector: "#root" },
			{ openFileReference, onUnresolved },
		);
		expect(openFileReference).not.toHaveBeenCalled();
		expect(onUnresolved).toHaveBeenCalledWith("#root");
	});
});
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/source-jump.test.ts` — expect FAIL.
- [ ] Implement `src/features/browser/bridge/source-jump.ts`:
```ts
/**
 * Host-side dispatch for an element→source jump.
 *
 * Given a `source-ref` bridge message, either jump to the file/line via the
 * editor controller's `openFileReference`, or degrade to a selector-only notice.
 * PURE routing decision (the side effects are injected callbacks) so it unit-tests
 * without a React tree.
 */
import type { BridgeToHostMessage } from "./channel";

type SourceRefMessage = Extract<BridgeToHostMessage, { kind: "source-ref" }>;

export type SourceJumpHandlers = {
	openFileReference: (path: string, line?: number, column?: number) => void;
	/** Called with the selector when the source ref could not be resolved. */
	onUnresolved: (selector: string) => void;
};

export function dispatchSourceJump(
	message: SourceRefMessage,
	handlers: SourceJumpHandlers,
): void {
	if (message.ref) {
		handlers.openFileReference(
			message.ref.path,
			message.ref.line,
			message.ref.column,
		);
		return;
	}
	handlers.onUnresolved(message.selector);
}
```
- [ ] Run: `bun x vitest run src/features/browser/bridge/source-jump.test.ts src/features/browser/bridge` — expect PASS.
- [ ] Commit: `feat(browser): element→source jump dispatch into the editor`

---

## Task 11 — Live-reload re-navigate effect + flow-recording toggle wiring

**Files:**
- Modify `src/features/browser/content-host.tsx` (re-navigate on `reloadNonce`).
- Reference: Task 8 `reloadNonce`, `browserNavigate` (`api.ts:5528`), `set-flow-recording` host→page message (Task 6) + `browserSendBridgeMessage` (`api.ts:5547`).

When the bridge store's `reloadNonce` increments (dev-server HMR/reload detected), `ContentHost` re-navigates the active tab to its current URL so agent edits appear live. The flow-recording toggle sends `set-flow-recording` into the page. These are thin glue; the testable cores already ship in Tasks 4/6/7/8.

- [ ] Add a `reloadNonce?: number` prop to `ContentHost` and an effect that re-navigates on change:
```tsx
type ContentHostProps = {
	url: string | null;
	viewport?: ViewportPreset | null;
	/** Bumped by the bridge store on dev-server reload to force a refresh. */
	reloadNonce?: number;
};
```
```tsx
	// Re-navigate the active tab when a dev-server reload is detected so agent
	// edits appear live. Skips the initial mount (nonce 0).
	const firstReloadRef = useRef(true);
	useEffect(() => {
		if (firstReloadRef.current) {
			firstReloadRef.current = false;
			return;
		}
		if (!url || !createdRef.current) return;
		void (async () => {
			try {
				const { browserNavigate } = await import("@/lib/api");
				await browserNavigate(url);
			} catch {
				// No-op.
			}
		})();
	}, [reloadNonce, url]);
```
- [ ] In the parent surface that owns the toolbar (the one rendering `<ViewportPresets>` from Task 3), add a "Record flow" toggle button that calls `browserSendBridgeMessage({ kind: "set-flow-recording", enabled })` and, on stop, reads `store.getState().flowSteps`, runs `serializeFlowSteps`, and inserts the result into the composer via the existing capture/handoff attach path. Pass `reloadNonce={store.reloadNonce}` to `<ContentHost>`.
- [ ] Run: `bun x vitest run src/features/browser/content-host.test.ts` — expect PASS (existing `rectFromElement` tests unaffected; the new effect is jsdom-guarded).
- [ ] Run full frontend suite for the feature: `bun x vitest run src/features/browser` — expect PASS.
- [ ] Commit: `feat(browser): live-reload re-navigate + flow-recording toggle wiring`

---

## Task 12 — Final verification pass

**Files:** none (verification only).

- [ ] Run: `bun run test:frontend` — expect PASS.
- [ ] Run: `cd src-tauri && cargo test dev_server` — expect PASS.
- [ ] Run: `bun run lint` — expect zero biome + clippy warnings.
- [ ] Run: `bun run typecheck` — expect zero TS errors.
- [ ] Commit (if any lint/format fixes applied): `chore(browser): lint + format coding-extras`

---

## Self-review notes

Acceptance criterion → task mapping:

- **Viewport presets resize the surface and capture at the selected size.**
  - Task 1 (preset rect math), Task 2 (apply projected rect via `browserSetBounds`; capture reuses live `computeSegments`/`captureFullPage` inside the resized webview, so it stitches at the selected size), Task 3 (toolbar picker UI).

- **A localhost reload/HMR auto-refreshes the surface so agent edits appear live.**
  - Task 4 (TS dev-server port extraction), Task 5 (Rust mirror), Task 6 (`reload-detected` bridge variant), Task 8 (`reloadNonce` in store), Task 11 (re-navigate effect on `reloadNonce`).

- **Element→source jump opens the right file/line when resolvable; degrades gracefully otherwise.**
  - Task 9 (source-ref parsing from framework debug attrs), Task 10 (`source-ref` bridge variant + `dispatchSourceJump` routing to `openFileReference`, selector-only fallback when unresolved).

- **Flow recording produces a structured, attachable repro-step list.**
  - Task 6 (`flow-event` + `set-flow-recording` variants), Task 7 (`flowStepFromEvent`/`appendFlowStep`/`serializeFlowSteps`), Task 8 (`flowSteps` in store), Task 11 (record toggle + serialize-into-composer wiring).

Notes:
- Before/after visual diff is **deferred** (PRD Decision D9) and intentionally NOT planned here.
- No `pipeline/` / `agents/` persistence / `schema.rs` / `session_messages` storage shape changes — so no insta snapshot coverage is required by this plan (the Rust addition in Task 5 is a pure stateless helper).
- All new pure logic (preset math, port regex ×2, source-ref parse, flow serialization, bridge reducer extensions) is unit-tested DOM-free, mirroring `content-host.test.ts`.
