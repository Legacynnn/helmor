/**
 * Comment-pin model for the inspector bridge.
 *
 * A `CommentPin` couples a user note to a DOM element by CSS selector, plus a
 * snapshot of its rect and outer HTML. After a page reload the elements are
 * gone, so `reanchorComments` re-resolves each selector against the fresh
 * document and flags pins that no longer match.
 *
 * All functions are PURE and immutable (return new arrays/objects); the DOM is
 * passed in, never reached via a global.
 */

import type { BridgeRect, BridgeSelection } from "./channel";
import { outlineRectFor } from "./overlay-geometry";
import { resolveSelector } from "./selector";

export type CommentPin = {
	id: string;
	selector: string;
	text: string;
	rect: BridgeRect;
	outerHTML: string;
	/** Curated computed-style subset captured at pin time, when available. */
	computedStyles?: Record<string, string>;
	/** Path to a cropped screenshot of the element's rect, when one was made. */
	cropPath?: string | null;
	/** false once the selector fails to re-resolve after a reload. */
	resolved: boolean;
};

/** Append a pin, returning a new array (input untouched). */
export function addComment(
	pins: readonly CommentPin[],
	pin: CommentPin,
): CommentPin[] {
	return [...pins, pin];
}

/** Remove a pin by id, returning a new array (input untouched). */
export function removeComment(
	pins: readonly CommentPin[],
	id: string,
): CommentPin[] {
	return pins.filter((pin) => pin.id !== id);
}

/**
 * Re-resolve every pin's selector against `doc`. Resolved pins get a refreshed
 * rect; unresolved pins keep their old rect but are flagged `resolved: false`.
 */
export function reanchorComments(
	pins: readonly CommentPin[],
	doc: Document,
): CommentPin[] {
	return pins.map((pin) => {
		const el = resolveSelector(doc, pin.selector);
		if (!el) {
			return { ...pin, resolved: false };
		}
		return { ...pin, rect: outlineRectFor(el), resolved: true };
	});
}

/** Build the wire `BridgeSelection` for a pin's anchored element. */
export function selectionForPin(pin: CommentPin): BridgeSelection {
	return {
		selector: pin.selector,
		outerHTML: pin.outerHTML,
		rect: pin.rect,
	};
}
