import type { WorkspaceStatus } from "@/lib/api";

export const KANBAN_COLUMNS: readonly {
	status: WorkspaceStatus;
	label: string;
}[] = [
	{ status: "backlog", label: "Backlog" },
	{ status: "in-progress", label: "In progress" },
	{ status: "review", label: "In review" },
	{ status: "done", label: "Done" },
	{ status: "canceled", label: "Cancelled" },
];

export type KanbanColumnKey = WorkspaceStatus;
