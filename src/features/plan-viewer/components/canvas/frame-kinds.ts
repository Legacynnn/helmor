import {
	normalizeSurface,
	type WireframeSurface,
} from "../wireframe/surface-frame";

/**
 * The visual role of a canvas frame. Unlike the old mind-map `CanvasNodeKind`
 * (note/resume/option/phase/wireframe), a frame's kind decides which RENDERER
 * the surface mounts: a live preview, a low-fi wireframe, or a sticky note.
 * `screen` is an alias resolved by embedded content (see {@link resolveFrameKind}).
 */
export type FrameKind = "preview" | "wireframe" | "note" | "screen";

/** The device/window chrome a frame is shown in — same taxonomy as wireframes. */
export type FrameDevice = WireframeSurface;

/** Resolve a `device=` prop to a known device, defaulting to `browser`. */
export function normalizeDevice(value: string | undefined): FrameDevice {
	return normalizeSurface(value);
}

/**
 * Decide a frame's kind. Embedded content wins over the authored `kind` prop —
 * a `<Preview>` child is unambiguously a preview frame, a `<Wireframe>` child a
 * wireframe frame — so old mind-map kinds (resume/option/phase) and bare
 * `kind="screen"` fall through to `note`, preserving their markdown body.
 */
export function resolveFrameKind(
	_kindProp: string | undefined,
	content: { hasPreview: boolean; hasWireframe: boolean },
): FrameKind {
	if (content.hasPreview) return "preview";
	if (content.hasWireframe) return "wireframe";
	// No embedded content: a bare `kind="preview"`/`"wireframe"` has nothing to
	// render live, and old mind-map kinds aren't frame kinds — all become notes.
	return "note";
}

export type FrameSize = { width: number; height: number };

/** Default frame size by kind — generous so a preview reads near real-screen
 * and frames have room to breathe across the canvas. */
export const DEFAULT_FRAME_SIZE: Record<FrameKind, FrameSize> = {
	preview: { width: 520, height: 600 },
	screen: { width: 520, height: 600 },
	wireframe: { width: 420, height: 520 },
	note: { width: 300, height: 200 },
};

const COORD_LIMIT = 100_000;
const MIN_DIM = 120;
const MAX_DIM = 2000;

/**
 * Parse a coordinate prop (`x`/`y`) to a finite number, or `undefined` when
 * absent/unparseable so the caller can fall back to auto-layout. Absurd values
 * are clamped so one bad number can't fling a frame off the canvas.
 */
export function parseCoord(value: string | undefined): number | undefined {
	if (value == null) return undefined;
	const n = Number.parseFloat(value);
	if (!Number.isFinite(n)) return undefined;
	return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, n));
}

/** Parse a dimension prop (`w`/`h`), clamped to a sane range, or `fallback`. */
export function parseDimension(
	value: string | undefined,
	fallback: number,
): number {
	if (value == null) return fallback;
	const n = Number.parseFloat(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(MIN_DIM, Math.min(MAX_DIM, n));
}
