import { describe, expect, it } from "vitest";
import { pushSample, type ResourceSample } from "./history";

describe("pushSample", () => {
	it("appends and caps at 60 samples", () => {
		let history: ResourceSample[] = [];
		for (let i = 0; i < 70; i++) {
			history = pushSample(history, { cpuPercent: i, memoryBytes: i * 10 });
		}
		expect(history).toHaveLength(60);
		expect(history[0].cpuPercent).toBe(10); // oldest 10 dropped
		expect(history[59].cpuPercent).toBe(69);
	});

	it("returns a new array (no mutation)", () => {
		const history: ResourceSample[] = [];
		const next = pushSample(history, { cpuPercent: 1, memoryBytes: 1 });
		expect(history).toHaveLength(0);
		expect(next).toHaveLength(1);
	});
});
