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
	// The device keeps its natural height (the page scrolls vertically) so a
	// tall phone preset renders at its real height. Only when the device is too
	// wide for the host — i.e. it would overflow the pane — do we clamp height
	// too, so an oversized custom rect collapses to the host bounds.
	const overflows = preset.width > host.width;
	const height = overflows
		? Math.min(preset.height, host.height)
		: preset.height;
	const x = host.x + Math.round((host.width - width) / 2);
	return { x, y: host.y, width, height };
}
