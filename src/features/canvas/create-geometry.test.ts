import { expect, it } from "vitest";
import { normalizeRect } from "./create-geometry";

it("normalizeRect spans two points dragged down-right", () => {
	expect(normalizeRect({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual({
		x: 10,
		y: 20,
		width: 100,
		height: 200,
	});
});

it("normalizeRect is direction-agnostic (drag up-left)", () => {
	expect(normalizeRect({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual({
		x: 10,
		y: 20,
		width: 100,
		height: 200,
	});
});
