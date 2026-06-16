import { describe, expect, it } from "vitest";
import {
	applyDragEnd,
	applyDragMove,
	applyDragStart,
	clampRect,
	cropRectFromDrag,
	type DragRectState,
	normalizeRect,
	scaleRect,
} from "./region";

const pt = (x: number, y: number) => ({ x, y });
const bounds = { x: 0, y: 0, w: 800, h: 600 };

describe("region capture — rect math", () => {
	it("applyDragStart sets origin, clears active rect", () => {
		const s = applyDragStart(
			{ dragging: false, origin: null, rect: null },
			pt(50, 80),
		);
		expect(s.dragging).toBe(true);
		expect(s.origin).toEqual(pt(50, 80));
		expect(s.rect).toBeNull();
	});

	it("applyDragMove produces a rect from origin to current", () => {
		let s: DragRectState = {
			dragging: true,
			origin: pt(100, 100),
			rect: null,
		};
		s = applyDragMove(s, pt(200, 250));
		expect(s.rect).toEqual({ x: 100, y: 100, w: 100, h: 150 });
	});

	it("normalizeRect handles negative width/height (drag up-left)", () => {
		const r = normalizeRect({ x: 200, y: 250, w: -100, h: -150 });
		expect(r).toEqual({ x: 100, y: 100, w: 100, h: 150 });
	});

	it("clampRect clips to viewport bounds", () => {
		const r = clampRect({ x: -10, y: -20, w: 900, h: 700 }, bounds);
		expect(r.x).toBe(0);
		expect(r.y).toBe(0);
		expect(r.w).toBe(800);
		expect(r.h).toBe(600);
	});

	it("clampRect of a fully out-of-bounds rect is zero-size", () => {
		const r = clampRect({ x: 900, y: 700, w: 50, h: 50 }, bounds);
		expect(r.w).toBe(0);
		expect(r.h).toBe(0);
	});

	it("scaleRect multiplies all values by dpr", () => {
		const r = scaleRect({ x: 10, y: 20, w: 100, h: 50 }, 2);
		expect(r).toEqual({ x: 20, y: 40, w: 200, h: 100 });
	});

	it("applyDragEnd commits rect and clears dragging", () => {
		let s: DragRectState = { dragging: true, origin: pt(10, 10), rect: null };
		s = applyDragMove(s, pt(50, 60));
		s = applyDragEnd(s);
		expect(s.dragging).toBe(false);
		expect(s.rect).toEqual({ x: 10, y: 10, w: 40, h: 50 });
	});

	it("applyDragMove is a no-op when not dragging", () => {
		const s: DragRectState = { dragging: false, origin: null, rect: null };
		const next = applyDragMove(s, pt(100, 100));
		expect(next.rect).toBeNull();
	});

	it("cropRectFromDrag normalizes, clamps, scales into a canvas CropRect", () => {
		// Drag up-left from (300,300) to (100,100): rect {100,100,200,200}.
		const crop = cropRectFromDrag(
			{ x: 300, y: 300, w: -200, h: -200 },
			{ w: 800, h: 600 },
			2,
		);
		// scale 2 ⇒ sx 200 sy 200 sw 400 sh 400 (within the 1600x1200 canvas).
		expect(crop).toEqual({ sx: 200, sy: 200, sw: 400, sh: 400 });
	});

	it("cropRectFromDrag clamps a rect overflowing the viewport before scaling", () => {
		// Rect extends past the 800x600 viewport; clamp then scale by 1.
		const crop = cropRectFromDrag(
			{ x: 700, y: 500, w: 400, h: 400 },
			{ w: 800, h: 600 },
			1,
		);
		expect(crop).toEqual({ sx: 700, sy: 500, sw: 100, sh: 100 });
	});

	it("cropRectFromDrag returns a zero-size crop for a degenerate drag", () => {
		const crop = cropRectFromDrag(
			{ x: 100, y: 100, w: 0, h: 0 },
			{ w: 800, h: 600 },
			2,
		);
		expect(crop).toEqual({ sx: 200, sy: 200, sw: 0, sh: 0 });
	});
});
