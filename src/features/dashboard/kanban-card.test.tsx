import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { WorkspaceKanbanCard } from "./kanban-card";

afterEach(() => {
	cleanup();
});

function row(extra: Partial<WorkspaceRow> = {}): WorkspaceRow {
	return {
		id: "w1",
		title: "Fix login",
		branch: "fix/login",
		...extra,
	} as WorkspaceRow;
}

describe("WorkspaceKanbanCard", () => {
	it("renders title and branch", () => {
		render(
			<WorkspaceKanbanCard row={row()} running={false} onOpen={() => {}} />,
		);
		expect(screen.getByText("Fix login")).toBeInTheDocument();
		expect(screen.getByText("fix/login")).toBeInTheDocument();
	});

	it("shows the animated Helmor logo when running", () => {
		render(
			<WorkspaceKanbanCard row={row()} running={true} onOpen={() => {}} />,
		);
		expect(screen.getByLabelText("Running")).toBeInTheDocument();
	});

	it("does not show the running indicator when idle", () => {
		render(
			<WorkspaceKanbanCard row={row()} running={false} onOpen={() => {}} />,
		);
		expect(screen.queryByLabelText("Running")).not.toBeInTheDocument();
	});

	it("shows a PR badge when prSyncState is not none", () => {
		render(
			<WorkspaceKanbanCard
				row={row({ prSyncState: "open", prUrl: "https://x/pull/42" })}
				running={false}
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByText(/#42/)).toBeInTheDocument();
	});

	it("calls onOpen with the workspace id when clicked", () => {
		const onOpen = vi.fn();
		render(<WorkspaceKanbanCard row={row()} running={false} onOpen={onOpen} />);
		fireEvent.click(screen.getByRole("button", { name: /Fix login/ }));
		expect(onOpen).toHaveBeenCalledWith("w1");
	});
});
