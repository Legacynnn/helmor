/**
 * Pure adapters from the live inspector-bridge store shapes
 * (`CommentPin` / `BridgeSelection`) into the agent-handoff `BrowserCapture`
 * pieces (`BrowserCaptureComment` / `BrowserCapturePick`).
 *
 * This is where the enriched fields — `computedStyles` and the element
 * `cropPath` — get threaded from the page-side capture into the structured
 * context an agent receives. DOM-free and deterministic, so it unit-tests
 * without a page.
 */

import type { BridgeSelection } from "../bridge/channel";
import type { CommentPin } from "../bridge/comments";
import type {
	BrowserCapture,
	BrowserCaptureComment,
	BrowserCapturePick,
} from "./types";

/** Map a store comment pin to its handoff `BrowserCaptureComment`. */
export function captureCommentFromPin(pin: CommentPin): BrowserCaptureComment {
	const comment: BrowserCaptureComment = {
		id: pin.id,
		text: pin.text,
		selector: pin.selector,
		outerHTML: pin.outerHTML,
		rectCropPath: pin.cropPath ?? "",
	};
	if (pin.computedStyles) comment.computedStyles = pin.computedStyles;
	return comment;
}

/** Map a picked `BridgeSelection` to its handoff `BrowserCapturePick`. */
export function capturePickFromSelection(
	selection: BridgeSelection,
): BrowserCapturePick {
	return {
		selector: selection.selector,
		outerHTML: selection.outerHTML,
		computedStyles: selection.computedStyles ?? {},
	};
}

/** Page metadata threaded into a region/full-page capture. */
export type CapturePageContext = {
	url: string;
	title: string;
	viewport: { w: number; h: number };
};

/**
 * Assemble a `BrowserCapture` from a single cropped/stitched screenshot path
 * (the cache path returned by `browser_capture` / `browser_stitch_captures`).
 *
 * Used by the region drag-select and full-page flows: those produce one image
 * (not element comments/picks), so the capture carries the path in `images[0]`
 * — which is exactly what `buildCaptureInsertItems` reads for the badge — plus a
 * `drawings` marker recording how the shot was produced.
 */
export function captureFromImagePath(
	imagePath: string,
	page: CapturePageContext,
	kind: "region" | "fullpage",
): BrowserCapture {
	return {
		url: page.url,
		title: page.title,
		viewport: { w: page.viewport.w, h: page.viewport.h },
		images: [imagePath],
		comments: [],
		picks: [],
		drawings: [{ kind, screenshotPath: imagePath }],
	};
}
