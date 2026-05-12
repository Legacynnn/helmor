import type { LinearIssue } from "@/lib/api";
import type { TaskListItem } from "../types";

const PRIORITY_LABELS: Record<number, TaskListItem["priority"]> = {
	1: "urgent",
	2: "high",
	3: "medium",
	4: "low",
};

export function linearIssueToItem(issue: LinearIssue): TaskListItem {
	return {
		key: issue.id,
		displayId: issue.identifier,
		source: "linear",
		title: issue.title,
		status: {
			key: issue.state.type,
			label: issue.state.name,
			color: issue.state.color,
		},
		priority: PRIORITY_LABELS[issue.priority] ?? "none",
		labels: issue.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
		assignee: issue.assignee
			? { login: issue.assignee.name, avatarUrl: issue.assignee.avatarUrl }
			: undefined,
		updatedAt: issue.updatedAt,
		url: issue.url,
	};
}
