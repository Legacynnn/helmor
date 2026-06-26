import { describe, expect, it } from "vitest";
import {
	DEFAULT_FRAME_SIZE,
	parseCoord,
	parseDimension,
	resolveFrameKind,
} from "./frame-kinds";

describe("resolveFrameKind", () => {
	it("prefers embedded content over the kind prop", () => {
		expect(
			resolveFrameKind("note", { hasPreview: true, hasWireframe: false }),
		).toBe("preview");
		expect(
			resolveFrameKind("preview", { hasPreview: false, hasWireframe: true }),
		).toBe("wireframe");
	});

	it("falls back to note for bodyless or old mind-map kinds", () => {
		const empty = { hasPreview: false, hasWireframe: false };
		expect(resolveFrameKind(undefined, empty)).toBe("note");
		expect(resolveFrameKind("resume", empty)).toBe("note");
		expect(resolveFrameKind("preview", empty)).toBe("note");
	});
});

describe("parseCoord", () => {
	it("parses finite numbers and rejects garbage", () => {
		expect(parseCoord("40")).toBe(40);
		expect(parseCoord(undefined)).toBeUndefined();
		expect(parseCoord("abc")).toBeUndefined();
	});

	it("clamps absurd values", () => {
		expect(parseCoord("99999999")).toBe(100_000);
		expect(parseCoord("-99999999")).toBe(-100_000);
	});
});

describe("parseDimension", () => {
	it("falls back when absent or unparseable", () => {
		expect(parseDimension(undefined, 200)).toBe(200);
		expect(parseDimension("nope", 200)).toBe(200);
	});

	it("clamps to a sane range", () => {
		expect(parseDimension("10", 200)).toBe(120);
		expect(parseDimension("9999", 200)).toBe(2000);
		expect(parseDimension("400", 200)).toBe(400);
	});
});

describe("DEFAULT_FRAME_SIZE", () => {
	it("sizes every kind, with preview taller than a note", () => {
		expect(DEFAULT_FRAME_SIZE.note.width).toBeGreaterThan(0);
		expect(DEFAULT_FRAME_SIZE.preview.height).toBeGreaterThan(
			DEFAULT_FRAME_SIZE.note.height,
		);
	});
});
