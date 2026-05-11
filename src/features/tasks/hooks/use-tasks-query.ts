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
import type { TaskListItem, TasksTab } from "../types";

const STALE_TIME = 60_000;

type Result = {
	items: TaskListItem[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
};

export function useTasksQuery(args: {
	tab: TasksTab;
	repoId: string | null;
	linearTeamId: string | null;
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

	const items: TaskListItem[] = (() => {
		if (args.tab === "tasks") {
			return (linear.data ?? []).map(linearIssueToItem);
		}
		if (args.tab === "prs") {
			return (prs.data ?? []).map(ghPrToItem);
		}
		return (issues.data ?? []).map(ghIssueToItem);
	})();

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
