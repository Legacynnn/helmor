import type { WorkspaceDiffStat, WorkspaceRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ScreenHeader } from "@/shell/components/screen-header";
import { columnTone } from "./column-tone";
import { ColumnFilter } from "./components/column-filter";
import { RepoFilter } from "./components/repo-filter";
import { KanbanDragGhost } from "./dnd/kanban-drag-ghost";
import { type MoveWorkspaceArgs, useKanbanDnd } from "./dnd/use-kanban-dnd";
import type { RepoOption } from "./hooks/repo-filter-storage";
import type {
	DashboardColumn,
	DashboardColumnMeta,
} from "./hooks/use-dashboard-board";
import { WorkspaceKanbanCard } from "./kanban-card";

// Re-exported so existing imports/tests keep their entry point.
export { computeBeforeId } from "./dnd/resolve-drop";
export type { MoveWorkspaceArgs } from "./dnd/use-kanban-dnd";

type Props = {
	columns: DashboardColumn[];
	runningWorkspaceIds: Set<string>;
	totalRunning: number;
	diffStats: ReadonlyMap<string, WorkspaceDiffStat>;
	repos: RepoOption[];
	selectedRepoIds: ReadonlySet<string>;
	onSelectRepoIds: (next: Set<string>) => void;
	columnOptions: readonly DashboardColumnMeta[];
	visibleColumnIds: ReadonlySet<DashboardColumn["id"]>;
	onSelectColumnIds: (next: Set<DashboardColumn["id"]>) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onMoveWorkspace: (args: MoveWorkspaceArgs) => void;
};

export function DashboardScreen({
	columns,
	runningWorkspaceIds,
	totalRunning,
	diffStats,
	repos,
	selectedRepoIds,
	onSelectRepoIds,
	columnOptions,
	visibleColumnIds,
	onSelectColumnIds,
	onOpenWorkspace,
	onMoveWorkspace,
}: Props) {
	const {
		dragState,
		dropTarget,
		draggingWorkspaceId,
		startDragGesture,
		shouldSuppressClick,
	} = useKanbanDnd({ onMoveWorkspace });

	const total = columns.reduce((n, c) => n + c.rows.length, 0);
	const draggingRow =
		draggingWorkspaceId === null
			? null
			: (columns
					.flatMap((c) => c.rows)
					.find((row) => row.id === draggingWorkspaceId) ?? null);

	return (
		<div aria-label="Dashboard screen" className="flex min-h-0 flex-1 flex-col">
			<ScreenHeader>
				<span className="font-semibold text-foreground">Dashboard</span>
				<span className="text-muted-foreground">{total} workspaces</span>
				<RepoFilter
					repos={repos}
					selected={selectedRepoIds}
					onChange={onSelectRepoIds}
				/>
				<ColumnFilter
					columns={columnOptions}
					visible={visibleColumnIds}
					onChange={onSelectColumnIds}
				/>
				<span className="ml-auto text-muted-foreground">
					{totalRunning} running
				</span>
			</ScreenHeader>
			<div className="min-h-0 flex-1 overflow-x-auto p-4">
				<div
					className="grid min-h-full min-w-full gap-3"
					style={{
						gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(16rem, 1fr))`,
					}}
				>
					{columns.map((column) => {
						const tone = columnTone(column.tone);
						const Icon = column.icon;
						const isDropColumn = dropTarget?.columnId === column.id;
						return (
							<section
								key={column.id}
								aria-label={`${column.label} column`}
								data-kanban-column-id={column.id}
								className={cn(
									"flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 border-t-0 bg-muted/30 transition-colors",
									isDropColumn &&
										"border-primary/50 bg-primary/5 ring-1 ring-primary/30",
								)}
							>
								<div
									className={cn(
										"flex items-center gap-2 px-3 py-2 font-medium text-xs transition-colors",
										tone.header,
										isDropColumn && "bg-primary/10",
									)}
								>
									<Icon className={cn("size-3.5 shrink-0", tone.icon)} />
									<span className="text-foreground">{column.label}</span>
									<span className="ml-auto rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
										{column.rows.length}
									</span>
								</div>
								<div
									data-kanban-cards
									className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-2 pb-2"
								>
									{column.rows.length === 0 ? (
										isDropColumn && draggingRow ? (
											<DropGhost
												row={draggingRow}
												running={runningWorkspaceIds.has(draggingRow.id)}
												diffStat={diffStats.get(draggingRow.id)}
											/>
										) : (
											<div className="rounded-md border border-transparent px-2 py-6 text-center text-muted-foreground/70 text-xs">
												No workspaces
											</div>
										)
									) : (
										<>
											{column.rows.map((row) => (
												<div key={row.id}>
													{isDropColumn &&
														dropTarget?.beforeId === row.id &&
														draggingRow && (
															<DropGhost
																row={draggingRow}
																running={runningWorkspaceIds.has(
																	draggingRow.id,
																)}
																diffStat={diffStats.get(draggingRow.id)}
															/>
														)}
													<div
														data-kanban-card-id={row.id}
														className={cn(
															"select-none transition-opacity",
															draggingWorkspaceId === row.id && "opacity-40",
														)}
														onPointerDown={(event) => {
															startDragGesture({
																event,
																workspaceId: row.id,
																columnId: column.id,
																title: row.title,
															});
														}}
													>
														<WorkspaceKanbanCard
															row={row}
															running={runningWorkspaceIds.has(row.id)}
															diffStat={diffStats.get(row.id)}
															onOpen={(id) => {
																if (shouldSuppressClick()) return;
																onOpenWorkspace(id);
															}}
														/>
													</div>
												</div>
											))}
											{isDropColumn &&
												dropTarget?.beforeId === null &&
												draggingRow && (
													<DropGhost
														row={draggingRow}
														running={runningWorkspaceIds.has(draggingRow.id)}
														diffStat={diffStats.get(draggingRow.id)}
													/>
												)}
										</>
									)}
								</div>
							</section>
						);
					})}
				</div>
			</div>
			{dragState && draggingRow && (
				<KanbanDragGhost
					dragState={dragState}
					row={draggingRow}
					running={runningWorkspaceIds.has(draggingRow.id)}
					diffStat={diffStats.get(draggingRow.id)}
				/>
			)}
		</div>
	);
}

/** The landing indicator: a faded copy of the actual card, sitting in the exact
 *  slot the dragged card will occupy on drop. Renders the real
 *  `WorkspaceKanbanCard` so it matches 1:1, just translucent and inert. */
function DropGhost({
	row,
	running,
	diffStat,
}: {
	row: WorkspaceRow;
	running: boolean;
	diffStat?: WorkspaceDiffStat;
}) {
	return (
		<div
			aria-hidden
			className="pointer-events-none rounded-md opacity-40 ring-1 ring-primary/40"
			data-testid="drop-ghost-card"
		>
			<WorkspaceKanbanCard
				row={row}
				running={running}
				diffStat={diffStat}
				onOpen={() => {}}
			/>
		</div>
	);
}
