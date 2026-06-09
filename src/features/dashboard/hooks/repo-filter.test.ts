import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { loadRepoFilter, saveRepoFilter } from "./repo-filter-storage";
import { type DashboardColumn, deriveRepoOptions } from "./use-dashboard-board";

const row = (id: string, repo: Partial<WorkspaceRow>): WorkspaceRow =>
	({ id, title: id, ...repo }) as WorkspaceRow;

describe("deriveRepoOptions", () => {
	it("returns distinct repos sorted by name", () => {
		const columns = [
			{
				rows: [
					row("1", { repoId: "r2", repoName: "Zebra" }),
					row("2", { repoId: "r1", repoName: "Alpha" }),
					row("3", { repoId: "r1", repoName: "Alpha" }),
				],
			},
			{ rows: [row("4", { repoId: "r3", repoName: "Mango" })] },
		] as unknown as DashboardColumn[];
		const repos = deriveRepoOptions(columns);
		expect(repos.map((r) => r.name)).toEqual(["Alpha", "Mango", "Zebra"]);
		expect(repos).toHaveLength(3);
	});

	it("skips rows without a repoId", () => {
		const columns = [
			{ rows: [row("1", {}), row("2", { repoId: "r1", repoName: "A" })] },
		] as unknown as DashboardColumn[];
		expect(deriveRepoOptions(columns).map((r) => r.id)).toEqual(["r1"]);
	});
});

describe("repo-filter storage", () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => localStorage.clear());

	it("defaults to an empty (all-repos) set when nothing is stored", () => {
		expect(loadRepoFilter().size).toBe(0);
	});

	it("round-trips a selection", () => {
		saveRepoFilter(new Set(["r1", "r2"]));
		expect([...loadRepoFilter()].sort()).toEqual(["r1", "r2"]);
	});

	it("clears storage when saving an empty set", () => {
		saveRepoFilter(new Set(["r1"]));
		saveRepoFilter(new Set());
		expect(loadRepoFilter().size).toBe(0);
	});

	it("ignores malformed stored values", () => {
		localStorage.setItem("helmor.dashboard.repoFilter", "{not json");
		expect(loadRepoFilter().size).toBe(0);
	});
});
