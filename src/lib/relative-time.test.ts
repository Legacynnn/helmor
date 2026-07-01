import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
	it("returns null for nullish or invalid input", () => {
		expect(relativeTime(null)).toBeNull();
		expect(relativeTime(undefined)).toBeNull();
		expect(relativeTime("not-a-date")).toBeNull();
	});

	it("formats a past ISO timestamp with an 'ago' suffix", () => {
		const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
		const out = relativeTime(twoMinAgo);
		expect(out).toMatch(/ago$/);
	});
});
