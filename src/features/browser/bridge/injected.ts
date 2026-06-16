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

import { type BridgeToHostMessage, isHostToBridgeMessage } from "./channel";
import { createConsoleCollector, createNetworkCollector } from "./collectors";
import { createBridge } from "./index";
import { createHoverOverlay } from "./overlay-dom";

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
