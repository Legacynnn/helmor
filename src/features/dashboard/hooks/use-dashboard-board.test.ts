import { describe, expect, it } from "vitest";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import {
	buildDashboardColumns,
	DASHBOARD_COLUMNS,
} from "./use-dashboard-board";

function row(id: string): WorkspaceRow {
	return { id, title: id } as WorkspaceRow;
}

describe("buildDashboardColumns", () => {
	it("produces the 5 status columns in fixed order", () => {
		const cols = buildDashboardColumns([]);
		expect(cols.map((c) => c.id)).toEqual([
			"backlog",
			"progress",
			"review",
			"done",
			"canceled",
		]);
		expect(DASHBOARD_COLUMNS.length).toBe(5);
	});

	it("places rows into their status column and merges pinned/chats/ai-tasks by status", () => {
		const groups: WorkspaceGroup[] = [
			{
				id: "progress",
				label: "In progress",
				tone: "progress",
				rows: [row("a")],
			},
			{ id: "done", label: "Done", tone: "progress", rows: [row("b")] },
			{
				id: "pinned",
				label: "Pinned",
				tone: "progress",
				rows: [{ ...row("c"), status: "review" } as WorkspaceRow],
			},
		] as WorkspaceGroup[];
		const cols = buildDashboardColumns(groups);
		const byId = Object.fromEntries(
			cols.map((c) => [c.id, c.rows.map((r) => r.id)]),
		);
		expect(byId.progress).toEqual(["a"]);
		expect(byId.done).toEqual(["b"]);
		expect(byId.review).toEqual(["c"]);
	});
});
