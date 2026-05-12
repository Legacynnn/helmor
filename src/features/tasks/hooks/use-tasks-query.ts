import { useQueries, useQuery } from "@tanstack/react-query";
import {
	type GhIssue,
	type GhPr,
	githubListRepoIssues,
	githubListRepoPrs,
	type LinearIssue,
	linearListTasks,
	type RepositoryCreateOption,
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
	isFetching: boolean;
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
	repoId: string | "all" | null;
	linearTeamId: string | null;
	filters: PerTabFilters;
	repos: RepositoryCreateOption[];
}): Result {
	const isAllRepos = args.repoId === "all";
	const repoId = isAllRepos ? null : args.repoId;
	const linearTeamId = args.linearTeamId;

	// ── SINGLE-REPO BRANCH ──────────────────────────────────────────────────
	const linear = useQuery<LinearIssue[]>({
		queryKey:
			repoId && linearTeamId
				? helmorQueryKeys.tasks.linear(repoId, linearTeamId)
				: ["tasks", "linear", "disabled"],
		queryFn: () => linearListTasks(linearTeamId as string),
		enabled: !isAllRepos && args.tab === "tasks" && !!repoId && !!linearTeamId,
		staleTime: STALE_TIME,
	});

	const prs = useQuery<GhPr[]>({
		queryKey: repoId
			? helmorQueryKeys.tasks.githubPrs(repoId)
			: ["tasks", "githubPrs", "disabled"],
		queryFn: () => githubListRepoPrs(repoId as string),
		enabled: !isAllRepos && args.tab === "prs" && !!repoId,
		staleTime: STALE_TIME,
	});

	const issues = useQuery<GhIssue[]>({
		queryKey: repoId
			? helmorQueryKeys.tasks.githubIssues(repoId)
			: ["tasks", "githubIssues", "disabled"],
		queryFn: () => githubListRepoIssues(repoId as string),
		enabled: !isAllRepos && args.tab === "issues" && !!repoId,
		staleTime: STALE_TIME,
	});

	// ── ALL-REPOS BRANCH ────────────────────────────────────────────────────
	const linearRepos = isAllRepos
		? args.repos.filter((r) => r.linearTeamId)
		: [];
	const ghRepos = isAllRepos ? args.repos.filter((r) => r.forgeLogin) : [];

	const linearAllQueries = useQueries({
		queries: linearRepos.map((r) => ({
			queryKey: helmorQueryKeys.tasks.linear(r.id, r.linearTeamId as string),
			queryFn: () => linearListTasks(r.linearTeamId as string),
			enabled: args.tab === "tasks" && isAllRepos,
			staleTime: STALE_TIME,
		})),
	});

	const prAllQueries = useQueries({
		queries: ghRepos.map((r) => ({
			queryKey: helmorQueryKeys.tasks.githubPrs(r.id),
			queryFn: () => githubListRepoPrs(r.id),
			enabled: args.tab === "prs" && isAllRepos,
			staleTime: STALE_TIME,
		})),
	});

	const issueAllQueries = useQueries({
		queries: ghRepos.map((r) => ({
			queryKey: helmorQueryKeys.tasks.githubIssues(r.id),
			queryFn: () => githubListRepoIssues(r.id),
			enabled: args.tab === "issues" && isAllRepos,
			staleTime: STALE_TIME,
		})),
	});

	// ── BUILD RESULT ────────────────────────────────────────────────────────
	let items: TaskListItem[];
	let isLoading: boolean;
	let isFetching: boolean;
	let isError: boolean;
	let error: unknown;
	let refetch: () => void;

	if (isAllRepos) {
		const activeQueries =
			args.tab === "tasks"
				? linearAllQueries
				: args.tab === "prs"
					? prAllQueries
					: issueAllQueries;
		const activeRepos = args.tab === "tasks" ? linearRepos : ghRepos;

		const adapted: TaskListItem[] = [];
		activeQueries.forEach((q, i) => {
			const repo = activeRepos[i];
			if (!repo || !q.data) return;
			const tag = { id: repo.id, name: repo.name };
			if (args.tab === "tasks") {
				for (const d of q.data as LinearIssue[]) {
					adapted.push({ ...linearIssueToItem(d), repo: tag });
				}
			} else if (args.tab === "prs") {
				for (const d of q.data as GhPr[]) {
					adapted.push({ ...ghPrToItem(d), repo: tag });
				}
			} else {
				for (const d of q.data as GhIssue[]) {
					adapted.push({ ...ghIssueToItem(d), repo: tag });
				}
			}
		});

		adapted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		items = adapted;
		isLoading = activeQueries.some((q) => q.isLoading);
		isFetching = activeQueries.some((q) => q.isFetching);
		isError = activeQueries.some((q) => q.isError);
		error = activeQueries.find((q) => q.isError)?.error ?? null;
		refetch = () => {
			activeQueries.forEach((q) => {
				void q.refetch();
			});
		};
	} else {
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

		items = rawItems;
		isLoading = active.isLoading;
		isFetching = active.isFetching;
		isError = active.isError;
		error = active.error;
		refetch = () => {
			void active.refetch();
		};
	}

	const filtered = applyFilters(args.tab, items, args.filters);

	return { items: filtered, isLoading, isFetching, isError, error, refetch };
}
