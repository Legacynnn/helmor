import { describe, expect, it } from "vitest";
import { colorUtilityCss, keywordUtilityCss, scaleUtilityCss } from "./css";

describe("colorUtilityCss", () => {
	it("maps color prefixes to their CSS property", () => {
		expect(colorUtilityCss("bg", "#3b82f6")).toBe("background-color: #3b82f6");
		expect(colorUtilityCss("text", "#3b82f6")).toBe("color: #3b82f6");
		expect(colorUtilityCss("border", "#3b82f6")).toBe("border-color: #3b82f6");
		expect(colorUtilityCss("fill", "currentColor")).toBe("fill: currentColor");
	});

	it("passes through non-hex values (oklch, keywords)", () => {
		expect(colorUtilityCss("bg", "oklch(0.2 0 0)")).toBe(
			"background-color: oklch(0.2 0 0)",
		);
	});

	it("returns undefined for unknown prefix or missing value", () => {
		expect(colorUtilityCss("nope", "#fff")).toBeUndefined();
		expect(colorUtilityCss("bg", undefined)).toBeUndefined();
	});
});

describe("scaleUtilityCss", () => {
	it("resolves the spacing scale to rem", () => {
		expect(scaleUtilityCss("p", "4")).toBe("padding: 1rem");
		expect(scaleUtilityCss("mt", "2")).toBe("margin-top: 0.5rem");
		expect(scaleUtilityCss("gap", "0.5")).toBe("gap: 0.125rem");
	});

	it("handles px, zero, and fractions", () => {
		expect(scaleUtilityCss("p", "px")).toBe("padding: 1px");
		expect(scaleUtilityCss("m", "0")).toBe("margin: 0px");
		expect(scaleUtilityCss("w", "1/2")).toBe("width: 50%");
	});

	it("expands axis prefixes to two properties", () => {
		expect(scaleUtilityCss("px", "2")).toBe(
			"padding-left: 0.5rem; padding-right: 0.5rem",
		);
	});

	it("uses the right viewport unit for screen", () => {
		expect(scaleUtilityCss("w", "screen")).toBe("width: 100vw");
		expect(scaleUtilityCss("h", "screen")).toBe("height: 100vh");
		expect(scaleUtilityCss("min-h", "screen")).toBe("min-height: 100vh");
	});

	it("resolves keyword sizes", () => {
		expect(scaleUtilityCss("w", "full")).toBe("width: 100%");
		expect(scaleUtilityCss("h", "auto")).toBe("height: auto");
		expect(scaleUtilityCss("max-w", "min")).toBe("max-width: min-content");
	});

	it("returns undefined for unknown prefix", () => {
		expect(scaleUtilityCss("zzz", "4")).toBeUndefined();
	});
});

describe("keywordUtilityCss", () => {
	it("translates keyword utilities", () => {
		expect(keywordUtilityCss("flex")).toBe("display: flex");
		expect(keywordUtilityCss("items-center")).toBe("align-items: center");
		expect(keywordUtilityCss("rounded-lg")).toBe("border-radius: 0.5rem");
		expect(keywordUtilityCss("text-sm")).toBe(
			"font-size: 0.875rem; line-height: 1.25rem",
		);
	});

	it("returns undefined for unknown keywords", () => {
		expect(keywordUtilityCss("not-a-class")).toBeUndefined();
	});
});
