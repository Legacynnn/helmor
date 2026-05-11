import { useQuery } from "@tanstack/react-query";
import {
	type GhIssue,
	type GhPr,
	githubListRepoIssues,
	githubListRepoPrs,
	type LinearIssue,
	linearListTasks,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { ghIssueToItem } from "../adapters/github-issue";
import { ghPrToItem } from "../adapters/github-pr";
import { linearIssueToItem } from "../adapters/linear";
import type { PerTabFilters, TaskListItem, TasksTab } from "../types";

const STALE_TIME = 60_000;

type Result = {
	items: TaskListItem[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
};

function applyFilters(
	tab: TasksTab,
	items: TaskListItem[],
	filters: PerTabFilters,
): TaskListItem[] {
	const search = (
		tab === "tasks"
			? filters.tasks.search
			: tab === "prs"
				? filters.prs.search
				: filters.issues.search
	)
		.trim()
		.toLowerCase();

	let result = items;

	if (tab === "tasks") {
		const { status, assignee } = filters.tasks;
		if (status !== "all") {
			result = result.filter((i) =>
				status === "in-review"
					? i.status.key === "started"
					: i.status.key === status,
			);
		}
		if (assignee !== "any" && assignee !== "me") {
			result = result.filter((i) => i.assignee?.login === assignee);
		}
		// "me" treated as "any" for v1 — viewer resolution is a follow-up.
	} else if (tab === "prs") {
		const { state, assignee, linkedToIssue } = filters.prs;
		result = result.filter((i) => {
			if (state === "draft" && i.status.key !== "draft") return false;
			if (
				state === "open" &&
				i.status.key !== "open" &&
				i.status.key !== "draft"
			)
				return false;
			if (state === "merged" && i.status.key !== "merged") return false;
			if (state === "closed" && i.status.key !== "closed") return false;
			if (
				assignee !== "any" &&
				assignee !== "me" &&
				i.assignee?.login !== assignee
			)
				return false;
			if (linkedToIssue) {
				const hasRef = /#\d+/.test(i.title);
				if (!hasRef) return false;
			}
			return true;
		});
	} else {
		const { state, assignee, labels } = filters.issues;
		result = result.filter((i) => {
			if (state === "open" && i.status.key !== "open") return false;
			if (state === "closed" && i.status.key !== "closed") return false;
			if (
				assignee !== "any" &&
				assignee !== "me" &&
				i.assignee?.login !== assignee
			)
				return false;
			if (labels.length > 0) {
				const itemLabels = new Set(i.labels.map((l) => l.name));
				if (!labels.every((name) => itemLabels.has(name))) return false;
			}
			return true;
		});
	}

	if (search) {
		result = result.filter((i) => i.title.toLowerCase().includes(search));
	}

	return result;
}

export function useTasksQuery(args: {
	tab: TasksTab;
	repoId: string | null;
	linearTeamId: string | null;
	filters: PerTabFilters;
}): Result {
	const linearTeamId = args.linearTeamId;
	const repoId = args.repoId;

	const linear = useQuery<LinearIssue[]>({
		queryKey:
			repoId && linearTeamId
				? helmorQueryKeys.tasks.linear(repoId, linearTeamId)
				: ["tasks", "linear", "disabled"],
		queryFn: () => linearListTasks(linearTeamId as string),
		enabled: args.tab === "tasks" && !!repoId && !!linearTeamId,
		staleTime: STALE_TIME,
	});

	const prs = useQuery<GhPr[]>({
		queryKey: repoId
			? helmorQueryKeys.tasks.githubPrs(repoId)
			: ["tasks", "githubPrs", "disabled"],
		queryFn: () => githubListRepoPrs(repoId as string),
		enabled: args.tab === "prs" && !!repoId,
		staleTime: STALE_TIME,
	});

	const issues = useQuery<GhIssue[]>({
		queryKey: repoId
			? helmorQueryKeys.tasks.githubIssues(repoId)
			: ["tasks", "githubIssues", "disabled"],
		queryFn: () => githubListRepoIssues(repoId as string),
		enabled: args.tab === "issues" && !!repoId,
		staleTime: STALE_TIME,
	});

	const active =
		args.tab === "tasks" ? linear : args.tab === "prs" ? prs : issues;

	const rawItems: TaskListItem[] = (() => {
		if (args.tab === "tasks") {
			return (linear.data ?? []).map(linearIssueToItem);
		}
		if (args.tab === "prs") {
			return (prs.data ?? []).map(ghPrToItem);
		}
		return (issues.data ?? []).map(ghIssueToItem);
	})();

	const items = applyFilters(args.tab, rawItems, args.filters);

	return {
		items,
		isLoading: active.isLoading,
		isError: active.isError,
		error: active.error,
		refetch: () => {
			void active.refetch();
		},
	};
}
