import { createPortal } from "react-dom";
import type { WorkspaceDiffStat, WorkspaceRow } from "@/lib/api";
import { WorkspaceKanbanCard } from "../kanban-card";
import type { KanbanDragState } from "./use-kanban-dnd";

type Props = {
	dragState: KanbanDragState;
	row: WorkspaceRow;
	running: boolean;
	diffStat?: WorkspaceDiffStat;
};

/** The card that follows the pointer during a drag. Rendered into `body` so it
 *  escapes the board's `overflow` clipping, and lifted with a slight tilt +
 *  shadow so it reads as picked up off the column. */
export function KanbanDragGhost({ dragState, row, running, diffStat }: Props) {
	return createPortal(
		<div
			aria-hidden
			className="pointer-events-none fixed z-50 rotate-2 opacity-95 drop-shadow-xl"
			style={{
				left: dragState.left,
				top: dragState.top,
				width: dragState.width,
			}}
		>
			<WorkspaceKanbanCard
				row={row}
				running={running}
				diffStat={diffStat}
				onOpen={() => {}}
			/>
		</div>,
		document.body,
	);
}
