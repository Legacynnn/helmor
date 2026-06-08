import { useCallback } from "react";
import { toast } from "sonner";
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
		// The UI-sync bridge invalidates the board on success; on failure the
		// card snaps back via that same invalidation, so we only surface a toast.
		moveWorkspaceInSidebar(
			args.workspaceId,
			args.targetColumnId,
			args.beforeWorkspaceId,
		).catch((error) => {
			toast.error("Couldn't move workspace", {
				description: error instanceof Error ? error.message : String(error),
			});
		});
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
