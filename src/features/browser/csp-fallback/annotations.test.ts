import { describe, expect, it } from "vitest";
import {
	addAnnotation,
	type CanvasFit,
	type ImageAnnotation,
	nextSeq,
	removeAnnotation,
	toImagePoint,
	toRenderedPoint,
} from "./annotations";

const fit: CanvasFit = {
	naturalWidth: 1600,
	naturalHeight: 1200,
	renderedWidth: 800,
	renderedHeight: 600,
};

describe("toImagePoint", () => {
	it("scales a rendered click back to natural image coordinates", () => {
		expect(toImagePoint({ x: 400, y: 300 }, fit)).toEqual({ x: 800, y: 600 });
	});

	it("clamps clicks outside the rendered canvas to image bounds", () => {
		expect(toImagePoint({ x: 900, y: -10 }, fit)).toEqual({ x: 1600, y: 0 });
	});

	it("returns null for a zero-size rendered canvas", () => {
		expect(
			toImagePoint(
				{ x: 1, y: 1 },
				{ ...fit, renderedWidth: 0, renderedHeight: 0 },
			),
		).toBeNull();
	});

	it("rounds to whole pixels", () => {
		const point = toImagePoint({ x: 333, y: 111 }, fit);
		expect(Number.isInteger(point?.x)).toBe(true);
		expect(Number.isInteger(point?.y)).toBe(true);
	});
});

describe("toRenderedPoint", () => {
	it("is the inverse of toImagePoint for in-bounds points", () => {
		const rendered = toRenderedPoint({ x: 800, y: 600 }, fit);
		expect(rendered).toEqual({ x: 400, y: 300 });
	});

	it("returns origin for a degenerate image", () => {
		expect(
			toRenderedPoint({ x: 5, y: 5 }, { ...fit, naturalWidth: 0 }),
		).toEqual({ x: 0, y: 0 });
	});
});

describe("annotation list ops", () => {
	it("nextSeq starts at 1 and increments from the max", () => {
		expect(nextSeq([])).toBe(1);
		expect(nextSeq([{ seq: 1 }, { seq: 4 }])).toBe(5);
	});

	it("addAnnotation appends a numbered pin without mutating the input", () => {
		const start: ImageAnnotation[] = [];
		const next = addAnnotation(start, { x: 10, y: 20 }, "look here", "a1");
		expect(start).toHaveLength(0);
		expect(next).toEqual([
			{ id: "a1", seq: 1, point: { x: 10, y: 20 }, text: "look here" },
		]);
		const next2 = addAnnotation(next, { x: 5, y: 5 }, "", "a2");
		expect(next2[1].seq).toBe(2);
	});

	it("removeAnnotation drops by id without mutating the input", () => {
		const start = addAnnotation([], { x: 1, y: 1 }, "x", "a1");
		const next = removeAnnotation(start, "a1");
		expect(start).toHaveLength(1);
		expect(next).toHaveLength(0);
	});
});
