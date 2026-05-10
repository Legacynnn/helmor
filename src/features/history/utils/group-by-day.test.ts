import { describe, expect, it } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { filterRows, groupByDay } from "./group-by-day";

function row(id: string, updatedAt: string, extra: Partial<WorkspaceRow> = {}) {
	return {
		id,
		title: id,
		updatedAt,
		...extra,
	} satisfies WorkspaceRow;
}

// Build all timestamps via local-time Date so the tests are tz-independent.
const localIso = (y: number, m: number, d: number, h = 12) =>
	new Date(y, m - 1, d, h, 0, 0, 0).toISOString();
const NOW = new Date(2026, 4, 10, 18, 0, 0, 0).getTime();

describe("groupByDay", () => {
	it("buckets into Today / Yesterday / N days ago", () => {
		const rows = [
			row("a", localIso(2026, 5, 10, 15)),
			row("b", localIso(2026, 5, 9, 22)),
			row("c", localIso(2026, 5, 8, 10)),
			row("d", localIso(2026, 5, 1, 10)),
		];
		const groups = groupByDay(rows, NOW);
		const labels = groups.map((g) => g.label);
		expect(labels[0]).toBe("Today");
		expect(labels[1]).toBe("Yesterday");
		expect(labels[2]).toBe("2 days ago");
		expect(labels[3]).toBe("May 1");
	});

	it("sorts groups newest-first and rows within each bucket newest-first", () => {
		const rows = [
			row("old-today", localIso(2026, 5, 10, 8)),
			row("new-today", localIso(2026, 5, 10, 17)),
			row("yest", localIso(2026, 5, 9, 10)),
		];
		const groups = groupByDay(rows, NOW);
		expect(groups[0].rows.map((r) => r.id)).toEqual(["new-today", "old-today"]);
		expect(groups[1].rows[0].id).toBe("yest");
	});

	it("falls back through lastUserMessageAt -> updatedAt -> createdAt", () => {
		const rows = [
			row("uses-last", localIso(2020, 1, 1, 0), {
				lastUserMessageAt: localIso(2026, 5, 10, 12),
			}),
			row("uses-created", "", {
				updatedAt: undefined,
				createdAt: localIso(2026, 5, 9, 12),
			}),
		];
		const groups = groupByDay(rows, NOW);
		expect(groups[0].rows[0].id).toBe("uses-last");
		expect(groups[1].rows[0].id).toBe("uses-created");
	});

	it("drops rows without any timestamp", () => {
		const rows = [
			row("ghost", "", {
				updatedAt: undefined,
				createdAt: undefined,
				lastUserMessageAt: null,
			}),
		];
		expect(groupByDay(rows, NOW)).toEqual([]);
	});
});

describe("filterRows", () => {
	const rows = [
		row("1", "2026-05-10T00:00:00Z", {
			title: "Madrid v1",
			repoName: "helmor",
			branch: "feature/madrid",
		}),
		row("2", "2026-05-09T00:00:00Z", {
			title: "Polish sidebar",
			repoName: "helmor",
			branch: "polish",
		}),
		row("3", "2026-05-08T00:00:00Z", {
			title: "Refactor",
			repoName: "vpay-server",
			branch: "ref",
		}),
	];

	it("returns all when query empty", () => {
		expect(filterRows(rows, "  ")).toHaveLength(3);
	});

	it("filters by title, repo, branch (case-insensitive)", () => {
		expect(filterRows(rows, "madrid").map((r) => r.id)).toEqual(["1"]);
		expect(filterRows(rows, "VPAY").map((r) => r.id)).toEqual(["3"]);
		expect(filterRows(rows, "polish").map((r) => r.id)).toEqual(["2"]);
	});
});
