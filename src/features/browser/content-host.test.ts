import { describe, expect, it } from "vitest";
import { rectFromElement } from "./content-host";

describe("rectFromElement", () => {
	it("maps a DOMRect to a logical-pixel rect", () => {
		const el = {
			getBoundingClientRect: () => ({
				x: 12,
				y: 34,
				width: 800,
				height: 600,
				left: 12,
				top: 34,
				right: 812,
				bottom: 634,
				toJSON: () => ({}),
			}),
		} as unknown as HTMLElement;

		expect(rectFromElement(el)).toEqual({
			x: 12,
			y: 34,
			width: 800,
			height: 600,
		});
	});

	it("rounds fractional dimensions to whole logical pixels", () => {
		const el = {
			getBoundingClientRect: () => ({
				x: 10.4,
				y: 20.6,
				width: 100.2,
				height: 200.9,
			}),
		} as unknown as HTMLElement;

		expect(rectFromElement(el)).toEqual({
			x: 10,
			y: 21,
			width: 100,
			height: 201,
		});
	});
});
