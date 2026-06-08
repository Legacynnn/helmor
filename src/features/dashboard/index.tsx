import type { WorkspaceRow } from "@/lib/api";
import type {
	DashboardColumn,
	DashboardColumnId,
} from "./hooks/use-dashboard-board";
import { WorkspaceKanbanCard } from "./kanban-card";

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
}: Props) {
	const total = columns.reduce((n, c) => n + c.rows.length, 0);
	return (
		<div aria-label="Dashboard screen" className="flex min-h-0 flex-1 flex-col">
			<header className="flex items-center gap-4 border-app-border/60 border-b px-4 py-3 text-sm">
				<span className="font-semibold text-app-foreground">Dashboard</span>
				<span className="text-app-foreground/55">{total} workspaces</span>
				{columns.map((c) => (
					<span key={c.id} className="text-app-foreground/55">
						{c.label}: {c.rows.length}
					</span>
				))}
				<span className="ml-auto text-app-foreground/55">
					{totalRunning} running
				</span>
			</header>
			<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
				{columns.map((column) => (
					<section
						key={column.id}
						aria-label={`${column.label} column`}
						className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40"
					>
						<div className="flex items-center justify-between px-3 py-2 font-medium text-app-foreground/70 text-xs">
							<span>{column.label}</span>
							<span>{column.rows.length}</span>
						</div>
						<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
							{column.rows.length === 0 ? (
								<div className="px-2 py-6 text-center text-app-foreground/35 text-xs">
									No workspaces
								</div>
							) : (
								column.rows.map((row: WorkspaceRow) => (
									<WorkspaceKanbanCard
										key={row.id}
										row={row}
										running={runningWorkspaceIds.has(row.id)}
										onOpen={onOpenWorkspace}
									/>
								))
							)}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
