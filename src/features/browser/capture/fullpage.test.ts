import { describe, expect, it } from "vitest";
import { computeSegments } from "./fullpage";

describe("fullpage — segment math", () => {
	it("single segment when scrollHeight <= viewportHeight", () => {
		const segs = computeSegments(600, 800);
		expect(segs).toHaveLength(1);
		expect(segs[0]).toEqual({ scrollY: 0, captureHeight: 600 });
	});

	it("two full segments for exactly 2x viewport", () => {
		const segs = computeSegments(1600, 800);
		expect(segs).toHaveLength(2);
		expect(segs[0]).toEqual({ scrollY: 0, captureHeight: 800 });
		expect(segs[1]).toEqual({ scrollY: 800, captureHeight: 800 });
	});

	it("remainder segment has the correct reduced (overlap-trimmed) height", () => {
		const segs = computeSegments(1000, 800);
		expect(segs).toHaveLength(2);
		expect(segs[1]).toEqual({ scrollY: 800, captureHeight: 200 });
	});

	it("respects overlap for lazy-load margin", () => {
		// 50px overlap: seg1 scrolls back 50px to re-capture lazy content, but
		// the captureHeight trims the 50px already covered by seg0.
		const segs = computeSegments(1600, 800, 50);
		expect(segs).toHaveLength(2);
		expect(segs[0]).toEqual({ scrollY: 0, captureHeight: 800 });
		expect(segs[1].scrollY).toBe(750);
		// last segment: page 1600, covered 800 ⇒ 800 remaining stacked.
		expect(segs[1].captureHeight).toBe(800);
	});

	it("trims the last segment's overlap so stacked heights equal scrollHeight", () => {
		// scrollHeight=1700, viewport=800, overlap=50.
		const segs = computeSegments(1700, 800, 50);
		const stacked = segs.reduce((sum, s) => sum + s.captureHeight, 0);
		expect(stacked).toBe(1700);
		// last segment carries the remainder after the two full 800 steps.
		expect(segs.at(-1)?.captureHeight).toBe(100);
	});

	it("throws for invalid inputs", () => {
		expect(() => computeSegments(-1, 800)).toThrow();
		expect(() => computeSegments(600, 0)).toThrow();
	});
});
