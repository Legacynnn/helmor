/**
 * Capture enrichment helpers for comment/pick selections.
 *
 * Two pure concerns live here:
 *   - `curateComputedStyles`: distil a full `CSSStyleDeclaration` down to a
 *     curated, agent-useful subset (layout box + typography + color), dropping
 *     empty values so the payload stays small.
 *   - `cropRect`: map an element's viewport rect onto the html2canvas-produced
 *     full-page canvas (scaled by device-pixel-ratio), clamped to the canvas
 *     bounds, so a cropped element screenshot can be extracted host-side.
 *
 * Both are DOM-free (a `read` accessor / plain numbers are injected) so they
 * unit-test in jsdom with no live page, and bundle cleanly into the IIFE.
 */

import type { BridgeRect } from "./channel";

/**
 * The curated set of CSS properties captured per element. Chosen for the
 * questions agents actually ask of a snapshot: how is it laid out (display /
 * position / box model), and how does it read (typography / color)?
 */
export const CURATED_STYLE_PROPS = [
	"display",
	"position",
	"width",
	"height",
	"margin",
	"padding",
	"border",
	"color",
	"background-color",
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"z-index",
] as const;

/** Reads one CSS property value, e.g. `(p) => getComputedStyle(el).getPropertyValue(p)`. */
export type StyleReader = (property: string) => string;

/**
 * Build the curated computed-style map. Only properties in
 * {@link CURATED_STYLE_PROPS} are read, and empty values are dropped.
 */
export function curateComputedStyles(
	read: StyleReader,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const prop of CURATED_STYLE_PROPS) {
		const value = read(prop).trim();
		if (value) out[prop] = value;
	}
	return out;
}

/** Source-rectangle for a `drawImage`/`getImageData` crop, in canvas pixels. */
export type CropRect = {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
};

/** The full-page canvas the element rect is being projected onto. */
export type CropCanvas = {
	/** Device-pixel-ratio html2canvas rendered at (its `scale` option). */
	scale: number;
	canvasWidth: number;
	canvasHeight: number;
};

/**
 * Project a viewport-space element rect onto the html2canvas output canvas,
 * scaled by the render `scale` and clamped to the canvas bounds. Returns a
 * zero-size crop when the rect falls entirely outside the canvas.
 */
export function cropRect(rect: BridgeRect, canvas: CropCanvas): CropRect {
	const { scale, canvasWidth, canvasHeight } = canvas;

	const left = Math.round(Math.max(0, rect.x * scale));
	const top = Math.round(Math.max(0, rect.y * scale));
	const right = Math.round(
		Math.min(canvasWidth, (rect.x + rect.width) * scale),
	);
	const bottom = Math.round(
		Math.min(canvasHeight, (rect.y + rect.height) * scale),
	);

	const sw = Math.max(0, right - left);
	const sh = Math.max(0, bottom - top);

	return { sx: left, sy: top, sw, sh };
}
