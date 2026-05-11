import type { GroupTone } from "@/lib/api";
import type { TaskListItem } from "./types";

export type TaskStatusTone = GroupTone | "todo";

export function taskStatusTone(status: TaskListItem["status"]): TaskStatusTone {
	const key = status.key.toLowerCase();
	if (
		key === "done" ||
		key === "completed" ||
		key === "closed" ||
		key === "merged"
	) {
		return "done";
	}
	if (key === "review" || key === "in-review") {
		return "review";
	}
	if (key === "canceled" || key === "cancelled") {
		return "canceled";
	}
	if (key === "started" || key === "in-progress" || key === "open") {
		return "progress";
	}
	if (key === "todo" || key === "unstarted") {
		return "todo";
	}
	return "backlog";
}
