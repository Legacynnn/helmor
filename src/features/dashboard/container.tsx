import { useCallback } from "react";
import { moveWorkspaceInSidebar } from "@/lib/api";
import type { ScreenActions } from "@/shell/controllers/use-screen-controller";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import { useDashboardBoard } from "./hooks/use-dashboard-board";
import { DashboardScreen, type MoveWorkspaceArgs } from "./index";

type Props = {
	selectionActions: SelectionActions;
	screenActions: ScreenActions;
};

export function DashboardContainer({ selectionActions, screenActions }: Props) {
	const { columns, runningWorkspaceIds, totalRunning } = useDashboardBoard();

	const onOpenWorkspace = useCallback(
		(workspaceId: string) => {
			screenActions.openWorkspaceView();
			selectionActions.selectWorkspace(workspaceId);
		},
		[screenActions, selectionActions],
	);

	const onMoveWorkspace = useCallback((args: MoveWorkspaceArgs) => {
		// targetColumnId equals the backend status group id ("progress" | ...).
		void moveWorkspaceInSidebar(
			args.workspaceId,
			args.targetColumnId,
			args.beforeWorkspaceId,
		);
	}, []);

	return (
		<DashboardScreen
			columns={columns}
			runningWorkspaceIds={runningWorkspaceIds}
			totalRunning={totalRunning}
			onOpenWorkspace={onOpenWorkspace}
			onMoveWorkspace={onMoveWorkspace}
		/>
	);
}
