import { describe, expect, it } from "vitest";
import { frameTheme, normalizeAccent, normalizeTheme } from "./theme-modes";

describe("normalizeTheme", () => {
	it("defaults unknown/absent to repo", () => {
		expect(normalizeTheme(undefined)).toBe("repo");
		expect(normalizeTheme("bogus")).toBe("repo");
		expect(normalizeTheme("wireframe")).toBe("wireframe");
	});
});

describe("normalizeAccent", () => {
	it("passes through known accents, defaults to neutral", () => {
		expect(normalizeAccent("success")).toBe("success");
		expect(normalizeAccent("nope")).toBe("neutral");
		expect(normalizeAccent(undefined)).toBe("neutral");
	});
});

describe("frameTheme", () => {
	it("greyscales the body and ignores accent in wireframe mode", () => {
		const t = frameTheme("wireframe", "success");
		expect(t.bodyFilter).toContain("grayscale");
		// Accent dropped → neutral container (no emerald classes).
		expect(t.container).not.toContain("emerald");
	});

	it("routes through the accent and skips the filter in repo mode", () => {
		const t = frameTheme("repo", "success");
		expect(t.bodyFilter).toBe("");
		expect(t.container).toContain("emerald");
	});
});
