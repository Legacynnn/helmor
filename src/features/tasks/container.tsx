import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LinearAuthStatus, linearGetAuthStatus } from "@/lib/api";
import { repositoriesQueryOptions } from "@/lib/query-client";
import {
	EmptyConnectLinear,
	EmptyLinkLinearTeam,
	EmptyNoGitHubLogin,
	ErrorState,
} from "./components/empty-states";
import { ItemList } from "./components/item-list";
import { RepoSwitcher } from "./components/repo-switcher";
import { TabBar } from "./components/tab-bar";
import { useTasksFilters } from "./hooks/use-tasks-filters";
import { useTasksQuery } from "./hooks/use-tasks-query";
import type { TasksTab } from "./types";

export function TasksScreenContainer({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	const reposQuery = useQuery(repositoriesQueryOptions());
	const repos = reposQuery.data ?? [];
	const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TasksTab>("tasks");

	useEffect(() => {
		if (!selectedRepoId && repos[0]) {
			setSelectedRepoId(repos[0].id);
		}
	}, [repos, selectedRepoId]);

	const linearAuthQuery = useQuery<LinearAuthStatus>({
		queryKey: ["linear", "auth-status"],
		queryFn: linearGetAuthStatus,
		staleTime: 60_000,
	});

	const selectedRepo = useMemo(
		() => repos.find((r) => r.id === selectedRepoId),
		[repos, selectedRepoId],
	);

	const filtersHook = useTasksFilters(selectedRepoId);

	// Restore last view (once when hydration completes)
	const restoredRef = useRef(false);
	useEffect(() => {
		if (!filtersHook.hydrated || restoredRef.current) return;
		restoredRef.current = true;
		if (filtersHook.lastView?.repoId) {
			setSelectedRepoId(filtersHook.lastView.repoId);
		}
		if (filtersHook.lastView?.tab) {
			setActiveTab(filtersHook.lastView.tab);
		}
	}, [filtersHook.hydrated, filtersHook.lastView]);

	// Save last view whenever repo/tab changes
	useEffect(() => {
		if (!filtersHook.hydrated) return;
		filtersHook.saveLastView({ repoId: selectedRepoId, tab: activeTab });
	}, [
		selectedRepoId,
		activeTab,
		filtersHook.hydrated,
		filtersHook.saveLastView,
	]);

	const tasks = useTasksQuery({
		tab: activeTab,
		repoId: selectedRepoId,
		linearTeamId: selectedRepo?.linearTeamId ?? null,
		filters: filtersHook.filters,
	});

	const body = (() => {
		if (!selectedRepo) {
			return <ErrorState message="Select a repository" />;
		}
		if (activeTab === "tasks") {
			if (linearAuthQuery.data && !linearAuthQuery.data.connected) {
				return <EmptyConnectLinear onOpenSettings={onOpenSettings} />;
			}
			if (!selectedRepo.linearTeamId) {
				return <EmptyLinkLinearTeam repoId={selectedRepo.id} />;
			}
		}
		if (activeTab !== "tasks" && !selectedRepo.forgeLogin) {
			return <EmptyNoGitHubLogin />;
		}
		if (tasks.isLoading) {
			return (
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					Loading…
				</div>
			);
		}
		if (tasks.isError) {
			return (
				<ErrorState
					message={
						tasks.error instanceof Error
							? tasks.error.message
							: "Something went wrong"
					}
				/>
			);
		}
		return (
			<ItemList
				items={tasks.items}
				collapsedGroups={filtersHook.collapsedGroups[activeTab] ?? []}
				onToggleCollapse={(key, collapsed) =>
					filtersHook.setCollapsedGroups(activeTab, key, collapsed)
				}
			/>
		);
	})();

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-3 border-b border-border/50 px-4 py-2">
				<RepoSwitcher
					repos={repos}
					selectedId={selectedRepoId}
					onSelect={setSelectedRepoId}
				/>
				<div className="h-4 w-px bg-border" />
				<TabBar
					active={activeTab}
					onChange={setActiveTab}
					linearFilters={filtersHook.filters.tasks}
					prFilters={filtersHook.filters.prs}
					issueFilters={filtersHook.filters.issues}
					onLinearFiltersChange={(next) =>
						filtersHook.setFilters((prev) => ({ ...prev, tasks: next }))
					}
					onPrFiltersChange={(next) =>
						filtersHook.setFilters((prev) => ({ ...prev, prs: next }))
					}
					onIssueFiltersChange={(next) =>
						filtersHook.setFilters((prev) => ({ ...prev, issues: next }))
					}
				/>
			</header>
			<div className="min-h-0 flex-1">{body}</div>
		</div>
	);
}
