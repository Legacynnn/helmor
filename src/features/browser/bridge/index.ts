/**
 * Inspector bridge entry point.
 *
 * `createBridge` returns a small controller wiring the pure modules
 * (selector / overlay-geometry / comments / collectors) to live DOM events.
 *
 * PASSIVE GUARD: in mode `"none"` (or unset), `init()` installs ZERO
 * listeners, observers, or rAF callbacks — the bridge is pure overhead-free
 * dead weight until `setMode` activates a non-none mode. The heavy logic lives
 * in the pure modules; this file only owns the minimal DOM-event wiring.
 */

import type { BridgeMode, BridgePost, BridgeSelection } from "./channel";
import { outlineRectFor } from "./overlay-geometry";
import { cssSelectorFor } from "./selector";

export type CreateBridgeOptions = {
	/** Initial mode. Defaults to `"none"` (fully passive). */
	mode?: BridgeMode;
	/** Host callback for page → host messages. */
	post: BridgePost;
	/** Document to operate on. Defaults to the global `document`. */
	doc?: Document;
};

export type Bridge = {
	init(): void;
	teardown(): void;
	setMode(mode: BridgeMode): void;
};

/** Modes that require live hover/click DOM listeners. */
function isInteractive(mode: BridgeMode): boolean {
	return mode === "comment" || mode === "pick" || mode === "draw";
}

export function createBridge(options: CreateBridgeOptions): Bridge {
	const post = options.post;
	const doc = options.doc ?? document;
	let mode: BridgeMode = options.mode ?? "none";
	let started = false;
	let listenersActive = false;

	function selectionFor(el: Element): BridgeSelection {
		return {
			selector: cssSelectorFor(el),
			outerHTML: el.outerHTML,
			rect: outlineRectFor(el),
		};
	}

	function onClick(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const selection = selectionFor(target);
		if (mode === "comment") {
			post({
				kind: "comment-added",
				id:
					typeof crypto !== "undefined" && "randomUUID" in crypto
						? crypto.randomUUID()
						: String(Date.now()),
				text: "",
				selection,
			});
		} else if (mode === "pick") {
			post({ kind: "element-picked", selection });
		}
	}

	// Hover handler is intentionally a no-op sink in the core; overlay drawing
	// is layered on in the live-injection phase. It exists so the passive-guard
	// contract (listeners only when active) is observable + testable.
	function onMouseMove(_event: MouseEvent): void {}

	function activateListeners(): void {
		if (listenersActive) return;
		doc.addEventListener("mousemove", onMouseMove, true);
		doc.addEventListener("click", onClick, true);
		listenersActive = true;
	}

	function deactivateListeners(): void {
		if (!listenersActive) return;
		doc.removeEventListener("mousemove", onMouseMove, true);
		doc.removeEventListener("click", onClick, true);
		listenersActive = false;
	}

	function applyMode(): void {
		if (!started) return;
		if (isInteractive(mode)) {
			activateListeners();
		} else {
			deactivateListeners();
		}
	}

	return {
		init(): void {
			started = true;
			applyMode();
		},
		teardown(): void {
			deactivateListeners();
			started = false;
		},
		setMode(next: BridgeMode): void {
			mode = next;
			applyMode();
		},
	};
}
