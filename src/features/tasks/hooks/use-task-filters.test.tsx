import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/api";
import { facetsForProvider } from "../filters/facets";
import { useTaskFilters } from "./use-task-filters";

function makeTask(overrides: Partial<Task>): Task {
	return {
		id: "id",
		provider: "linear",
		externalId: "ext",
		identifier: "ENG-1",
		title: "Task",
		description: null,
		status: { id: "s", name: "Todo", kind: "unstarted", color: null },
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
		...overrides,
	};
}

const facets = facetsForProvider("linear");

const TASKS: Task[] = [
	makeTask({
		id: "a",
		priority: "urgent",
		project: { id: "p1", name: "Alpha", icon: null, color: null },
	}),
	makeTask({
		id: "b",
		priority: "low",
		project: { id: "p1", name: "Alpha", icon: null, color: null },
	}),
	makeTask({
		id: "c",
		priority: "urgent",
		project: { id: "p2", name: "Beta", icon: null, color: null },
	}),
	makeTask({
		id: "d",
		priority: "low",
		assignee: { id: "u1", name: "Mara", avatarUrl: null },
	}),
];

describe("useTaskFilters", () => {
	it("returns all tasks when nothing is selected", () => {
		const { result } = renderHook(() => useTaskFilters(TASKS, facets));
		expect(result.current.filtered).toHaveLength(4);
		expect(result.current.activeCount).toBe(0);
	});

	it("filters by a single facet (OR within the facet)", () => {
		const { result } = renderHook(() => useTaskFilters(TASKS, facets));
		act(() => result.current.toggle("priority", "urgent"));
		expect(result.current.filtered.map((t) => t.id)).toEqual(["a", "c"]);
		expect(result.current.activeCount).toBe(1);
	});

	it("ANDs across facets", () => {
		const { result } = renderHook(() => useTaskFilters(TASKS, facets));
		act(() => result.current.toggle("priority", "urgent"));
		act(() => result.current.toggle("project", "p1"));
		expect(result.current.filtered.map((t) => t.id)).toEqual(["a"]);
	});

	it("clears a facet and clears all", () => {
		const { result } = renderHook(() => useTaskFilters(TASKS, facets));
		act(() => result.current.toggle("priority", "urgent"));
		act(() => result.current.clearFacet("priority"));
		expect(result.current.filtered).toHaveLength(4);

		act(() => result.current.toggle("project", "p2"));
		act(() => result.current.clearAll());
		expect(result.current.activeCount).toBe(0);
		expect(result.current.filtered).toHaveLength(4);
	});
});
