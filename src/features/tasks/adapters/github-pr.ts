import type { GhPr } from "@/lib/api";
import type { TaskListItem } from "../types";

const STATE_LABEL: Record<
	string,
	{ key: string; label: string; color: string }
> = {
	OPEN: { key: "open", label: "Open", color: "#3fb950" },
	MERGED: { key: "merged", label: "Merged", color: "#8957e5" },
	CLOSED: { key: "closed", label: "Closed", color: "#f85149" },
};

export function ghPrToItem(pr: GhPr): TaskListItem {
	const baseStatus = STATE_LABEL[pr.state] ?? {
		key: pr.state.toLowerCase(),
		label: pr.state,
		color: "#6e7681",
	};
	const status = pr.isDraft
		? { key: "draft", label: "Draft", color: "#6e7681" }
		: baseStatus;
	const assignee = pr.assignees[0] ?? pr.author ?? undefined;
	return {
		key: `pr:${pr.number}`,
		displayId: `#${pr.number}`,
		source: "github-pr",
		title: pr.title,
		status,
		labels: pr.labels.map((l) => ({ name: l.name, color: `#${l.color}` })),
		assignee: assignee
			? {
					login: assignee.login,
					avatarUrl: `https://github.com/${assignee.login}.png?size=48`,
				}
			: undefined,
		updatedAt: pr.updatedAt,
		url: pr.url,
	};
}
