/**
 * DOM overlay renderer for the inspector hover highlight.
 *
 * `createHoverOverlay` builds a small controller that owns two fixed-position
 * nodes (an outline box + a dimension label) appended to a host element. It
 * never reaches a global: the host document is supplied, so the overlay is
 * jsdom-unit-testable. The pure geometry lives in `overlay-geometry.ts`; this
 * module is the thin DOM-mutation layer the injected bridge uses.
 */

import type { BridgeRect } from "./channel";
import {
	clampLabelPosition,
	dimensionLabel,
	outlineRectFor,
	type Size,
} from "./overlay-geometry";

/** Top of the 32-bit z-index range so the overlay sits above page content. */
const OVERLAY_Z = "2147483647";

/** Estimated label box used to clamp the dimension tag inside the viewport. */
const LABEL_SIZE: Size = { width: 64, height: 16 };

export type HoverOverlay = {
	/** Position the outline + label over `el`'s bounding rect. */
	show(el: Element): void;
	/** Hide both nodes without removing them from the DOM. */
	hide(): void;
	/** Remove both nodes from the DOM. */
	destroy(): void;
	/** The outline node (exposed for testing). */
	readonly outline: HTMLElement;
	/** The dimension-tag node (exposed for testing). */
	readonly label: HTMLElement;
};

function styleOutline(node: HTMLElement): void {
	Object.assign(node.style, {
		position: "fixed",
		boxSizing: "border-box",
		pointerEvents: "none",
		zIndex: OVERLAY_Z,
		outline: "2px solid oklch(0.7 0.18 250)",
		background: "oklch(0.7 0.18 250 / 0.12)",
		display: "none",
	});
}

function styleLabel(node: HTMLElement): void {
	Object.assign(node.style, {
		position: "fixed",
		boxSizing: "border-box",
		pointerEvents: "none",
		zIndex: OVERLAY_Z,
		padding: "1px 4px",
		borderRadius: "2px",
		font: "11px/1.3 ui-monospace, monospace",
		color: "#fff",
		background: "oklch(0.7 0.18 250)",
		whiteSpace: "nowrap",
		display: "none",
	});
}

export function createHoverOverlay(host: Document = document): HoverOverlay {
	const root = host.documentElement;
	const outline = host.createElement("div");
	const label = host.createElement("div");
	outline.setAttribute("data-helmor-overlay", "outline");
	label.setAttribute("data-helmor-overlay", "label");
	styleOutline(outline);
	styleLabel(label);
	root.appendChild(outline);
	root.appendChild(label);

	function show(el: Element): void {
		const rect: BridgeRect = outlineRectFor(el);
		outline.style.display = "block";
		outline.style.left = `${rect.x}px`;
		outline.style.top = `${rect.y}px`;
		outline.style.width = `${rect.width}px`;
		outline.style.height = `${rect.height}px`;

		const view = host.defaultView;
		const viewport: Size = {
			width: view?.innerWidth ?? rect.width,
			height: view?.innerHeight ?? rect.height,
		};
		const pos = clampLabelPosition(rect, LABEL_SIZE, viewport);
		label.textContent = dimensionLabel(rect);
		label.style.display = "block";
		label.style.left = `${pos.x}px`;
		label.style.top = `${pos.y}px`;
	}

	function hide(): void {
		outline.style.display = "none";
		label.style.display = "none";
	}

	function destroy(): void {
		outline.remove();
		label.remove();
	}

	return { show, hide, destroy, outline, label };
}
