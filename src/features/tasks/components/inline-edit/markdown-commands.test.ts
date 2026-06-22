import { describe, expect, it } from "vitest";
import {
	applyCodeBlock,
	applyLinePrefix,
	applyLink,
	applyWrap,
} from "./markdown-commands";

describe("applyWrap", () => {
	it("wraps a selection with the marker", () => {
		const r = applyWrap({ value: "hello world", start: 0, end: 5 }, "**");
		expect(r.value).toBe("**hello** world");
		expect(r.value.slice(r.start, r.end)).toBe("hello");
	});

	it("unwraps when the selection is already wrapped", () => {
		const r = applyWrap({ value: "**hello** world", start: 0, end: 9 }, "**");
		expect(r.value).toBe("hello world");
		expect(r.value.slice(r.start, r.end)).toBe("hello");
	});

	it("inserts empty markers with a caret between them when nothing is selected", () => {
		const r = applyWrap({ value: "", start: 0, end: 0 }, "**");
		expect(r.value).toBe("****");
		expect(r.start).toBe(2);
		expect(r.end).toBe(2);
	});
});

describe("applyLinePrefix", () => {
	it("adds a prefix to each selected line", () => {
		const r = applyLinePrefix({ value: "a\nb", start: 0, end: 3 }, "- ");
		expect(r.value).toBe("- a\n- b");
	});

	it("toggles the prefix off when every line already has it", () => {
		const r = applyLinePrefix({ value: "- a\n- b", start: 0, end: 7 }, "- ");
		expect(r.value).toBe("a\nb");
	});

	it("numbers ordered lists", () => {
		const r = applyLinePrefix({ value: "a\nb", start: 0, end: 3 }, "1. ", {
			ordered: true,
		});
		expect(r.value).toBe("1. a\n2. b");
	});
});

describe("applyLink", () => {
	it("wraps the selection and selects the url slot", () => {
		const r = applyLink({ value: "click here", start: 6, end: 10 });
		expect(r.value).toBe("click [here](url)");
		expect(r.value.slice(r.start, r.end)).toBe("url");
	});
});

describe("applyCodeBlock", () => {
	it("fences the selection on its own lines", () => {
		const r = applyCodeBlock({ value: "x = 1", start: 0, end: 5 });
		expect(r.value).toBe("```\nx = 1\n```");
		expect(r.value.slice(r.start, r.end)).toBe("x = 1");
	});
});
