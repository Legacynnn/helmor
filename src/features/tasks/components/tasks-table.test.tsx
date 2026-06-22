import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { TasksTable } from "./tasks-table";

afterEach(() => cleanup());

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "linear:ext-1",
		provider: "linear",
		externalId: "ext-1",
		identifier: "ENG-1",
		title: "Fix the login bug",
		description: null,
		status: { id: "s1", name: "In Progress", kind: "started", color: "#abc" },
		priority: "high",
		assignee: { id: "u1", name: "Dana Scully", avatarUrl: null },
		labels: [],
		project: null,
		url: "https://linear.app/x",
		teamId: "team-1",
		remoteUpdatedAt: new Date().toISOString(),
		agentFeedback: null,
		linkedWorkspaceId: null,
		syncedAt: null,
		dirty: false,
		updatedAt: null,
		...overrides,
	};
}

describe("TasksTable", () => {
	it("renders a row per task with identifier and title", () => {
		render(
			<TasksTable
				tasks={[
					makeTask(),
					makeTask({
						id: "linear:ext-2",
						identifier: "ENG-2",
						title: "Second",
					}),
				]}
				selectedTaskId={null}
				onSelectTask={() => {}}
			/>,
		);
		expect(screen.getByText("ENG-1")).toBeInTheDocument();
		expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
		expect(screen.getByText("Second")).toBeInTheDocument();
	});

	it("invokes onSelectTask with the task id on row click", () => {
		const onSelect = vi.fn();
		render(
			<TasksTable
				tasks={[makeTask()]}
				selectedTaskId={null}
				onSelectTask={onSelect}
			/>,
		);
		fireEvent.click(screen.getByText("Fix the login bug"));
		expect(onSelect).toHaveBeenCalledWith("linear:ext-1");
	});

	it("renders the status icon by its state name", () => {
		render(
			<TasksTable
				tasks={[makeTask()]}
				selectedTaskId={null}
				onSelectTask={() => {}}
			/>,
		);
		expect(
			screen.getByRole("img", { name: "In Progress" }),
		).toBeInTheDocument();
	});
});
