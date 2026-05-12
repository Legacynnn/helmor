export type TasksTab = "tasks" | "prs" | "issues";

export type LinearStatusFilter =
	| "all"
	| "backlog"
	| "unstarted"
	| "started"
	| "in-review";

export type PrStateFilter = "open" | "draft" | "merged" | "closed";
export type IssueStateFilter = "open" | "closed";

export type AssigneeFilter = "any" | "me" | (string & {});

export type LinearFilters = {
	status: LinearStatusFilter;
	assignee: AssigneeFilter;
	search: string;
};

export type PrFilters = {
	state: PrStateFilter;
	assignee: AssigneeFilter;
	linkedToIssue: boolean;
	search: string;
};

export type IssueFilters = {
	state: IssueStateFilter;
	labels: string[];
	assignee: AssigneeFilter;
	search: string;
};

export type PerTabFilters = {
	tasks: LinearFilters;
	prs: PrFilters;
	issues: IssueFilters;
};

export type TasksLastView = {
	repoId: string | "all" | null;
	tab: TasksTab;
};

export const DEFAULT_FILTERS: PerTabFilters = {
	tasks: { status: "all", assignee: "any", search: "" },
	prs: { state: "open", assignee: "any", linkedToIssue: false, search: "" },
	issues: { state: "open", labels: [], assignee: "any", search: "" },
};

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
	/** GitHub issue "Type" (Bug/Feature/Task/etc.). Separate from labels. */
	type?: { name: string; color: string };
	labels: { name: string; color: string }[];
	assignee?: { login: string; avatarUrl: string | null };
	updatedAt: string;
	url: string;
	/** Set by the fan-out hook when repoId === "all". Adapters never set this. */
	repo?: { id: string; name: string };
};
