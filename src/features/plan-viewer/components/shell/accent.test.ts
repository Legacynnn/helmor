import { describe, expect, it } from "vitest";
import { accentClasses } from "./accent";

describe("accentClasses", () => {
	it("returns danger classes with red border + dark-mode header", () => {
		const danger = accentClasses("danger");
		expect(danger.container).toContain("border-red-500/45");
		expect(danger.header).toContain("text-red-600");
		expect(danger.header).toContain("dark:text-red-400");
		expect(danger.badge).toContain("text-red-600");
	});

	it("falls back to neutral for an unknown accent", () => {
		// @ts-expect-error intentionally passing an invalid accent
		expect(accentClasses("bogus")).toEqual(accentClasses("neutral"));
	});

	it("defaults to neutral when called with no argument", () => {
		expect(accentClasses()).toEqual(accentClasses("neutral"));
	});
});
