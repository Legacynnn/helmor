import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useCanvasSidebarStore } from "@/features/canvas/use-canvas-sidebar-store";
import { useCanvasViewPrefsStore } from "@/features/canvas/use-canvas-view-prefs-store";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import { SidebarChromeBar } from "@/features/navigation/sidebar-chrome-bar";
import {
	type PendingArchiveEntry,
	type PendingCreationEntry,
	projectVisualSidebar,
	repoIdFromGroupId,
} from "@/features/navigation/sidebar-projection";
import {
	SIDEBAR_SORT_OPTIONS,
	SidebarViewPopover,
} from "@/features/navigation/sidebar-view-popover";
import { SpaceSwitch } from "@/features/navigation/space-switch";
import {
	openWorkspaceInFinder,
	permanentlyDeleteWorkspace,
	prepareArchiveWorkspace,
	startArchiveWorkspace,
} from "@/lib/api";
import {
	canvasStateQueryOptions,
	helmorQueryKeys,
	repositoriesQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { CanvasPreview } from "./canvas-preview";
import { createCanvasWorkspace } from "./create-canvas-workspace";

/** The canvas list has no drag-reorder, so "custom" (draggable) sort is dropped
 * — leaving repo-name / last-updated / created-time. */
const CANVAS_SORT_OPTIONS = SIDEBAR_SORT_OPTIONS.filter(
	(option) => option.value !== "custom",
);

// The canvas list carries no optimistic pending state — archive/create flows
// settle via query invalidation — so the projection runs with empty pending maps.
const NO_PENDING_ARCHIVES: ReadonlyMap<string, PendingArchiveEntry> = new Map();
const NO_PENDING_CREATIONS: ReadonlyMap<string, PendingCreationEntry> =
	new Map();

/** Hover-card body: lazily loads the workspace's saved canvas and renders a
 *  schematic preview. Mounted only while the hover card is open. */
function CanvasHoverPreview({ workspaceId }: { workspaceId: string }) {
	const { data, isLoading } = useQuery(canvasStateQueryOptions(workspaceId));
	if (isLoading || !data) {
		return (
			<div className="h-[150px] w-[248px] animate-pulse rounded-md bg-muted/50" />
		);
	}
	return <CanvasPreview panels={data.panels} />;
}

/**
 * The Canvas world's dedicated sidebar — distinct from the normal workspace
 * sidebar. Carries the space switch, a create action (pick a repo → a canvas
 * workspace is created directly, no first conversation), filter/sort/grouping
 * controls (mirroring the workspace sidebar's View popover, with their own
 * persisted preferences), and the canvas workspaces. Hovering a row reveals a
 * schematic preview plus a quick archive button; right-clicking exposes the
 * full management menu (archive / delete / reveal).
 */
export function CanvasSidebar({
	selectedId,
	onSelect,
}: {
	selectedId: string | null;
	onSelect: (workspaceId: string) => void;
}) {
	const queryClient = useQueryClient();
	const toggleSidebar = useCanvasSidebarStore((s) => s.toggle);
	const { data: repositories = [] } = useQuery(repositoriesQueryOptions());
	const { data: groups = [] } = useQuery(workspaceGroupsQueryOptions());
	const [creatingRepoId, setCreatingRepoId] = useState<string | null>(null);
	const [viewOpen, setViewOpen] = useState(false);
	// Canvases optimistically hidden while their archive worker is in flight.
	// The backend broadcasts `workspaceListChanged` once it settles; the global
	// ui-sync bridge reconciles `workspaceGroups`, the row drops from the data,
	// and the prune effect below clears the id.
	const [archivingIds, setArchivingIds] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const grouping = useCanvasViewPrefsStore((s) => s.grouping);
	const sort = useCanvasViewPrefsStore((s) => s.sort);
	const repoFilterIds = useCanvasViewPrefsStore((s) => s.repoFilterIds);
	const setGrouping = useCanvasViewPrefsStore((s) => s.setGrouping);
	const setSort = useCanvasViewPrefsStore((s) => s.setSort);
	const setRepoFilterIds = useCanvasViewPrefsStore((s) => s.setRepoFilterIds);

	// Project the status-bucketed workspace groups down to canvas rows, then run
	// them through the same grouping/filter/sort pipeline the normal sidebar uses.
	const hasAnyCanvas = useMemo(
		() => groups.some((g) => g.rows.some((r) => r.space === "canvas")),
		[groups],
	);
	const availableRepoIds = useMemo(
		() => repositories.map((r) => r.id),
		[repositories],
	);
	const projectedGroups = useMemo(() => {
		const canvasBaseGroups = groups
			.map((g) => ({
				...g,
				rows: g.rows.filter(
					(r) => r.space === "canvas" && !archivingIds.has(r.id),
				),
			}))
			.filter((g) => g.rows.length > 0);
		return projectVisualSidebar(
			{
				baseGroups: canvasBaseGroups,
				baseArchivedSummaries: [],
				pendingArchives: NO_PENDING_ARCHIVES,
				pendingCreations: NO_PENDING_CREATIONS,
			},
			grouping,
			{ availableRepoIds, repoFilterIds, sort },
		).groups;
	}, [groups, grouping, availableRepoIds, repoFilterIds, sort, archivingIds]);

	// Drop ids from the optimistic-archive set once the workspace is no longer in
	// the live data (the archive settled), so the set never grows stale.
	useEffect(() => {
		setArchivingIds((prev) => {
			if (prev.size === 0) return prev;
			const liveIds = new Set(groups.flatMap((g) => g.rows).map((r) => r.id));
			let changed = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (liveIds.has(id)) next.add(id);
				else changed = true;
			}
			return changed ? next : prev;
		});
	}, [groups]);

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.workspaceGroups,
		});
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.archivedWorkspaces,
		});
	};

	// Archive mirrors the workspace sidebar's flow: `prepareArchiveWorkspace`
	// validates/stages first (skipping it is why archive silently did nothing),
	// then `startArchiveWorkspace` launches the worker. We optimistically hide
	// the row immediately; the ui-sync bridge refreshes the list on completion.
	const archive = (workspaceId: string) => {
		void (async () => {
			try {
				await prepareArchiveWorkspace(workspaceId);
			} catch (error) {
				console.error("Failed to prepare canvas archive", error);
				return;
			}
			setArchivingIds((prev) => new Set(prev).add(workspaceId));
			try {
				await startArchiveWorkspace(workspaceId);
			} catch (error) {
				console.error("Failed to archive canvas", error);
				setArchivingIds((prev) => {
					const next = new Set(prev);
					next.delete(workspaceId);
					return next;
				});
				return;
			}
			invalidate();
		})();
	};

	const handleCreate = async (repoId: string) => {
		setCreatingRepoId(repoId);
		try {
			const id = await createCanvasWorkspace(repoId);
			await queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			onSelect(id);
		} finally {
			setCreatingRepoId(null);
		}
	};

	const creating = creatingRepoId !== null;

	return (
		<aside className="pointer-events-auto absolute top-2 bottom-3 left-3 z-20 flex w-[260px] flex-col gap-1.5 rounded-[20px] border border-foreground/10 bg-sidebar/90 px-2 pt-1 pb-2 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-2xl">
			<SidebarChromeBar
				onToggleCollapse={toggleSidebar}
				collapseLabel="Hide canvas sidebar"
				trafficLightWidth={68}
				className="pr-0"
			/>
			<SpaceSwitch />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={creating || repositories.length === 0}
						className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-app-foreground/25 border-dashed font-medium text-app-foreground/80 text-sm transition-colors hover:border-app-foreground/50 hover:text-app-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						{creating ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Plus className="size-4" />
						)}
						New canvas
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64 p-1.5">
					{repositories.length === 0 ? (
						<div className="px-2 py-1.5 text-muted-foreground text-xs">
							Add a repository first.
						</div>
					) : (
						repositories.map((repo) => (
							<DropdownMenuItem
								key={repo.id}
								className="gap-2.5 px-2.5 py-2"
								onSelect={() => {
									void handleCreate(repo.id);
								}}
							>
								<WorkspaceAvatar
									repoIconSrc={repo.repoIconSrc}
									repoInitials={repo.repoInitials}
									repoName={repo.name}
									title={repo.name}
									className="size-5 rounded-md"
									fallbackClassName="text-nano"
								/>
								<span className="min-w-0 flex-1 truncate">{repo.name}</span>
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="flex items-center justify-between pr-0.5 pl-2">
				<span className="font-medium text-[10px] text-app-foreground/65 uppercase tracking-wide">
					Canvases
				</span>
				<SidebarViewPopover
					repositories={repositories}
					grouping={grouping}
					selectedRepoIds={repoFilterIds}
					sort={sort}
					open={viewOpen}
					onOpenChange={setViewOpen}
					sortOptions={CANVAS_SORT_OPTIONS}
					onGroupingChange={setGrouping}
					onRepoFilterChange={setRepoFilterIds}
					onSortChange={setSort}
				/>
			</div>

			<div className="min-h-0 flex-1 space-y-3 overflow-auto">
				{projectedGroups.length === 0 ? (
					<p className="px-2 py-6 text-center text-app-foreground/70 text-xs">
						{hasAnyCanvas
							? "No canvases match your filters."
							: "No canvases yet. Create one to get started."}
					</p>
				) : (
					projectedGroups.map((group) => {
						const isRepoGroup = repoIdFromGroupId(group.id) !== null;
						const sample = group.rows[0];
						return (
							<div key={group.id} className="space-y-0.5">
								<div className="flex items-center gap-1.5 px-2 py-1">
									{isRepoGroup ? (
										<WorkspaceAvatar
											repoIconSrc={sample?.repoIconSrc}
											repoInitials={sample?.repoInitials ?? null}
											repoName={sample?.repoName}
											title={group.label}
											className="size-4 rounded"
											fallbackClassName="text-nano"
										/>
									) : null}
									<span className="truncate font-medium text-[10px] text-app-foreground/65 uppercase tracking-wide">
										{group.label}
									</span>
								</div>
								{group.rows.map((w) => (
									// Outer wrapper owns positioning + the row hover group, so
									// the absolute archive button can live OUTSIDE the hover/
									// context triggers — nesting it (or a wrapper div) inside the
									// `asChild` trigger chain breaks Radix ref-forwarding and the
									// hover preview never opens.
									<div key={w.id} className="group/row relative">
										<ContextMenu>
											<HoverCard openDelay={250} closeDelay={80}>
												<ContextMenuTrigger asChild>
													<HoverCardTrigger asChild>
														<button
															type="button"
															onClick={() => onSelect(w.id)}
															className={cn(
																"flex w-full cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-7 pl-2 text-left transition-colors",
																selectedId === w.id
																	? "bg-accent text-accent-foreground"
																	: "text-app-foreground/85 hover:bg-accent/50 hover:text-app-foreground",
															)}
														>
															<WorkspaceAvatar
																repoIconSrc={w.repoIconSrc}
																repoInitials={w.repoInitials ?? null}
																repoName={w.repoName}
																title={w.title}
																className="size-7 shrink-0 rounded-md"
																fallbackClassName="text-nano"
															/>
															<span className="flex min-w-0 flex-1 flex-col">
																<span className="truncate text-sm leading-tight">
																	{w.title}
																</span>
																<span className="flex items-center gap-1 truncate text-[11px] leading-tight opacity-65">
																	<GitBranch className="size-3 shrink-0" />
																	<span className="truncate">
																		{w.branch || "no branch"}
																		{w.directoryName
																			? ` · ${w.directoryName}`
																			: ""}
																	</span>
																</span>
															</span>
														</button>
													</HoverCardTrigger>
												</ContextMenuTrigger>
												<HoverCardContent side="right" className="w-auto p-1.5">
													<CanvasHoverPreview workspaceId={w.id} />
													<p className="truncate px-1 pt-1.5 text-foreground text-xs">
														{w.title}
													</p>
												</HoverCardContent>
											</HoverCard>
											<ContextMenuContent>
												<ContextMenuItem
													onSelect={() => {
														void openWorkspaceInFinder(w.id);
													}}
												>
													Reveal in Finder
												</ContextMenuItem>
												<ContextMenuSeparator />
												<ContextMenuItem onSelect={() => archive(w.id)}>
													<Archive className="size-3.5" />
													Archive
												</ContextMenuItem>
												<ContextMenuItem
													variant="destructive"
													onSelect={() => {
														void permanentlyDeleteWorkspace(w.id).then(
															invalidate,
														);
													}}
												>
													<Trash2 className="size-3.5" />
													Delete
												</ContextMenuItem>
											</ContextMenuContent>
										</ContextMenu>
										<button
											type="button"
											aria-label="Archive canvas"
											title="Archive"
											className="absolute top-2 right-1 flex size-6 cursor-pointer items-center justify-center rounded text-app-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-app-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
											onClick={(e) => {
												e.stopPropagation();
												archive(w.id);
											}}
										>
											<Archive className="size-3.5" />
										</button>
									</div>
								))}
							</div>
						);
					})
				)}
			</div>
		</aside>
	);
}
