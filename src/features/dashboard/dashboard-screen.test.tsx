import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import type { DashboardColumn } from "./hooks/use-dashboard-board";
import { DashboardScreen } from "./index";

afterEach(() => cleanup());

function col(
	id: DashboardColumn["id"],
	label: string,
	rows: WorkspaceRow[],
): DashboardColumn {
	return { id, label, rows };
}
const r = (id: string, status: string): WorkspaceRow =>
	({ id, title: id, status }) as WorkspaceRow;

const columns: DashboardColumn[] = [
	col("progress", "In progress", [r("a", "in-progress")]),
	col("review", "Review", []),
	col("done", "Done", [r("b", "done")]),
	col("backlog", "Backlog", []),
	col("canceled", "Canceled", []),
];

describe("DashboardScreen", () => {
	it("renders all five columns with labels", () => {
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={() => {}}
				onMoveWorkspace={() => {}}
			/>,
		);
		for (const label of [
			"In progress",
			"Review",
			"Done",
			"Backlog",
			"Canceled",
		]) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
		expect(screen.getByText("a")).toBeInTheDocument();
		expect(screen.getByText("b")).toBeInTheDocument();
	});

	it("shows an empty placeholder in empty columns", () => {
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={() => {}}
				onMoveWorkspace={() => {}}
			/>,
		);
		expect(screen.getAllByText("No workspaces").length).toBeGreaterThanOrEqual(
			3,
		);
	});

	it("invokes onOpenWorkspace when a card is clicked", () => {
		const onOpen = vi.fn();
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={onOpen}
				onMoveWorkspace={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "a" }));
		expect(onOpen).toHaveBeenCalledWith("a");
	});

	it("calls onMoveWorkspace with the target column id on drop", () => {
		const onMove = vi.fn();
		render(
			<DashboardScreen
				columns={columns}
				runningWorkspaceIds={new Set()}
				totalRunning={0}
				onOpenWorkspace={() => {}}
				onMoveWorkspace={onMove}
			/>,
		);
		const card = screen.getByRole("button", { name: "a" });
		const target = screen.getByLabelText("Done column");
		fireEvent.dragStart(card, {
			dataTransfer: { setData: () => {}, getData: () => "a" },
		});
		fireEvent.drop(target, { dataTransfer: { getData: () => "a" } });
		expect(onMove).toHaveBeenCalledWith({
			workspaceId: "a",
			targetColumnId: "done",
			beforeWorkspaceId: null,
		});
	});
});
