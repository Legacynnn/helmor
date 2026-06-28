import { describe, expect, it } from "vitest";
import { createRope, step } from "./verlet-rope";

describe("verlet-rope", () => {
	it("creates a rope of segments+1 evenly spaced points", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
		expect(rope.points).toHaveLength(11);
		expect(rope.segmentLength).toBeCloseTo(10, 5);
		expect(rope.points[0]).toMatchObject({ x: 0, y: 0 });
		expect(rope.points[10]).toMatchObject({ x: 100, y: 0 });
	});

	it("keeps a pinned anchor and plug exactly in place", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		const plug = { x: 100, y: 0 };
		for (let i = 0; i < 20; i++) step(rope, { anchor, plug });
		expect(rope.points[0]).toMatchObject({ x: 0, y: 0 });
		expect(rope.points[8]).toMatchObject({ x: 100, y: 0 });
	});

	it("sags the free end downward under gravity", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		for (let i = 0; i < 60; i++) step(rope, { anchor, gravity: 0.6 });
		expect(rope.points[8].y).toBeGreaterThan(20);
	});

	it("keeps neighbour distances near the segment length after settling", () => {
		const rope = createRope({ x: 0, y: 0 }, { x: 80, y: 0 }, 8);
		const anchor = { x: 0, y: 0 };
		for (let i = 0; i < 80; i++) step(rope, { anchor, gravity: 0.6 });
		for (let i = 0; i < rope.points.length - 1; i++) {
			const a = rope.points[i];
			const b = rope.points[i + 1];
			const d = Math.hypot(b.x - a.x, b.y - a.y);
			expect(d).toBeGreaterThan(rope.segmentLength * 0.6);
			expect(d).toBeLessThan(rope.segmentLength * 1.4);
		}
	});

	it("pushes a point out of a collider rectangle to its nearest edge", () => {
		const rope = createRope({ x: 0, y: 100 }, { x: 100, y: 100 }, 8);
		const anchor = { x: 0, y: 100 };
		const plug = { x: 100, y: 100 };
		const collider = { x: 30, y: 90, w: 40, h: 40 };
		for (let i = 0; i < 40; i++)
			step(rope, { anchor, plug, colliders: [collider], gravity: 0.2 });
		for (const p of rope.points) {
			const inside =
				p.x > collider.x &&
				p.x < collider.x + collider.w &&
				p.y > collider.y &&
				p.y < collider.y + collider.h;
			expect(inside).toBe(false);
		}
	});
});
