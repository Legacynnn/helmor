export type TasksTab = "tasks" | "prs" | "issues";

export type TaskListItem = {
	/** Stable id within its source: Linear issue id, "pr:42", or "issue:7". */
	key: string;
	/** Display id: "SUPER-187" or "#42". */
	displayId: string;
	source: "linear" | "github-pr" | "github-issue";
	title: string;
	status: {
		/** Stable key for grouping ("started", "open", "draft", "in-review", ...). */
		key: string;
		label: string;
		color: string;
	};
	priority?: "urgent" | "high" | "medium" | "low" | "none";
	labels: { name: string; color: string }[];
	assignee?: { login: string; avatarUrl: string | null };
	updatedAt: string;
	url: string;
};
