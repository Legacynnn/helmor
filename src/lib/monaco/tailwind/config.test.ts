import { describe, expect, it } from "vitest";
import {
	customTokensToClasses,
	parseConfigColorKeys,
	parseThemeTokens,
} from "./config";

describe("parseThemeTokens", () => {
	it("extracts color and font tokens from an @theme block", () => {
		const css = `
			@import "tailwindcss";
			@theme {
				--color-brand: #ff0066;
				--color-surface: oklch(0.2 0 0);
				--font-display: "Inter", sans-serif;
				--spacing-gutter: 2rem;
			}
		`;
		const tokens = parseThemeTokens(css);
		expect(tokens).toContainEqual({
			kind: "color",
			name: "brand",
			value: "#ff0066",
		});
		expect(tokens).toContainEqual({
			kind: "color",
			name: "surface",
			value: "oklch(0.2 0 0)",
		});
		expect(tokens).toContainEqual({
			kind: "font",
			name: "display",
			value: '"Inter", sans-serif',
		});
		// spacing tokens are ignored (not color/font)
		expect(tokens.some((t) => t.name === "gutter")).toBe(false);
	});

	it("returns nothing when there is no @theme block", () => {
		expect(parseThemeTokens(".foo { color: red; }")).toEqual([]);
	});
});

describe("parseConfigColorKeys", () => {
	it("extracts top-level color keys and literal values", () => {
		const config = `
			module.exports = {
				theme: {
					colors: {
						brand: "#123456",
						accent: "#abc",
					},
				},
			};
		`;
		const tokens = parseConfigColorKeys(config);
		expect(tokens).toContainEqual({
			kind: "color",
			name: "brand",
			value: "#123456",
		});
		expect(tokens).toContainEqual({
			kind: "color",
			name: "accent",
			value: "#abc",
		});
	});
});

describe("customTokensToClasses", () => {
	it("expands a color token across color prefixes with the value", () => {
		const classes = customTokensToClasses([
			{ kind: "color", name: "brand", value: "#ff0066" },
		]);
		const bg = classes.find((c) => c.name === "bg-brand");
		expect(bg).toBeDefined();
		expect(bg?.color).toBe("#ff0066");
		expect(classes.some((c) => c.name === "text-brand")).toBe(true);
		expect(classes.some((c) => c.name === "border-brand")).toBe(true);
	});

	it("maps a font token to a single font utility", () => {
		const classes = customTokensToClasses([{ kind: "font", name: "display" }]);
		expect(classes).toEqual([{ name: "font-display", detail: "theme font" }]);
	});
});
