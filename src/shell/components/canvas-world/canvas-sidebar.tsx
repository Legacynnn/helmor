import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, LayoutGrid, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { SpaceSwitch } from "@/features/navigation/space-switch";
import {
	openWorkspaceInFinder,
	permanentlyDeleteWorkspace,
	startArchiveWorkspace,
	type WorkspaceRow,
} from "@/lib/api";
import {
	canvasStateQueryOptions,
	helmorQueryKeys,
	repositoriesQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { CanvasPreview } from "./canvas-preview";
import { createCanvasWorkspace } from "./create-canvas-workspace";

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

type RepoGroup = { repoId: string; repoName: string; rows: WorkspaceRow[] };

function groupByRepo(rows: WorkspaceRow[]): RepoGroup[] {
	const byRepo = new Map<string, RepoGroup>();
	for (const row of rows) {
		const repoId = row.repoId ?? "__none__";
		const repoName = row.repoName ?? "Other";
		const group = byRepo.get(repoId) ?? { repoId, repoName, rows: [] };
		group.rows.push(row);
		byRepo.set(repoId, group);
	}
	return [...byRepo.values()].sort((a, b) =>
		a.repoName.localeCompare(b.repoName),
	);
}

/**
 * The Canvas world's dedicated sidebar — distinct from the normal workspace
 * sidebar. Carries the space switch, a create action (pick a repo → a canvas
 * workspace is created directly, no first conversation), and the canvas
 * workspaces grouped by repository. Hovering a row reveals a schematic preview;
 * right-clicking exposes management (archive / delete / reveal).
 */
export function CanvasSidebar({
	workspaces,
	selectedId,
	onSelect,
}: {
	workspaces: WorkspaceRow[];
	selectedId: string | null;
	onSelect: (workspaceId: string) => void;
}) {
	const queryClient = useQueryClient();
	const { data: repositories = [] } = useQuery(repositoriesQueryOptions());
	const [creatingRepoId, setCreatingRepoId] = useState<string | null>(null);
	const groups = useMemo(() => groupByRepo(workspaces), [workspaces]);

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.workspaceGroups,
		});
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.archivedWorkspaces,
		});
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
		<aside className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-border border-r bg-sidebar p-2">
			<div className="h-6 shrink-0" />
			<SpaceSwitch />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={creating || repositories.length === 0}
						className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border border-dashed font-medium text-muted-foreground text-sm transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						{creating ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Plus className="size-4" />
						)}
						New canvas
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{repositories.length === 0 ? (
						<div className="px-2 py-1.5 text-muted-foreground text-xs">
							Add a repository first.
						</div>
					) : (
						repositories.map((repo) => (
							<DropdownMenuItem
								key={repo.id}
								onSelect={() => {
									void handleCreate(repo.id);
								}}
							>
								<span className="min-w-0 flex-1 truncate">{repo.name}</span>
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="min-h-0 flex-1 space-y-3 overflow-auto pt-1">
				{groups.length === 0 ? (
					<p className="px-2 py-6 text-center text-muted-foreground text-xs">
						No canvases yet. Create one to get started.
					</p>
				) : (
					groups.map((group) => (
						<div key={group.repoId} className="space-y-0.5">
							<p className="px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
								{group.repoName}
							</p>
							{group.rows.map((w) => (
								<ContextMenu key={w.id}>
									<HoverCard openDelay={250} closeDelay={80}>
										<ContextMenuTrigger asChild>
											<HoverCardTrigger asChild>
												<button
													type="button"
													onClick={() => onSelect(w.id)}
													className={cn(
														"flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
														selectedId === w.id
															? "bg-accent text-accent-foreground"
															: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
													)}
												>
													<LayoutGrid className="size-3.5 shrink-0 opacity-70" />
													<span className="truncate">{w.title}</span>
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
										<ContextMenuItem
											onSelect={() => {
												void startArchiveWorkspace(w.id).then(invalidate);
											}}
										>
											<Archive className="size-3.5" />
											Archive
										</ContextMenuItem>
										<ContextMenuItem
											variant="destructive"
											onSelect={() => {
												void permanentlyDeleteWorkspace(w.id).then(invalidate);
											}}
										>
											<Trash2 className="size-3.5" />
											Delete
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>
							))}
						</div>
					))
				)}
			</div>
		</aside>
	);
}
