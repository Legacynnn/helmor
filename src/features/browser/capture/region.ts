/**
 * Region (drag-select) capture geometry.
 *
 * A drag-select rectangle is reduced to a crop rect that the bridge applies to
 * the html2canvas full-page PNG before routing the result through the Phase 2
 * `BrowserCapture` handoff path. The state machine + rect math are DOM-free so
 * they unit-test in jsdom; the actual PNG crop (`cropPngToRect`) needs a real
 * `OffscreenCanvas`/`Image` and is exercised in the bridge.
 *
 * Device-pixel-ratio scaling reuses the same projection contract as the
 * comment/pick `cropRect` in `../bridge/enrich.ts` (viewport CSS px × scale,
 * clamped to canvas bounds) — `cropRectFromDrag` produces the identical
 * `CropRect` shape (`{ sx, sy, sw, sh }`) so both flows feed one crop helper.
 */

import { type CropRect, cropRect } from "../bridge/enrich";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type DragRectState = {
	dragging: boolean;
	origin: Point | null;
	rect: Rect | null;
};

export const initialDragState: DragRectState = {
	dragging: false,
	origin: null,
	rect: null,
};

/** Begin a drag: anchor the origin, clear any previous rect. */
export function applyDragStart(_s: DragRectState, p: Point): DragRectState {
	return { dragging: true, origin: p, rect: null };
}

/**
 * Extend the in-progress rect from the anchored origin to the current pointer.
 * No-op when not dragging (a stray move before pointerdown). Width/height may be
 * negative here (drag up/left); {@link normalizeRect} fixes the sign downstream.
 */
export function applyDragMove(s: DragRectState, p: Point): DragRectState {
	if (!s.dragging || !s.origin) return s;
	return {
		...s,
		rect: {
			x: s.origin.x,
			y: s.origin.y,
			w: p.x - s.origin.x,
			h: p.y - s.origin.y,
		},
	};
}

/** Commit the drag: stop dragging, keep the last rect for the crop step. */
export function applyDragEnd(s: DragRectState): DragRectState {
	return { ...s, dragging: false };
}

/** Flip negative width/height so the rect always has a top-left origin. */
export function normalizeRect(r: Rect): Rect {
	return {
		x: r.w < 0 ? r.x + r.w : r.x,
		y: r.h < 0 ? r.y + r.h : r.y,
		w: Math.abs(r.w),
		h: Math.abs(r.h),
	};
}

/** Clip a (normalized) rect to `bounds`, returning a zero-size rect if disjoint. */
export function clampRect(r: Rect, bounds: Rect): Rect {
	const x = Math.max(bounds.x, r.x);
	const y = Math.max(bounds.y, r.y);
	const x2 = Math.min(bounds.x + bounds.w, r.x + r.w);
	const y2 = Math.min(bounds.y + bounds.h, r.y + r.h);
	return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

/** Scale all rect values by the device pixel ratio (CSS px → canvas px). */
export function scaleRect(r: Rect, dpr: number): Rect {
	return { x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr };
}

/**
 * Reduce a raw drag rect (viewport CSS px, possibly negative/overflowing) to a
 * canvas-pixel {@link CropRect} ready for `getImageData`/`drawImage`.
 *
 * Pipeline: normalize sign → clamp to the viewport → project onto the
 * html2canvas output (scaled by `scale`/DPR, clamped to canvas bounds) by
 * delegating to `bridge/enrich.cropRect`, so the device-pixel math lives in one
 * place and matches the comment/pick element crop.
 */
export function cropRectFromDrag(
	drag: Rect,
	viewport: { w: number; h: number },
	scale: number,
): CropRect {
	const norm = normalizeRect(drag);
	const clamped = clampRect(norm, { x: 0, y: 0, w: viewport.w, h: viewport.h });
	return cropRect(
		{ x: clamped.x, y: clamped.y, width: clamped.w, height: clamped.h },
		{
			scale,
			canvasWidth: viewport.w * scale,
			canvasHeight: viewport.h * scale,
		},
	);
}

/**
 * Crop a base64 PNG data URL to `crop` (canvas pixels) using an
 * `OffscreenCanvas`. Called from the content-webview bridge after a region drag
 * ends; the resulting data URL is posted to the Phase 2 `browser_capture`
 * command and routed into the `BrowserCapture` handoff. Not jsdom-testable
 * (needs a real canvas), so it stays thin.
 */
export async function cropPngToRect(
	base64Png: string,
	crop: CropRect,
): Promise<string> {
	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = reject;
		img.src = base64Png;
	});
	const canvas = new OffscreenCanvas(crop.sw, crop.sh);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("cropPngToRect: 2D context unavailable");
	ctx.drawImage(img, -crop.sx, -crop.sy);
	const blob = await canvas.convertToBlob({ type: "image/png" });
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}
