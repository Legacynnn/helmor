import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, LayoutGrid, PanelsTopLeft } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	workspaceDetailQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import { usePanelsListStore } from "../bindings/panels-list-store";
import { useCanvasModeStore } from "../use-canvas-mode";

/** Top-left workspace control region: identity + open-workspaces dropdown
 * (jump between canvases). Exiting the canvas is handled by the left rail's
 * "Back to workspace" button. */
export function CanvasWorkspaceControls({
	workspaceId,
	onSelectWorkspace,
}: {
	workspaceId: string;
	onSelectWorkspace?: (workspaceId: string) => void;
}) {
	const { data: detail } = useQuery(workspaceDetailQueryOptions(workspaceId));
	const { data: groups = [] } = useQuery(workspaceGroupsQueryOptions());
	const title = detail?.title ?? "Workspace";

	const rows = groups.flatMap((g) => g.rows);

	return (
		<div className="pointer-events-auto absolute top-3 left-3 z-10 flex items-center gap-1 rounded-[16px] border border-white/15 bg-app-base/40 p-1 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex max-w-56 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-app-muted"
						title="Open workspaces"
					>
						<LayoutGrid className="size-3.5 shrink-0 opacity-70" />
						<span className="min-w-0 flex-1 truncate font-medium">{title}</span>
						<ChevronsUpDown className="size-3 shrink-0 opacity-50" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="max-h-80 w-64 overflow-auto"
				>
					<DropdownMenuLabel className="text-[10px] text-app-muted-foreground uppercase tracking-wide">
						Open in canvas
					</DropdownMenuLabel>
					{rows.length === 0 ? (
						<div className="px-2 py-1.5 text-app-muted-foreground text-xs">
							No workspaces.
						</div>
					) : (
						rows.map((row) => (
							<DropdownMenuItem
								key={row.id}
								onClick={() => {
									useCanvasModeStore.getState().setMode(row.id, true);
									if (row.id !== workspaceId) onSelectWorkspace?.(row.id);
								}}
							>
								<span className="min-w-0 flex-1 truncate">{row.title}</span>
								{row.id === workspaceId ? (
									<Check className="ml-auto size-3.5 text-app-muted-foreground" />
								) : null}
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="mx-0.5 h-4 w-px bg-app-border" />
			<button
				type="button"
				className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-app-muted"
				onClick={() => usePanelsListStore.getState().toggle()}
				title="Panels (⌘/)"
			>
				<PanelsTopLeft className="size-3.5 opacity-70" />
				<span>Panels</span>
			</button>
		</div>
	);
}
