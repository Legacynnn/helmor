import { describe, expect, it } from "vitest";
import {
	addComment,
	type CommentPin,
	reanchorComments,
	removeComment,
} from "./comments";

function pin(id: string, selector: string, rect = base()): CommentPin {
	return {
		id,
		selector,
		text: `note ${id}`,
		rect,
		outerHTML: `<div data-id="${id}"></div>`,
		resolved: true,
	};
}

function base() {
	return { x: 0, y: 0, width: 10, height: 10 };
}

describe("addComment", () => {
	it("appends a pin without mutating the input array", () => {
		const pins: CommentPin[] = [];
		const next = addComment(pins, pin("a", "#a"));
		expect(next).toHaveLength(1);
		expect(pins).toHaveLength(0);
		expect(next[0]!.id).toBe("a");
	});
});

describe("removeComment", () => {
	it("removes by id without mutating", () => {
		const pins = [pin("a", "#a"), pin("b", "#b")];
		const next = removeComment(pins, "a");
		expect(next.map((p) => p.id)).toEqual(["b"]);
		expect(pins).toHaveLength(2);
	});

	it("is a no-op for an unknown id", () => {
		const pins = [pin("a", "#a")];
		expect(removeComment(pins, "zzz")).toHaveLength(1);
	});
});

describe("reanchorComments", () => {
	it("re-resolves selectors against a re-rendered document", () => {
		document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
		const pins = [pin("1", "#a"), pin("2", "#b")];
		const next = reanchorComments(pins, document);
		expect(next.every((p) => p.resolved)).toBe(true);
		// rect should reflect the live element's bounding box
		expect(next[0]!.rect).toBeDefined();
	});

	it("flags pins whose selector no longer resolves", () => {
		document.body.innerHTML = '<div id="a"></div>';
		const pins = [pin("1", "#a"), pin("2", "#gone")];
		const next = reanchorComments(pins, document);
		expect(next[0]!.resolved).toBe(true);
		expect(next[1]!.resolved).toBe(false);
	});

	it("does not mutate the input pins", () => {
		document.body.innerHTML = '<div id="a"></div>';
		const pins = [pin("1", "#gone")];
		const original = pins[0]!.resolved;
		reanchorComments(pins, document);
		expect(pins[0]!.resolved).toBe(original);
	});
});
