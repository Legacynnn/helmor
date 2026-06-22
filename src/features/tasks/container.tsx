import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type IntegrationProvider,
	listTaskAssignees,
	listTaskLabels,
	listTaskProjects,
	listTaskStatuses,
	type Task,
	type TaskStatus,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { ScreenHeader } from "@/shell/components/screen-header";
import type { TasksScreenProps } from ".";
import { BoardColumnFilter } from "./components/board-column-filter";
import { CreateTaskDialog } from "./components/create-task-dialog";
import { TasksEmptyState } from "./components/empty-state";
import { ProviderTabBar } from "./components/provider-tab-bar";
import { StartWorkspaceDialog } from "./components/start-workspace-dialog";
import { TaskDetailView } from "./components/task-detail-view";
import { TaskFilterBar } from "./components/task-filter-bar";
import { TasksBoard } from "./components/tasks-board";
import { TasksTable } from "./components/tasks-table";
import { type TasksView, ViewToggle } from "./components/view-toggle";
import { facetsForProvider } from "./filters/facets";
import { orderedStatuses, statusKey } from "./filters/status-order";
import { useIntegrationStatus } from "./hooks/use-integration-status";
import { useReviewTask } from "./hooks/use-task-actions";
import { useTaskFilters } from "./hooks/use-task-filters";
import { useAutoSync, useSyncTasks, useTasks } from "./hooks/use-tasks";
import { useUpdateTask } from "./hooks/use-update-task";

const VIEW_STORAGE_KEY = "helmor-tasks-view";
const PROVIDER_STORAGE_KEY = "helmor-tasks-provider";

function loadView(): TasksView {
	try {
		return localStorage.getItem(VIEW_STORAGE_KEY) === "board"
			? "board"
			: "list";
	} catch {
		return "list";
	}
}

function loadProvider(): IntegrationProvider {
	try {
		return localStorage.getItem(PROVIDER_STORAGE_KEY) === "github"
			? "github"
			: "linear";
	} catch {
		return "linear";
	}
}

