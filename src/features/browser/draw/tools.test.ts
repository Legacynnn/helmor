import { describe, expect, it } from "vitest";
import {
	arrowEndpoint,
	boxFromPoints,
	type DrawShape,
	hitTestShape,
	type Point,
	shapeBounds,
	translateShape,
} from "./tools";

const pt = (x: number, y: number): Point => ({ x, y });

describe("tools — geometry primitives", () => {
	it("boxFromPoints normalises negative deltas", () => {
		const box = boxFromPoints(pt(100, 100), pt(50, 60));
		expect(box).toEqual({ x: 50, y: 60, w: 50, h: 40 });
	});

	it("boxFromPoints with positive deltas is identity", () => {
		const box = boxFromPoints(pt(10, 20), pt(80, 90));
		expect(box).toEqual({ x: 10, y: 20, w: 70, h: 70 });
	});

	it("arrowEndpoint returns the to-point unchanged", () => {
		expect(arrowEndpoint(pt(0, 0), pt(30, 40))).toEqual(pt(30, 40));
	});

	it("hitTestShape — box hit inside padding", () => {
		const shape: DrawShape = {
			kind: "box",
			id: "s1",
			from: pt(10, 10),
			to: pt(60, 60),
			color: "#f00",
			lineWidth: 2,
		};
		expect(hitTestShape(shape, pt(35, 35), 4)).toBe(true);
		expect(hitTestShape(shape, pt(5, 5), 4)).toBe(false);
	});

	it("hitTestShape — freehand path hit within threshold", () => {
		const shape: DrawShape = {
			kind: "freehand",
			id: "s2",
			points: [pt(0, 0), pt(10, 0), pt(20, 0)],
			color: "#00f",
			lineWidth: 2,
		};
		expect(hitTestShape(shape, pt(10, 2), 4)).toBe(true);
		expect(hitTestShape(shape, pt(10, 20), 4)).toBe(false);
	});

	it("translateShape moves all points", () => {
		const shape: DrawShape = {
			kind: "box",
			id: "s3",
			from: pt(0, 0),
			to: pt(10, 10),
			color: "#0f0",
			lineWidth: 1,
		};
		const moved = translateShape(shape, 5, 5);
		expect(moved.kind === "box" && moved.from).toEqual(pt(5, 5));
		expect(moved.kind === "box" && moved.to).toEqual(pt(15, 15));
	});

	it("shapeBounds covers a freehand path", () => {
		const shape: DrawShape = {
			kind: "freehand",
			id: "s4",
			points: [pt(5, 10), pt(30, 4), pt(12, 50)],
			color: "#000",
			lineWidth: 1,
		};
		expect(shapeBounds(shape)).toEqual({ x: 5, y: 4, w: 25, h: 46 });
	});

	it("translateShape moves a redact rect", () => {
		const shape: DrawShape = {
			kind: "redact",
			id: "r1",
			rect: { x: 10, y: 10, w: 20, h: 20 },
		};
		const moved = translateShape(shape, 4, 6);
		expect(moved.kind === "redact" && moved.rect).toEqual({
			x: 14,
			y: 16,
			w: 20,
			h: 20,
		});
	});
});
