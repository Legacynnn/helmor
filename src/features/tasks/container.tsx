import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

	const tasks = useTasksQuery({
		tab: activeTab,
		repoId: selectedRepoId,
		linearTeamId: selectedRepo?.linearTeamId ?? null,
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
				return <EmptyLinkLinearTeam onPickTeam={onOpenSettings} />;
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
		return <ItemList items={tasks.items} />;
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
				<TabBar active={activeTab} onChange={setActiveTab} />
			</header>
			<div className="min-h-0 flex-1">{body}</div>
		</div>
	);
}
