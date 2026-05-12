import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { Button } from "@/components/ui/button";
import { type LinearAuthStatus, linearGetAuthStatus } from "@/lib/api";
import { repositoriesQueryOptions } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./components/detail-screen";
import {
	EmptyConnectLinear,
	EmptyLinkLinearTeam,
	EmptyNoGitHubLogin,
	ErrorState,
} from "./components/empty-states";
import { ItemList } from "./components/item-list";
import { RepoSwitcher } from "./components/repo-switcher";
import { TabBar } from "./components/tab-bar";
import { useDetailKeyboard } from "./hooks/use-detail-keyboard";
import { useTasksFilters } from "./hooks/use-tasks-filters";
import { useTasksQuery } from "./hooks/use-tasks-query";
import type { TaskListItem, TasksTab } from "./types";

export function TasksScreenContainer({
	onOpenSettings,
	onSelectWorkspace,
	onStartWorkspaceFromTask,
}: {
	onOpenSettings: () => void;
	onSelectWorkspace: (workspaceId: string) => void;
	onStartWorkspaceFromTask: (opts: {
		repoId: string | null;
		seedUrl: string;
		seedTitle: string;
		linearTaskId: string | null;
		item: TaskListItem;
	}) => void;
}) {
	const reposQuery = useQuery(repositoriesQueryOptions());
	const repos = reposQuery.data ?? [];
	const [selectedRepoId, setSelectedRepoId] = useState<string | "all" | null>(
		null,
	);
	const [activeTab, setActiveTab] = useState<TasksTab>("tasks");
	const [selectedItem, setSelectedItem] = useState<TaskListItem | null>(null);

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
		linearTeamId:
			selectedRepoId === "all" ? null : (selectedRepo?.linearTeamId ?? null),
		filters: filtersHook.filters,
		repos,
	});

	useDetailKeyboard({
		items: tasks.items,
		selected: selectedItem,
		onSelect: setSelectedItem,
	});

	const body = (() => {
		if (selectedRepoId !== "all") {
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
		} else if (activeTab === "tasks") {
			// In "all repos" mode, still check Linear connection
			if (linearAuthQuery.data && !linearAuthQuery.data.connected) {
				return <EmptyConnectLinear onOpenSettings={onOpenSettings} />;
			}
		}
		if (tasks.isLoading) {
			return (
				<div className="flex h-full items-center justify-center">
					<HelmorLogoAnimated size={48} className="opacity-80" />
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
				selectedKey={selectedItem?.key ?? null}
				onSelectItem={setSelectedItem}
			/>
		);
	})();

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-w-0 items-center gap-3 border-b border-border/50 px-4 py-2">
				<RepoSwitcher
					repos={repos}
					selectedId={selectedRepoId}
					onSelect={(id) => setSelectedRepoId(id)}
				/>
				<div className="h-4 w-px bg-border" />
				<TabBar
					active={activeTab}
					onChange={(next) => {
						setActiveTab(next);
						setSelectedItem(null);
					}}
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
				<div className="ml-auto flex items-center">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => tasks.refetch()}
						disabled={tasks.isFetching}
						title="Refresh"
						aria-label="Refresh tasks"
					>
						<RefreshCw
							className={cn("size-4", tasks.isFetching && "animate-spin")}
						/>
					</Button>
				</div>
			</header>
			<div className="min-h-0 flex-1">
				{selectedItem ? (
					<DetailScreen
						item={selectedItem}
						repo={
							selectedRepoId !== "all" && selectedRepoId !== null
								? (repos.find((r) => r.id === selectedRepoId) ?? null)
								: selectedItem.repo
									? (repos.find((r) => r.id === selectedItem.repo!.id) ?? null)
									: null
						}
						onClose={() => setSelectedItem(null)}
						onOpenWorkspace={(id) => {
							onSelectWorkspace(id);
							setSelectedItem(null);
						}}
						onStartWorkspace={(item) => {
							onStartWorkspaceFromTask({
								repoId:
									selectedRepoId !== "all" && selectedRepoId !== null
										? selectedRepoId
										: (item.repo?.id ?? null),
								seedUrl: item.url,
								seedTitle: item.title,
								linearTaskId: item.source === "linear" ? item.key : null,
								item,
							});
						}}
					/>
				) : (
					body
				)}
			</div>
		</div>
	);
}
