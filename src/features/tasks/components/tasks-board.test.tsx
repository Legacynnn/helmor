import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskStatus } from "@/lib/api";
import { TasksBoard } from "./tasks-board";

afterEach(() => cleanup());

const TODO: TaskStatus = {
	id: "s-todo",
	name: "Todo",
	kind: "unstarted",
	color: null,
};
const DOING: TaskStatus = {
	id: "s-doing",
	name: "In Progress",
	kind: "started",
	color: null,
};

function makeTask(id: string, status: TaskStatus): Task {
	return {
		id,
		provider: "linear",
		externalId: id,
		identifier: id.toUpperCase(),
		title: `Task ${id}`,
		description: null,
		status,
		priority: "none",
		assignee: null,
		labels: [],
		project: null,
		url: null,
		teamId: "t",
		remoteUpdatedAt: null,
		agentFeedback: null,
		linkedWorkspaceId: null,
		syncedAt: null,
		dirty: false,
		updatedAt: null,
	};
}

const COLUMNS = [DOING, TODO];

describe("TasksBoard", () => {
	it("renders only the visible columns with their card counts", () => {
		render(
			<TasksBoard
				tasks={[makeTask("a", TODO), makeTask("b", DOING), makeTask("c", TODO)]}
				columns={COLUMNS}
				visibleColumnKeys={new Set(["s-todo", "s-doing"])}
				selectedTaskId={null}
				onSelectTask={() => {}}
				onMoveTask={() => {}}
			/>,
		);
		// Column names live in a header <span> (the status icon's <title> repeats
		// the name, so scope the query to the span).
		expect(screen.getByText("Todo", { selector: "span" })).toBeInTheDocument();
		expect(
			screen.getByText("In Progress", { selector: "span" }),
		).toBeInTheDocument();
		expect(screen.getByText("Task a")).toBeInTheDocument();
		expect(screen.getByText("Task b")).toBeInTheDocument();
	});

	it("hides columns not in visibleColumnKeys", () => {
		render(
			<TasksBoard
				tasks={[makeTask("a", TODO), makeTask("b", DOING)]}
				columns={COLUMNS}
				visibleColumnKeys={new Set(["s-doing"])}
				selectedTaskId={null}
				onSelectTask={() => {}}
				onMoveTask={() => {}}
			/>,
		);
		expect(
			screen.getByText("In Progress", { selector: "span" }),
		).toBeInTheDocument();
		expect(
			screen.queryByText("Todo", { selector: "span" }),
		).not.toBeInTheDocument();
		// Card from the hidden column is gone too.
		expect(screen.queryByText("Task a")).not.toBeInTheDocument();
	});

	it("selects a task when its card is clicked", () => {
		const onSelect = vi.fn();
		render(
			<TasksBoard
				tasks={[makeTask("a", TODO)]}
				columns={COLUMNS}
				visibleColumnKeys={new Set(["s-todo", "s-doing"])}
				selectedTaskId={null}
				onSelectTask={onSelect}
				onMoveTask={() => {}}
			/>,
		);
		fireEvent.click(screen.getByText("Task a"));
		expect(onSelect).toHaveBeenCalledWith("a");
	});
});
