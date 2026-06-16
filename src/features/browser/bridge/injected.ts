/**
 * Injected bridge runtime — the IIFE entry compiled to `dist/bridge-bundle.js`
 * and attached to the content webview as its `initialization_script`.
 *
 * This is the ONLY bridge module that touches the live page (window/document)
 * and the Tauri IPC. It is intentionally thin: all decision logic lives in the
 * pure, unit-tested modules (`index.ts` `createBridge`, `selector`, `comments`,
 * `collectors`, `overlay-geometry`, `overlay-dom`). It cannot be unit-tested
 * (no webview in jsdom) so it must stay a mechanical wiring layer.
 *
 * Direction of flow:
 *   - host → page: Rust calls `window.__helmorBridge.handleMsg(json)` via eval.
 *   - page → host: this runtime calls `browser_bridge_event` over Tauri IPC.
 */

import {
	type BridgeToHostMessage,
	type DriverRequestPayload,
	type DriverTarget,
	isHostToBridgeMessage,
} from "./channel";
import { createConsoleCollector, createNetworkCollector } from "./collectors";
import { buildInteractiveElements } from "./driver-snapshot";
import { createBridge } from "./index";
import { createHoverOverlay } from "./overlay-dom";
import { resolveSelector } from "./selector";

type TauriInternals = {
	invoke: (cmd: string, args: unknown) => Promise<unknown>;
};

declare global {
	interface Window {
		__TAURI_INTERNALS__?: TauriInternals;
		__helmorBridge?: { handleMsg: (raw: string) => void };
	}
}

(function helmorInjectedBridge(): void {
	// Guard against double-injection (e.g. SPA soft-navigation re-runs).
	if (window.__helmorBridge) return;

	const overlay = createHoverOverlay(document);
	const consoleCollector = createConsoleCollector(console);
	const networkCollector = createNetworkCollector(window);
	let collectorsRunning = false;
	// Bridge context the host seeds via `set-context`. Echoed back on every
	// page → host event so Rust can scope persistence (workspace + page url).
	let workspaceId = "";
	let pageUrl = "";

	function post(message: BridgeToHostMessage): void {
		const internals = window.__TAURI_INTERNALS__;
		if (!internals) {
			// CSP blocked the Tauri IPC injection — surface the failure once so the
			// host can offer the screenshot-annotation fallback.
			console.warn("[helmor-bridge] Tauri IPC unavailable (CSP?)");
			return;
		}
		void internals.invoke("browser_bridge_event", {
			workspaceId,
			url: pageUrl,
			message,
		});
	}

	const bridge = createBridge({
		post,
		doc: document,
		onHover: (el) => overlay.show(el),
		onHoverEnd: () => overlay.hide(),
	});

	function startCollectors(): void {
		if (collectorsRunning) return;
		consoleCollector.start();
		networkCollector.start();
		collectorsRunning = true;
	}

	function drainCollectors(): void {
		if (!collectorsRunning) return;
		for (const entry of consoleCollector.stop()) {
			post({ kind: "console-error", entry });
		}
		for (const entry of networkCollector.stop()) {
			post({ kind: "network-event", entry });
		}
		collectorsRunning = false;
	}

	// Resolve a driver target to a live element (selector / role+name / coords).
	function resolveTarget(target: DriverTarget): Element | null {
		if (target.by === "selector") {
			return resolveSelector(document, target.selector);
		}
		if (target.by === "coords") {
			return document.elementFromPoint(target.x, target.y);
		}
		// role + name: scan interactive elements for a matching role+name.
		for (const el of buildInteractiveElements(document)) {
			if (el.role === target.role && el.name === target.name) {
				return resolveSelector(document, el.selector);
			}
		}
		return null;
	}

	// Perform one agent-driver op and return the opaque JSON value to post back.
	function runDriverRequest(payload: DriverRequestPayload): unknown {
		switch (payload.op) {
			case "snapshot":
				return {
					url: location.href,
					title: document.title,
					visibleText: document.body?.innerText ?? "",
					a11yTree: {},
					interactiveElements: buildInteractiveElements(document),
					diagnostics: { console: [], network: [] },
					screenshotPath: null,
				};
			case "click": {
				const el = resolveTarget(payload.target);
				if (!el) return { error: "target not found" };
				(el as HTMLElement).click();
				return { ok: true };
			}
			case "type": {
				const el = resolveTarget(payload.target);
				if (!el) return { error: "target not found" };
				const input = el as HTMLInputElement;
				if (typeof input.focus === "function") input.focus();
				input.value = (input.value ?? "") + payload.text;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				return { ok: true };
			}
			case "press": {
				const active = (document.activeElement ?? document.body) as HTMLElement;
				active.dispatchEvent(
					new KeyboardEvent("keydown", { key: payload.key, bubbles: true }),
				);
				active.dispatchEvent(
					new KeyboardEvent("keyup", { key: payload.key, bubbles: true }),
				);
				return { ok: true };
			}
			case "scroll": {
				const el = payload.target ? resolveTarget(payload.target) : null;
				if (el) (el as HTMLElement).scrollBy(payload.dx, payload.dy);
				else window.scrollBy(payload.dx, payload.dy);
				return { ok: true };
			}
			case "evaluate": {
				try {
					// Indirect eval via `window.eval` runs in global scope; agent-driven
					// page eval is the documented feature here.
					// biome-ignore lint/security/noGlobalEval: agent-driven page eval is the feature.
					const indirectEval = window.eval;
					const result = indirectEval(payload.script);
					return { ok: true, result };
				} catch (error) {
					return { error: String(error) };
				}
			}
			case "waitFor":
				// Synchronous best-effort: report current readiness. A richer
				// polling implementation can land in a follow-up.
				return { ok: document.readyState === "complete" };
		}
	}

	function handleMsg(raw: string): void {
		const message: unknown = typeof raw === "string" ? safeParse(raw) : raw;
		if (!isHostToBridgeMessage(message)) return;
		switch (message.kind) {
			case "set-mode":
				bridge.setMode(message.mode);
				if (message.mode === "none") {
					overlay.hide();
					drainCollectors();
				} else {
					startCollectors();
				}
				break;
			case "set-context":
				workspaceId = message.workspaceId;
				pageUrl = message.url;
				break;
			case "clear-comments":
				// Comment pins live host-side; nothing page-local to clear yet.
				break;
			case "request-capture":
				drainCollectors();
				break;
			case "driver-request": {
				let value: unknown;
				try {
					value = runDriverRequest(message.payload);
				} catch (error) {
					value = { error: String(error) };
				}
				post({ kind: "driver-result", id: message.id, value });
				break;
			}
		}
	}

	function safeParse(raw: string): unknown {
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	// Escape always snaps back to passive Navigate, mirroring the host toolbar.
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") handleMsg('{"kind":"set-mode","mode":"none"}');
	});

	bridge.init();
	window.__helmorBridge = { handleMsg };
})();
