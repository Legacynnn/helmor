import { describe, expect, it } from "vitest";
import type { BridgeSelection } from "../bridge/channel";
import type { CommentPin } from "../bridge/comments";
import { captureCommentFromPin, capturePickFromSelection } from "./from-bridge";

describe("captureCommentFromPin", () => {
	it("carries computedStyles and cropPath into the capture comment", () => {
		const pin: CommentPin = {
			id: "c1",
			selector: "#hero",
			text: "tighten gutter",
			rect: { x: 0, y: 0, width: 10, height: 10 },
			outerHTML: "<div id='hero'></div>",
			computedStyles: { display: "flex", color: "rgb(0,0,0)" },
			cropPath: "/cache/crop-1.png",
			resolved: true,
		};
		const comment = captureCommentFromPin(pin);
		expect(comment).toEqual({
			id: "c1",
			text: "tighten gutter",
			selector: "#hero",
			outerHTML: "<div id='hero'></div>",
			computedStyles: { display: "flex", color: "rgb(0,0,0)" },
			rectCropPath: "/cache/crop-1.png",
		});
	});

	it("defaults rectCropPath to an empty string and omits absent styles", () => {
		const pin: CommentPin = {
			id: "c2",
			selector: "main",
			text: "",
			rect: { x: 0, y: 0, width: 1, height: 1 },
			outerHTML: "<main></main>",
			resolved: true,
		};
		const comment = captureCommentFromPin(pin);
		expect(comment.rectCropPath).toBe("");
		expect(comment.computedStyles).toBeUndefined();
	});
});

describe("capturePickFromSelection", () => {
	it("carries computedStyles into the capture pick", () => {
		const selection: BridgeSelection = {
			selector: "button.cta",
			outerHTML: "<button></button>",
			computedStyles: { display: "inline-block" },
			rect: { x: 0, y: 0, width: 5, height: 5 },
		};
		const pick = capturePickFromSelection(selection);
		expect(pick).toEqual({
			selector: "button.cta",
			outerHTML: "<button></button>",
			computedStyles: { display: "inline-block" },
		});
	});

	it("defaults computedStyles to an empty object when absent", () => {
		const selection: BridgeSelection = {
			selector: "span",
			outerHTML: "<span></span>",
			rect: { x: 0, y: 0, width: 1, height: 1 },
		};
		const pick = capturePickFromSelection(selection);
		expect(pick.computedStyles).toEqual({});
	});
});
