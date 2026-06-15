import { describe, expect, it } from "vitest";
import { buildStaticCatalog, mergeCatalogs } from "./catalog";

describe("buildStaticCatalog", () => {
	const catalog = buildStaticCatalog();
	const names = new Set(catalog.map((c) => c.name));

	it("includes keyword utilities", () => {
		expect(names.has("flex")).toBe(true);
		expect(names.has("items-center")).toBe(true);
	});

	it("includes spacing/sizing scale utilities", () => {
		expect(names.has("p-4")).toBe(true);
		expect(names.has("gap-2")).toBe(true);
		expect(names.has("w-full")).toBe(true);
	});

	it("includes default palette color utilities with hex values", () => {
		const blue = catalog.find((c) => c.name === "bg-blue-500");
		expect(blue?.color).toBe("#3b82f6");
		expect(names.has("text-red-600")).toBe(true);
	});

	it("has no duplicate class names", () => {
		expect(names.size).toBe(catalog.length);
	});

	it("returns a stable memoized reference", () => {
		expect(buildStaticCatalog()).toBe(catalog);
	});
});

describe("mergeCatalogs", () => {
	it("lets workspace overrides win on name", () => {
		const merged = mergeCatalogs(
			[{ name: "bg-brand", color: "#000000" }],
			[{ name: "bg-brand", color: "#ffffff", detail: "theme color" }],
		);
		const entries = merged.filter((c) => c.name === "bg-brand");
		expect(entries).toHaveLength(1);
		expect(entries[0].color).toBe("#ffffff");
	});
});
