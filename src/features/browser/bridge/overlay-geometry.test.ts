import { describe, expect, it } from "vitest";
import {
	clampLabelPosition,
	dimensionLabel,
	outlineRectFor,
} from "./overlay-geometry";

describe("dimensionLabel", () => {
	it("formats width × height", () => {
		expect(dimensionLabel({ x: 0, y: 0, width: 320, height: 48 })).toBe(
			"320 × 48",
		);
	});

	it("rounds fractional pixels", () => {
		expect(dimensionLabel({ x: 0, y: 0, width: 120.6, height: 47.9 })).toBe(
			"121 × 48",
		);
	});
});

describe("outlineRectFor", () => {
	it("reads the bounding rect of an element", () => {
		const el = {
			getBoundingClientRect: () => ({
				x: 12,
				y: 34,
				width: 100,
				height: 50,
				top: 34,
				left: 12,
				right: 112,
				bottom: 84,
			}),
		} as unknown as Element;
		expect(outlineRectFor(el)).toEqual({
			x: 12,
			y: 34,
			width: 100,
			height: 50,
		});
	});
});

describe("clampLabelPosition", () => {
	const viewport = { width: 800, height: 600 };

	it("places the label above the rect by default", () => {
		const rect = { x: 100, y: 200, width: 120, height: 40 };
		const pos = clampLabelPosition(rect, { width: 60, height: 16 }, viewport);
		expect(pos.x).toBe(100);
		// above the rect: y - labelHeight - gap
		expect(pos.y).toBeLessThan(rect.y);
	});

	it("flips below the rect when there is no room above", () => {
		const rect = { x: 100, y: 0, width: 120, height: 40 };
		const pos = clampLabelPosition(rect, { width: 60, height: 16 }, viewport);
		expect(pos.y).toBeGreaterThanOrEqual(rect.y);
	});

	it("clamps x so the label stays within the right edge", () => {
		const rect = { x: 790, y: 200, width: 120, height: 40 };
		const pos = clampLabelPosition(rect, { width: 60, height: 16 }, viewport);
		expect(pos.x + 60).toBeLessThanOrEqual(viewport.width);
	});

	it("clamps x so the label never goes off the left edge", () => {
		const rect = { x: -50, y: 200, width: 120, height: 40 };
		const pos = clampLabelPosition(rect, { width: 60, height: 16 }, viewport);
		expect(pos.x).toBeGreaterThanOrEqual(0);
	});
});
