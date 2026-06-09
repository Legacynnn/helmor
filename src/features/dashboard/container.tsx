import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { moveWorkspaceInSidebar, type WorkspaceGroup } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { reorderWorkspaceInSidebar } from "@/lib/workspace-helpers";
import type { ScreenActions } from "@/shell/controllers/use-screen-controller";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import { useDashboardBoard } from "./hooks/use-dashboard-board";
import { DashboardScreen, type MoveWorkspaceArgs } from "./index";

type Props = {
	selectionActions: SelectionActions;
	screenActions: ScreenActions;
};

export function DashboardContainer({ selectionActions, screenActions }: Props) {
	const queryClient = useQueryClient();
	const {
		columns,
		runningWorkspaceIds,
		totalRunning,
		diffStats,
		repos,
		selectedRepoIds,
		setSelectedRepoIds,
		visibleColumnIds,
		setVisibleColumnIds,
		columnOptions,
	} = useDashboardBoard();

	const onOpenWorkspace = useCallback(
		(workspaceId: string) => {
			screenActions.openWorkspaceView();
			selectionActions.selectWorkspace(workspaceId);
		},
		[screenActions, selectionActions],
	);

	const onMoveWorkspace = useCallback(
		(args: MoveWorkspaceArgs) => {
			queryClient.setQueryData<WorkspaceGroup[] | undefined>(
				helmorQueryKeys.workspaceGroups,
				(current) =>
					reorderWorkspaceInSidebar(
						current,
						args.workspaceId,
						args.targetColumnId,
						args.beforeWorkspaceId,
					),
			);

			moveWorkspaceInSidebar(
				args.workspaceId,
				args.targetColumnId,
				args.beforeWorkspaceId,
			)
				.then(() => {
					void queryClient.invalidateQueries({
						queryKey: helmorQueryKeys.workspaceDetail(args.workspaceId),
					});
				})
				.catch((error) => {
					void queryClient.invalidateQueries({
						queryKey: helmorQueryKeys.workspaceGroups,
					});
					toast.error("Couldn't move workspace", {
						description: error instanceof Error ? error.message : String(error),
					});
				});
		},
		[queryClient],
	);

	return (
		<DashboardScreen
			columns={columns}
			runningWorkspaceIds={runningWorkspaceIds}
			totalRunning={totalRunning}
			diffStats={diffStats}
			repos={repos}
			selectedRepoIds={selectedRepoIds}
			onSelectRepoIds={setSelectedRepoIds}
			columnOptions={columnOptions}
			visibleColumnIds={visibleColumnIds}
			onSelectColumnIds={setVisibleColumnIds}
			onOpenWorkspace={onOpenWorkspace}
			onMoveWorkspace={onMoveWorkspace}
		/>
	);
}
