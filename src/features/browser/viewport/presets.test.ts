import { describe, expect, it } from "vitest";
import {
	DEVICE_PRESETS,
	deviceRectInHost,
	type ViewportPreset,
} from "./presets";

const host = { x: 100, y: 50, width: 1200, height: 800 };

describe("DEVICE_PRESETS", () => {
	it("includes mobile, tablet, desktop with known dimensions", () => {
		const byId = Object.fromEntries(DEVICE_PRESETS.map((p) => [p.id, p]));
		expect(byId.mobile.width).toBe(390);
		expect(byId.mobile.height).toBe(844);
		expect(byId.tablet.width).toBe(820);
		expect(byId.tablet.height).toBe(1180);
		expect(byId.desktop.width).toBeNull();
	});
});

describe("deviceRectInHost", () => {
	it("returns the host rect unchanged for desktop (fill)", () => {
		const preset: ViewportPreset = {
			id: "desktop",
			label: "Desktop",
			width: null,
			height: null,
		};
		expect(deviceRectInHost(preset, host)).toEqual(host);
	});

	it("centers a fixed-width device horizontally, top-aligned", () => {
		const preset: ViewportPreset = {
			id: "mobile",
			label: "Mobile",
			width: 390,
			height: 844,
		};
		// (1200 - 390) / 2 = 405 → x = 100 + 405 = 505
		expect(deviceRectInHost(preset, host)).toEqual({
			x: 505,
			y: 50,
			width: 390,
			height: 844,
		});
	});

	it("clamps a device larger than the host to the host size", () => {
		const preset: ViewportPreset = {
			id: "custom",
			label: "Custom",
			width: 2000,
			height: 2000,
		};
		expect(deviceRectInHost(preset, host)).toEqual({
			x: 100,
			y: 50,
			width: 1200,
			height: 800,
		});
	});
});

describe("preset application contract", () => {
	it("tablet projection differs from the raw host rect", () => {
		const tablet = DEVICE_PRESETS.find((p) => p.id === "tablet")!;
		const projected = deviceRectInHost(tablet, host);
		expect(projected.width).toBe(820);
		expect(projected).not.toEqual(host);
	});
});
