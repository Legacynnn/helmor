/**
 * Full-page scroll-and-stitch orchestration.
 *
 * `computeSegments` is pure scroll-offset math: it walks `document.scrollHeight`
 * in viewport-sized steps, optionally scrolling back by `overlap` px each step
 * to give lazy-loaded content a re-capture margin. The per-segment
 * `captureHeight` is the *non-overlapping* slice each segment contributes, so
 * the stacked heights sum to exactly `scrollHeight` and the Rust stitcher
 * produces an image whose height equals the page height. The actual scroll +
 * html2canvas capture + IPC stitch lives in `captureFullPage`, which needs a
 * real DOM and is exercised in the bridge.
 *
 * CAVEAT (virtualization): the overlap margin only mitigates lazy-load timing.
 * Pages using virtualized lists (rows unmounted when scrolled out of view)
 * cannot be fully captured — never-rendered content stitches as gaps.
 */

import { invoke } from "@tauri-apps/api/core";

export type PageSegment = {
	/** Scroll-Y to position the viewport at before capturing this segment. */
	scrollY: number;
	/**
	 * Vertical slice (CSS px) this segment contributes to the stitched image.
	 * Overlap-trimmed so `sum(captureHeight) === scrollHeight`.
	 */
	captureHeight: number;
};

/**
 * Compute scroll positions and non-overlapping capture heights for a full-page
 * stitch.
 *
 * @param scrollHeight - total page height (`documentElement.scrollHeight`), CSS px
 * @param viewportHeight - visible area (`window.innerHeight`), CSS px
 * @param overlap - px to re-scroll backward per step to catch lazy-loaded
 *   content (default 0). The overlapping region is trimmed from `captureHeight`
 *   so stacked segments don't double-count.
 */
export function computeSegments(
	scrollHeight: number,
	viewportHeight: number,
	overlap = 0,
): PageSegment[] {
	if (scrollHeight < 0) throw new Error("scrollHeight must be >= 0");
	if (viewportHeight <= 0) throw new Error("viewportHeight must be > 0");

	const segments: PageSegment[] = [];
	// `covered` tracks how many page px the stitched image already accounts for,
	// so each segment contributes only the fresh slice below it.
	let covered = 0;

	while (covered < scrollHeight || segments.length === 0) {
		// Anchor the viewport so it covers from `covered`, scrolled back by the
		// overlap margin where there is room above.
		const scrollY = Math.max(0, covered - overlap);
		const remaining = scrollHeight - covered;
		const captureHeight = Math.min(viewportHeight, remaining);
		segments.push({ scrollY, captureHeight });
		covered += captureHeight;
		if (captureHeight <= 0) break;
		if (remaining <= viewportHeight) break;
	}

	return segments;
}

export type FullPageCaptureOptions = {
	/** Maximum segments (safety cap). Default 20. */
	maxSegments?: number;
	/** Overlap px for lazy-load margin. Default 50. */
	overlap?: number;
	/** Settle delay (ms) after each scroll so lazy content paints. Default 120. */
	settleMs?: number;
};

/**
 * Capture one viewport segment as a base64 PNG. Supplied by the bridge: it
 * scrolls (already done by `captureFullPage`) then runs html2canvas over the
 * current viewport including the drawing overlay, returning the segment image.
 */
export type CaptureViewport = (segment: PageSegment) => Promise<string>;

/**
 * Orchestrate a full-page capture inside the content-webview bridge: step the
 * page down in segments, capture each, then hand the ordered base64 PNGs to the
 * Rust `browser_stitch_captures` command which composes them vertically off the
 * main thread. Returns the stitched cache path (rides the `images` wire).
 */
export async function captureFullPage(
	sessionId: string,
	captureViewport: CaptureViewport,
	opts: FullPageCaptureOptions = {},
): Promise<string> {
	const maxSegments = opts.maxSegments ?? 20;
	const overlap = opts.overlap ?? 50;
	const settleMs = opts.settleMs ?? 120;

	const scrollHeight = document.documentElement.scrollHeight;
	const viewportHeight = window.innerHeight;
	const savedScrollY = window.scrollY;

	const segments = computeSegments(scrollHeight, viewportHeight, overlap);
	if (segments.length > maxSegments) {
		throw new Error(
			`Full-page capture needs ${segments.length} segments (max ${maxSegments}); ` +
				"page too tall or viewport too small.",
		);
	}

	const segmentPngs: string[] = [];
	for (const segment of segments) {
		window.scrollTo({ top: segment.scrollY, behavior: "instant" });
		await new Promise((r) => setTimeout(r, settleMs));
		segmentPngs.push(await captureViewport(segment));
	}

	window.scrollTo({ top: savedScrollY, behavior: "instant" });

	return await invoke<string>("browser_stitch_captures", {
		sessionId,
		input: { segments: segmentPngs },
	});
}
