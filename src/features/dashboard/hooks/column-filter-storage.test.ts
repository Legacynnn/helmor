import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadColumnFilter, saveColumnFilter } from "./column-filter-storage";

const columns = ["backlog", "progress", "review"] as const;

describe("column-filter storage", () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => localStorage.clear());

	it("defaults to all columns when nothing is stored", () => {
		expect([...loadColumnFilter(columns)]).toEqual([
			"backlog",
			"progress",
			"review",
		]);
	});

	it("round-trips a visible-column selection", () => {
		saveColumnFilter(new Set(["backlog", "review"]), columns);
		expect([...loadColumnFilter(columns)]).toEqual(["backlog", "review"]);
	});

	it("clears storage when every column is visible", () => {
		saveColumnFilter(new Set(["backlog"]), columns);
		saveColumnFilter(new Set(columns), columns);
		expect(localStorage.getItem("helmor.dashboard.visibleColumns")).toBeNull();
	});

	it("ignores malformed and empty stored values", () => {
		localStorage.setItem("helmor.dashboard.visibleColumns", "{not json");
		expect([...loadColumnFilter(columns)]).toEqual([
			"backlog",
			"progress",
			"review",
		]);

		localStorage.setItem("helmor.dashboard.visibleColumns", "[]");
		expect([...loadColumnFilter(columns)]).toEqual([
			"backlog",
			"progress",
			"review",
		]);
	});
});
