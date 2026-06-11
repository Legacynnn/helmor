import { describe, expect, it } from "vitest";
import {
	buildSearchRequest,
	EMPTY_SEARCH_PARAMS,
	parseGlobList,
} from "./use-workspace-search";

describe("parseGlobList", () => {
	it("splits comma lists and trims whitespace", () => {
		expect(parseGlobList(" src/**, *.ts ,,docs ")).toEqual([
			"src/**",
			"*.ts",
			"docs",
		]);
	});

	it("returns empty for blank input", () => {
		expect(parseGlobList("")).toEqual([]);
		expect(parseGlobList("  ")).toEqual([]);
	});
});

describe("buildSearchRequest", () => {
	it("maps params to the backend request shape", () => {
		const request = buildSearchRequest("/ws", {
			...EMPTY_SEARCH_PARAMS,
			query: "needle",
			caseSensitive: true,
			includeGlobs: "*.ts",
			excludeGlobs: "dist/**, *.md",
		});
		expect(request).toEqual({
			workspaceRootPath: "/ws",
			query: "needle",
			caseSensitive: true,
			wholeWord: false,
			regex: false,
			includeGlobs: ["*.ts"],
			excludeGlobs: ["dist/**", "*.md"],
		});
	});
});
