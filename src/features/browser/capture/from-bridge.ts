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
import type { BrowserCaptureComment, BrowserCapturePick } from "./types";

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
