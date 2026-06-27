import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { useMemo } from "react";
import type { InspectorFileItem } from "@/lib/editor-session";
import {
	workspaceChangesQueryOptions,
	workspaceDetailQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "../canvas-actions-context";
import { useCanvasWorkspace } from "../canvas-workspace-context";

const STATUS_COLOR: Record<InspectorFileItem["status"], string> = {
	M: "text-yellow-500",
	A: "text-green-500",
	D: "text-red-500",
};

const STATUS_LABEL: Record<InspectorFileItem["status"], string> = {
	M: "Modified",
	A: "Added",
	D: "Deleted",
};

function netLines(item: InspectorFileItem): { added: number; removed: number } {
	return {
		added:
			item.stagedInsertions +
			item.unstagedInsertions +
			item.committedInsertions,
		removed:
			item.stagedDeletions + item.unstagedDeletions + item.committedDeletions,
	};
}

/** Read-only mirror of the inspector's Git/Changes view, scoped to the
 * canvas workspace. Lists the workspace's changed files (path + status +
 * line stats). Clicking a row opens that file in a new Editor panel. The
 * full inspector `ChangesSection` is intentionally not reused here — it
 * depends on commit/forge/editor controllers the canvas surface can't
 * supply. */
export function GitPanelBody() {
	const { addPanel } = useCanvasActions();
	const { workspaceId, workspaceRootPath } = useCanvasWorkspace();

	const changesQuery = useQuery({
		...workspaceChangesQueryOptions(workspaceRootPath ?? "", workspaceId),
		enabled: !!workspaceRootPath,
	});
	const detailQuery = useQuery({
		...workspaceDetailQueryOptions(workspaceId),
		enabled: !!workspaceId,
	});

	const changes = changesQuery.data ?? [];
	const branch = detailQuery.data?.branch ?? null;

	const sorted = useMemo(
		() => [...changes].sort((a, b) => a.path.localeCompare(b.path)),
		[changes],
	);

	if (!workspaceRootPath) {
		return (
			<div className="flex size-full items-center justify-center p-4 text-center text-app-muted-foreground text-xs">
				Workspace has no working directory.
			</div>
		);
	}

	return (
		<div className="flex size-full flex-col bg-app-base">
			<div className="flex h-8 shrink-0 items-center gap-1.5 border-app-border border-b px-2.5 text-app-muted-foreground text-xs">
				<GitBranch className="size-3.5 shrink-0 opacity-70" />
				<span className="min-w-0 flex-1 truncate font-medium">
					{branch ?? "Changes"}
				</span>
				<span className="shrink-0 tabular-nums opacity-70">
					{sorted.length}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{changesQuery.isLoading ? (
					<div className="p-3 text-app-muted-foreground text-xs">Loading…</div>
				) : sorted.length === 0 ? (
					<div className="p-3 text-app-muted-foreground text-xs">
						No changes.
					</div>
				) : (
					<ul className="py-1">
						{sorted.map((item) => {
							const { added, removed } = netLines(item);
							return (
								<li key={item.path}>
									<button
										type="button"
										title={`${STATUS_LABEL[item.status]} — ${item.path}`}
										className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1 text-left text-xs hover:bg-app-muted"
										onClick={() =>
											void addPanel("editor", {
												config: { filePath: item.path },
											})
										}
									>
										<span
											className={cn(
												"w-3 shrink-0 text-center font-mono font-semibold",
												STATUS_COLOR[item.status],
											)}
										>
											{item.status}
										</span>
										<span className="min-w-0 flex-1 truncate text-app-foreground">
											{item.name}
											<span className="ml-1.5 text-app-muted-foreground">
												{item.path}
											</span>
										</span>
										{added > 0 ? (
											<span className="shrink-0 tabular-nums text-green-500">
												+{added}
											</span>
										) : null}
										{removed > 0 ? (
											<span className="shrink-0 tabular-nums text-red-500">
												-{removed}
											</span>
										) : null}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
