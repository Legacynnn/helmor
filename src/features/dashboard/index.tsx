import { useRef } from "react";
import type {
	DashboardColumn,
	DashboardColumnId,
} from "./hooks/use-dashboard-board";
import { WorkspaceKanbanCard } from "./kanban-card";

const DRAG_MIME = "text/workspace-id";

export type MoveWorkspaceArgs = {
	workspaceId: string;
	targetColumnId: DashboardColumnId;
	beforeWorkspaceId: string | null;
};

type Props = {
	columns: DashboardColumn[];
	runningWorkspaceIds: Set<string>;
	totalRunning: number;
	onOpenWorkspace: (workspaceId: string) => void;
	onMoveWorkspace: (args: MoveWorkspaceArgs) => void;
};

export function DashboardScreen({
	columns,
	runningWorkspaceIds,
	totalRunning,
	onOpenWorkspace,
	onMoveWorkspace,
}: Props) {
	// jsdom's DataTransfer is minimal, so we keep a ref fallback for the dragged
	// id; real browsers round-trip it through dataTransfer.
	const draggingIdRef = useRef<string | null>(null);
	const total = columns.reduce((n, c) => n + c.rows.length, 0);
	return (
		<div aria-label="Dashboard screen" className="flex min-h-0 flex-1 flex-col">
			<header className="flex items-center gap-4 border-border/60 border-b px-4 py-3 text-sm">
				<span className="font-semibold text-foreground">Dashboard</span>
				<span className="text-muted-foreground">{total} workspaces</span>
				{columns.map((c) => (
					<span key={c.id} className="text-muted-foreground">
						{c.label}: {c.rows.length}
					</span>
				))}
				<span className="ml-auto text-muted-foreground">
					{totalRunning} running
				</span>
			</header>
			<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
				{columns.map((column) => (
					<section
						key={column.id}
						aria-label={`${column.label} column`}
						className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault();
							const workspaceId =
								e.dataTransfer.getData(DRAG_MIME) || draggingIdRef.current;
							draggingIdRef.current = null;
							if (workspaceId) {
								onMoveWorkspace({
									workspaceId,
									targetColumnId: column.id,
									beforeWorkspaceId: null,
								});
							}
						}}
					>
						<div className="flex items-center justify-between px-3 py-2 font-medium text-muted-foreground text-xs">
							<span>{column.label}</span>
							<span>{column.rows.length}</span>
						</div>
						<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
							{column.rows.length === 0 ? (
								<div className="px-2 py-6 text-center text-muted-foreground/70 text-xs">
									No workspaces
								</div>
							) : (
								column.rows.map((row) => (
									<div
										key={row.id}
										draggable
										onDragStart={(e) => {
											draggingIdRef.current = row.id;
											e.dataTransfer.setData(DRAG_MIME, row.id);
											e.dataTransfer.effectAllowed = "move";
										}}
										onDragEnd={() => {
											draggingIdRef.current = null;
										}}
									>
										<WorkspaceKanbanCard
											row={row}
											running={runningWorkspaceIds.has(row.id)}
											onOpen={onOpenWorkspace}
										/>
									</div>
								))
							)}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
