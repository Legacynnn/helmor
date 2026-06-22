import type { Task, TaskStatus, TaskStatusKind } from "@/lib/api";

/** Active work first; terminal states last. Shared by the list grouping and the
 * board columns so both order statuses identically. */
export const KIND_ORDER: Record<TaskStatusKind, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	completed: 3,
	canceled: 4,
};

export function statusKey(status: TaskStatus): string {
	return status.id || status.kind;
}

/** Distinct workflow states present in the task set, in display order. */
export function orderedStatuses(tasks: Task[]): TaskStatus[] {
	const seen = new Map<string, TaskStatus>();
	for (const task of tasks) {
		const key = statusKey(task.status);
		if (!seen.has(key)) seen.set(key, task.status);
	}
	return [...seen.values()].sort((a, b) => {
		const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
		return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
	});
}
