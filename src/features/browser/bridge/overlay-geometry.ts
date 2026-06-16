/**
 * Pure rect math for the hover outline + dimension tag.
 *
 * `outlineRectFor` derives the outline box from an element's bounding rect,
 * `dimensionLabel` formats the "W × H" tag text, and `clampLabelPosition`
 * keeps the tag inside the viewport (flipping below the element when there is
 * no room above, clamping horizontally to the edges).
 *
 * All functions are PURE — no DOM mutation, no globals.
 */

import type { BridgeRect } from "./channel";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** Gap in px between the element outline and the dimension label. */
const LABEL_GAP = 4;

export function outlineRectFor(el: Element): BridgeRect {
	const r = el.getBoundingClientRect();
	return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function dimensionLabel(rect: BridgeRect): string {
	return `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

/**
 * Position the dimension label relative to `rect`, clamped to `viewport`.
 * Defaults to sitting just above the rect; flips below when it would clip the
 * top edge. Horizontal position is clamped to [0, viewport.width - label].
 */
export function clampLabelPosition(
	rect: BridgeRect,
	label: Size,
	viewport: Size,
): Point {
	const above = rect.y - label.height - LABEL_GAP;
	const below = rect.y + rect.height + LABEL_GAP;
	const y = above >= 0 ? above : below;

	const maxX = Math.max(0, viewport.width - label.width);
	const x = Math.min(Math.max(rect.x, 0), maxX);

	return { x, y };
}
