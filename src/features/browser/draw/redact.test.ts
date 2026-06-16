import { describe, expect, it } from "vitest";
import {
	applyRedactToImageData,
	boxBlurPass,
	clampRedactRegion,
	redactRegionOnCanvas,
} from "./redact";

function makeImageData(
	w: number,
	h: number,
	fill: [number, number, number, number],
): ImageData {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = fill[0];
		data[i + 1] = fill[1];
		data[i + 2] = fill[2];
		data[i + 3] = fill[3];
	}
	return { data, width: w, height: h } as unknown as ImageData;
}

describe("redact — pixel masking", () => {
	it("boxBlurPass changes pixels (output differs from a sharp input)", () => {
		const w = 4;
		const h = 4;
		const data = new Uint8ClampedArray(w * h * 4); // all zeros
		data[0] = 255; // R of pixel (0,0)
		data[3] = 255; // A of pixel (0,0)
		for (let i = 7; i < data.length; i += 4) data[i] = 255; // fill alpha
		const img = { data, width: w, height: h } as unknown as ImageData;
		const out = boxBlurPass(img, 2);
		expect(out.data[0]).toBeLessThan(255);
	});

	it("applyRedactToImageData with 3 passes destroys solid color blocks", () => {
		const w = 8;
		const h = 8;
		const data = new Uint8ClampedArray(w * h * 4);
		for (let row = 0; row < h; row++) {
			for (let col = 0; col < w; col++) {
				const i = (row * w + col) * 4;
				data[i] = row < 4 ? 255 : 0; // R
				data[i + 2] = row < 4 ? 0 : 255; // B
				data[i + 3] = 255; // A
			}
		}
		const img = { data, width: w, height: h } as unknown as ImageData;
		const result = applyRedactToImageData(img, 3);
		const topLeftR = result.data[0];
		const bottomLeftB = result.data[(4 * w + 0) * 4 + 2];
		expect(topLeftR).toBeLessThan(255);
		expect(bottomLeftB).toBeLessThan(255);
	});

	it("applyRedactToImageData preserves the alpha channel", () => {
		const img = makeImageData(4, 4, [255, 0, 0, 200]);
		const result = applyRedactToImageData(img, 1);
		for (let i = 3; i < result.data.length; i += 4) {
			expect(result.data[i]).toBe(200);
		}
	});

	it("handles a 1x1 image without panic", () => {
		const img = makeImageData(1, 1, [128, 64, 32, 255]);
		expect(() => applyRedactToImageData(img, 3)).not.toThrow();
	});

	it("applyRedactToImageData returns input unchanged for zero-size", () => {
		const img = makeImageData(0, 0, [0, 0, 0, 0]);
		expect(applyRedactToImageData(img, 3)).toBe(img);
	});
});

describe("redact — region math", () => {
	it("clampRedactRegion normalises negative width/height", () => {
		const r = clampRedactRegion({ x: 200, y: 250, w: -100, h: -150 }, 800, 600);
		expect(r).toEqual({ x: 100, y: 100, w: 100, h: 150 });
	});

	it("clampRedactRegion clips to canvas bounds", () => {
		const r = clampRedactRegion({ x: -10, y: -20, w: 900, h: 700 }, 800, 600);
		expect(r).toEqual({ x: 0, y: 0, w: 800, h: 600 });
	});

	it("clampRedactRegion returns zero-size for an off-canvas rect", () => {
		const r = clampRedactRegion({ x: 1000, y: 1000, w: 50, h: 50 }, 800, 600);
		expect(r.w).toBe(0);
		expect(r.h).toBe(0);
	});

	it("redactRegionOnCanvas is a no-op for a zero-size rect", () => {
		const putCalls: unknown[] = [];
		const fakeCtx = {
			getImageData: () => makeImageData(0, 0, [0, 0, 0, 0]),
			putImageData: (...args: unknown[]) => putCalls.push(args),
		} as unknown as CanvasRenderingContext2D;
		redactRegionOnCanvas(fakeCtx, { x: 0, y: 0, w: 0, h: 0 });
		expect(putCalls).toHaveLength(0);
	});

	it("redactRegionOnCanvas reads then writes blurred pixels back", () => {
		const getCalls: unknown[] = [];
		const putCalls: unknown[] = [];
		const region = makeImageData(8, 8, [255, 0, 0, 255]);
		const fakeCtx = {
			getImageData: (...args: unknown[]) => {
				getCalls.push(args);
				return region;
			},
			putImageData: (...args: unknown[]) => putCalls.push(args),
		} as unknown as CanvasRenderingContext2D;
		// Provide a global ImageData shim for the putImageData path.
		const g = globalThis as { ImageData?: unknown };
		const had = "ImageData" in g;
		if (!had) {
			g.ImageData = class {
				data: Uint8ClampedArray;
				width: number;
				height: number;
				constructor(d: Uint8ClampedArray, w: number, h: number) {
					this.data = d;
					this.width = w;
					this.height = h;
				}
			};
		}
		redactRegionOnCanvas(fakeCtx, { x: 2, y: 3, w: 8, h: 8 }, 1);
		if (!had) delete g.ImageData;
		expect(getCalls).toHaveLength(1);
		expect(putCalls).toHaveLength(1);
	});
});
