import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, LayoutGrid, Plus, Trash2 } from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { canvasStateQueryOptions, helmorQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { CanvasPreview } from "./canvas-preview";

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
 * The Canvas world's dedicated sidebar — deliberately distinct from the normal
 * workspace sidebar. Carries the space switch (to slide back), a create action,
 * and the list of canvas workspaces. Hovering a row reveals a live schematic
 * preview; right-clicking exposes management (archive / delete / reveal).
 */
export function CanvasSidebar({
	workspaces,
	selectedId,
	onSelect,
	onNewCanvas,
}: {
	workspaces: WorkspaceRow[];
	selectedId: string | null;
	onSelect: (workspaceId: string) => void;
	onNewCanvas?: () => void;
}) {
	const queryClient = useQueryClient();
	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.workspaceGroups,
		});
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.archivedWorkspaces,
		});
	};

	return (
		<aside className="flex h-full w-[260px] shrink-0 flex-col gap-2 border-border border-r bg-sidebar p-2">
			<div className="h-6 shrink-0" />
			<SpaceSwitch />
			<button
				type="button"
				onClick={() => onNewCanvas?.()}
				className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-app-border border-dashed font-medium text-app-muted-foreground text-sm transition-colors hover:border-app-foreground/40 hover:text-app-foreground"
			>
				<Plus className="size-4" />
				New canvas
			</button>

			<div className="min-h-0 flex-1 space-y-0.5 overflow-auto pt-1">
				{workspaces.length === 0 ? (
					<p className="px-2 py-6 text-center text-app-muted-foreground text-xs">
						No canvases yet. Create one to get started.
					</p>
				) : (
					workspaces.map((w) => (
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
													? "bg-app-foreground/10 text-app-foreground"
													: "text-app-muted-foreground hover:bg-app-foreground/5 hover:text-app-foreground",
											)}
										>
											<LayoutGrid className="size-3.5 shrink-0 opacity-70" />
											<span className="truncate">{w.title}</span>
										</button>
									</HoverCardTrigger>
								</ContextMenuTrigger>
								<HoverCardContent side="right" className="w-auto p-1.5">
									<CanvasHoverPreview workspaceId={w.id} />
									<p className="truncate px-1 pt-1.5 text-app-foreground text-xs">
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
					))
				)}
			</div>
		</aside>
	);
}
