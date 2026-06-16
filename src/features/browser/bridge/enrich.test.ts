import { describe, expect, it } from "vitest";
import { CURATED_STYLE_PROPS, cropRect, curateComputedStyles } from "./enrich";

describe("curateComputedStyles", () => {
	it("keeps only the curated subset of properties", () => {
		const read = (prop: string): string => {
			const map: Record<string, string> = {
				display: "flex",
				position: "absolute",
				color: "rgb(0, 0, 0)",
				"unrelated-prop": "should-drop",
			};
			return map[prop] ?? "";
		};
		const out = curateComputedStyles(read);
		expect(out.display).toBe("flex");
		expect(out.position).toBe("absolute");
		expect(out.color).toBe("rgb(0, 0, 0)");
		expect(out).not.toHaveProperty("unrelated-prop");
	});

	it("drops empty values so the payload stays lean", () => {
		const read = (prop: string): string => (prop === "display" ? "block" : "");
		const out = curateComputedStyles(read);
		expect(out).toEqual({ display: "block" });
	});

	it("covers the documented curated property set", () => {
		expect(CURATED_STYLE_PROPS).toContain("display");
		expect(CURATED_STYLE_PROPS).toContain("margin");
		expect(CURATED_STYLE_PROPS).toContain("padding");
		expect(CURATED_STYLE_PROPS).toContain("font-family");
		expect(CURATED_STYLE_PROPS).toContain("background-color");
	});
});

describe("cropRect", () => {
	it("scales the element rect by the canvas device-pixel-ratio", () => {
		const rect = { x: 10, y: 20, width: 100, height: 50 };
		const crop = cropRect(rect, {
			scale: 2,
			canvasWidth: 800,
			canvasHeight: 600,
		});
		expect(crop).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
	});

	it("clamps to the canvas bounds so the crop never reads out of range", () => {
		const rect = { x: -10, y: -5, width: 1000, height: 1000 };
		const crop = cropRect(rect, {
			scale: 1,
			canvasWidth: 200,
			canvasHeight: 150,
		});
		expect(crop).toEqual({ sx: 0, sy: 0, sw: 200, sh: 150 });
	});

	it("returns a zero crop when the rect is fully off-canvas", () => {
		const rect = { x: 500, y: 500, width: 10, height: 10 };
		const crop = cropRect(rect, {
			scale: 1,
			canvasWidth: 200,
			canvasHeight: 150,
		});
		expect(crop.sw).toBe(0);
		expect(crop.sh).toBe(0);
	});

	it("rounds fractional pixels to whole canvas coordinates", () => {
		const rect = { x: 10.6, y: 20.4, width: 30.7, height: 40.2 };
		const crop = cropRect(rect, {
			scale: 1,
			canvasWidth: 800,
			canvasHeight: 600,
		});
		expect(Number.isInteger(crop.sx)).toBe(true);
		expect(Number.isInteger(crop.sw)).toBe(true);
	});
});
