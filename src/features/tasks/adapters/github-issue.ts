import type { GhIssue } from "@/lib/api";
import type { TaskListItem } from "../types";

const STATE_LABEL: Record<
	string,
	{ key: string; label: string; color: string }
> = {
	OPEN: { key: "open", label: "Open", color: "#3fb950" },
	CLOSED: { key: "closed", label: "Closed", color: "#8b949e" },
};

export function ghIssueToItem(issue: GhIssue): TaskListItem {
	const status = STATE_LABEL[issue.state] ?? {
		key: issue.state.toLowerCase(),
		label: issue.state,
		color: "#6e7681",
	};
	const assignee = issue.assignees[0] ?? issue.author ?? undefined;
	return {
		key: `issue:${issue.number}`,
		displayId: `#${issue.number}`,
		source: "github-issue",
		title: issue.title,
		status,
		labels: issue.labels.map((l) => ({ name: l.name, color: `#${l.color}` })),
		assignee: assignee ? { login: assignee.login, avatarUrl: null } : undefined,
		updatedAt: issue.updatedAt,
		url: issue.url,
	};
}