// Navigation to seeded workspaces is handled by the app's pending-CLI-send
// pipeline (the backend queues a prompt + fires `pendingCliSendQueued`), so the
// screen-host actions are unused here for now.
export function TasksContainer(_props: TasksScreenProps) {
	const [provider, setProvider] = useState<IntegrationProvider>(loadProvider);
	const queryClient = useQueryClient();
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	// When set, the task is shown as a focused full page instead of the drawer.
	const [fullTaskId, setFullTaskId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [startWorkspaceOpen, setStartWorkspaceOpen] = useState(false);
	const [view, setView] = useState<TasksView>(loadView);
	// Track only explicitly-hidden columns so newly-appearing statuses default
	// to visible.
	const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const statusQuery = useIntegrationStatus(provider);
	const status = statusQuery.data;
	const connected = status?.connected ?? false;
	const teamId = status?.selectedTeamId ?? null;

	const tasksQuery = useTasks(provider, teamId, connected && Boolean(teamId));
	// Full workflow-state list for the team, so the board can show every column
	// (even empty ones), not just statuses that currently have issues.
	const statusesQuery = useQuery({
		queryKey: helmorQueryKeys.taskStatuses(provider, teamId),
		queryFn: () => listTaskStatuses(provider, teamId),
		enabled: connected && Boolean(teamId),
	});
	// Full project list for the team, so the project filter shows every project,
	// not only ones that have a synced issue.
	const projectsQuery = useQuery({
		queryKey: helmorQueryKeys.taskProjects(provider, teamId),
		queryFn: () => listTaskProjects(provider, teamId),
		enabled: connected && Boolean(teamId),
	});
	// Full team label set, for the task detail tag editor.
	const labelsQuery = useQuery({
		queryKey: helmorQueryKeys.taskLabels(provider, teamId),
		queryFn: () => listTaskLabels(provider, teamId),
		enabled: connected && Boolean(teamId),
	});
	// Active team members, for the assignee picker.
	const assigneesQuery = useQuery({
		queryKey: helmorQueryKeys.taskAssignees(provider, teamId),
		queryFn: () => listTaskAssignees(provider, teamId),
		enabled: connected && Boolean(teamId),
	});
	const syncMutation = useSyncTasks(provider, teamId);
	const updateMutation = useUpdateTask();
	const reviewMutation = useReviewTask();

	useAutoSync({
		provider,
		teamId,
		connected,
		lastSyncedAt: status?.lastSyncedAt,
		sync: () => syncMutation.mutate(),
	});

	const tasks = tasksQuery.data ?? [];
	const syncing = syncMutation.isPending;

	// Distinct workflow states currently in use, for the status picker. (v1:
	// derived from synced tasks rather than a separate workflowStates fetch.)
	const statusOptions = useMemo<TaskStatus[]>(() => {
		const seen = new Map<string, TaskStatus>();
		for (const task of tasks) {
			if (task.status.id && !seen.has(task.status.id)) {
				seen.set(task.status.id, task.status);
			}
		}
		return [...seen.values()];
	}, [tasks]);

	const facets = useMemo(() => facetsForProvider(provider), [provider]);
	const filters = useTaskFilters(tasks, facets);
	const visibleTasks = filters.filtered;
	const facetContext = useMemo(
		() => ({ projects: projectsQuery.data ?? [] }),
		[projectsQuery.data],
	);

	// Board columns = every workflow state for the team (so empty states still
	// get a column), plus any status present on a task but missing from the
	// fetched set, in display order. Falls back to task-derived statuses until
	// the state list loads. Visibility is the full set minus hidden columns.
	const boardColumns = useMemo(() => {
		const present = orderedStatuses(tasks);
		const fetched = statusesQuery.data ?? [];
		if (fetched.length === 0) return present;
		const seen = new Set(fetched.map(statusKey));
		return [...fetched, ...present.filter((s) => !seen.has(statusKey(s)))];
	}, [statusesQuery.data, tasks]);
	const visibleColumnKeys = useMemo(
		() =>
			new Set(
				boardColumns.map(statusKey).filter((key) => !hiddenColumns.has(key)),
			),
		[boardColumns, hiddenColumns],
	);

	const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
	const pageTask = tasks.find((task) => task.id === fullTaskId) ?? null;
	// The task currently in focus (page takes precedence over drawer), used by the
	// shared start-workspace dialog.
	const activeTask = pageTask ?? selectedTask;

	// Linear-style "c" shortcut: open the new-task modal from anywhere in the
	// tasks view. Scoped to this screen (the listener lives with the container)
	// and ignored while typing in a field.
	useEffect(() => {
		if (!connected || !teamId) return;
		function onKey(event: KeyboardEvent) {
			if (event.key.toLowerCase() !== "c") return;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
				return;
			if (event.defaultPrevented || event.isComposing) return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.isContentEditable ||
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT")
			) {
				return;
			}
			event.preventDefault();
			setCreateOpen(true);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [connected, teamId]);

	function changeView(next: TasksView) {
		setView(next);
		try {
			localStorage.setItem(VIEW_STORAGE_KEY, next);
		} catch {
			/* private mode / storage disabled — keep in-memory */
		}
	}

	function toggleColumn(key: string) {
		setHiddenColumns((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	// Drag-to-move on the board: optimistically reslot the card, then push the
	// status change to the provider; roll back to the server truth on error.
	function moveTask(task: Task, target: TaskStatus) {
		if (!teamId || target.id === task.status.id) return;
		const key = helmorQueryKeys.tasks(provider, teamId);
		queryClient.setQueryData<Task[]>(key, (old) =>
			old?.map((t) =>
				t.id === task.id ? { ...t, status: target, dirty: true } : t,
			),
		);
		updateMutation.mutate(
			{ taskId: task.id, patch: { statusId: target.id } },
			{
				onError: () => void queryClient.invalidateQueries({ queryKey: key }),
			},
		);
	}

	function renderDetail(task: Task, mode: "drawer" | "page") {
		return (
			<TaskDetailView
				key={task.id}
				task={task}
				statusOptions={statusOptions}
				labelOptions={labelsQuery.data ?? []}
				assigneeOptions={assigneesQuery.data ?? []}
				expanded={mode === "page"}
				onToggleExpand={() => {
					if (mode === "drawer") {
						setSelectedTaskId(null);
						setFullTaskId(task.id);
					} else {
						setFullTaskId(null);
						setSelectedTaskId(task.id);
					}
				}}
				isUpdating={updateMutation.isPending}
				onClose={() => {
					if (mode === "drawer") setSelectedTaskId(null);
					else setFullTaskId(null);
				}}
				onUpdate={(patch) => updateMutation.mutate({ taskId: task.id, patch })}
				onReview={() => reviewMutation.mutate(task.id)}
				reviewPending={reviewMutation.isPending}
				onStartWorkspace={() => setStartWorkspaceOpen(true)}
			/>
		);
	}

	return (
		<div aria-label="Tasks screen" className="flex min-h-0 flex-1 flex-col">
			<ScreenHeader>
				<span className="font-semibold text-foreground">Tasks</span>
				<ProviderTabBar
					active={provider}
					connected={connected}
					onSelect={(next) => {
						setProvider(next);
						try {
							localStorage.setItem(PROVIDER_STORAGE_KEY, next);
						} catch {
							/* private mode — keep in-memory */
						}
						// Reset transient view state when switching providers.
						setSelectedTaskId(null);
						setFullTaskId(null);
						setHiddenColumns(new Set());
					}}
				/>
				{connected && status?.selectedTeamName ? (
					<span className="text-muted-foreground">
						{status.selectedTeamName}
					</span>
				) : null}
				<div className="ml-auto flex items-center gap-2">
					<ViewToggle value={view} onChange={changeView} />
					{connected && view === "board" && boardColumns.length > 0 ? (
						<BoardColumnFilter
							columns={boardColumns}
							visibleKeys={visibleColumnKeys}
							onToggle={toggleColumn}
							onShowAll={() => setHiddenColumns(new Set())}
						/>
					) : null}
					<span className="text-muted-foreground text-small">
						{connected
							? filters.activeCount > 0
								? `${visibleTasks.length} / ${tasks.length}`
								: `${tasks.length} tasks`
							: ""}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!connected || !teamId || syncing}
						onClick={() => syncMutation.mutate()}
					>
						<RefreshCcw className={cn("size-3.5", syncing && "animate-spin")} />
						Sync
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={!connected || !teamId}
						onClick={() => setCreateOpen(true)}
						title="New task (C)"
					>
						<Plus className="size-3.5" />
						New task
						<kbd className="ml-0.5 rounded border border-primary-foreground/30 px-1 font-mono text-[10px] text-primary-foreground/80">
							C
						</kbd>
					</Button>
				</div>
			</ScreenHeader>

			{!pageTask && connected && tasks.length > 0 ? (
				<TaskFilterBar
					facets={facets}
					tasks={tasks}
					context={facetContext}
					selection={filters.selection}
					activeCount={filters.activeCount}
					onToggle={filters.toggle}
					onClearFacet={filters.clearFacet}
					onClearAll={filters.clearAll}
				/>
			) : null}

			<div className="flex min-h-0 flex-1 flex-col">
				{pageTask ? (
					<div className="flex min-h-0 flex-1 justify-center">
						<div className="flex min-h-0 w-full max-w-5xl flex-col border-border/40 border-x">
							{renderDetail(pageTask, "page")}
						</div>
					</div>
				) : !connected ? (
					<TasksEmptyState provider={provider} />
				) : tasksQuery.isLoading ? (
					<TableSkeleton />
				) : tasks.length === 0 ? (
					<EmptyTeamState
						syncing={syncing}
						onSync={() => syncMutation.mutate()}
					/>
				) : visibleTasks.length === 0 ? (
					<div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-ui">
						No tasks match the active filters.
					</div>
				) : view === "board" ? (
					<TasksBoard
						tasks={visibleTasks}
						columns={boardColumns}
						visibleColumnKeys={visibleColumnKeys}
						selectedTaskId={selectedTaskId}
						onSelectTask={setSelectedTaskId}
						onMoveTask={moveTask}
					/>
				) : (
					<div className="min-h-0 flex-1 overflow-auto">
						<TasksTable
							tasks={visibleTasks}
							selectedTaskId={selectedTaskId}
							onSelectTask={setSelectedTaskId}
						/>
					</div>
				)}
				{syncMutation.isError ? (
					<p className="px-4 py-2 text-destructive text-small">
						Sync failed —{" "}
						{syncMutation.error instanceof Error
							? syncMutation.error.message
							: "unknown error"}
					</p>
				) : null}
			</div>

			<Sheet
				open={Boolean(selectedTask)}
				onOpenChange={(next) => {
					if (!next) setSelectedTaskId(null);
				}}
			>
				<SheetContent
					side="right"
					showCloseButton={false}
					className="!max-w-[1040px] w-[94vw] gap-0 p-0"
				>
					<SheetTitle className="sr-only">
						{selectedTask
							? `${selectedTask.identifier ?? ""} ${selectedTask.title}`.trim()
							: "Task"}
					</SheetTitle>
					{selectedTask ? renderDetail(selectedTask, "drawer") : null}
				</SheetContent>
			</Sheet>

			{teamId ? (
				<CreateTaskDialog
					open={createOpen}
					onOpenChange={setCreateOpen}
					provider={provider}
					teamId={teamId}
					teamName={status?.selectedTeamName}
					statusOptions={boardColumns}
					assigneeOptions={assigneesQuery.data ?? []}
					projectOptions={projectsQuery.data ?? []}
					labelOptions={labelsQuery.data ?? []}
				/>
			) : null}

			{activeTask ? (
				<StartWorkspaceDialog
					open={startWorkspaceOpen}
					onOpenChange={setStartWorkspaceOpen}
					task={activeTask}
				/>
			) : null}
		</div>
	);
}

function TableSkeleton() {
	return (
		<div className="space-y-2 p-4">
			{["a", "b", "c", "d", "e", "f", "g", "h"].map((row) => (
				<Skeleton key={row} className="h-8 w-full" />
			))}
		</div>
	);
}

function EmptyTeamState({
	syncing,
	onSync,
}: {
	syncing: boolean;
	onSync: () => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<p className="text-muted-foreground text-ui">No tasks synced yet.</p>
			<Button type="button" size="sm" disabled={syncing} onClick={onSync}>
				<RefreshCcw className={cn("size-3.5", syncing && "animate-spin")} />
				Sync now
			</Button>
		</div>
	);
}
