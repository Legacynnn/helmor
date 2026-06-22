import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { TaskDetailView } from "./task-detail-view";

afterEach(() => cleanup());

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "linear:ext-1",
		provider: "linear",
		externalId: "ext-1",
		identifier: "ENG-1",
		title: "Fix the login bug",
		description: "Original body",
		status: { id: "s1", name: "In Progress", kind: "started", color: "#abc" },
		priority: "high",
		assignee: null,
		labels: [],
		project: null,
		url: "https://linear.app/x",
		teamId: "team-1",
		remoteUpdatedAt: null,
		agentFeedback: null,
		linkedWorkspaceId: null,
		syncedAt: null,
		dirty: false,
		updatedAt: null,
		...overrides,
	};
}

describe("TaskDetailView", () => {
	it("commits a title edit via onUpdate", () => {
		const onUpdate = vi.fn();
		render(
			<TaskDetailView
				task={makeTask()}
				statusOptions={[]}
				labelOptions={[]}
				assigneeOptions={[]}
				expanded={false}
				onToggleExpand={() => {}}
				isUpdating={false}
				onClose={() => {}}
				onUpdate={onUpdate}
			/>,
		);
		// Click the title to enter edit mode.
		fireEvent.click(screen.getByText("Fix the login bug"));
		const textarea = screen.getByDisplayValue("Fix the login bug");
		fireEvent.change(textarea, { target: { value: "Renamed task" } });
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(onUpdate).toHaveBeenCalledWith({ title: "Renamed task" });
	});

	it("renders an agent feedback panel when present", () => {
		render(
			<TaskDetailView
				task={makeTask({ agentFeedback: "Consider edge cases" })}
				statusOptions={[]}
				labelOptions={[]}
				assigneeOptions={[]}
				expanded={false}
				onToggleExpand={() => {}}
				isUpdating={false}
				onClose={() => {}}
				onUpdate={() => {}}
			/>,
		);
		expect(screen.getByText("Agent feedback")).toBeInTheDocument();
		expect(screen.getByText("Consider edge cases")).toBeInTheDocument();
	});

	it("shows the review + workspace actions only when handlers are given", () => {
		const onReview = vi.fn();
		render(
			<TaskDetailView
				task={makeTask()}
				statusOptions={[]}
				labelOptions={[]}
				assigneeOptions={[]}
				expanded={false}
				onToggleExpand={() => {}}
				isUpdating={false}
				onClose={() => {}}
				onUpdate={() => {}}
				onReview={onReview}
			/>,
		);
		fireEvent.click(screen.getByText("Ask agent to review"));
		expect(onReview).toHaveBeenCalled();
	});
});
