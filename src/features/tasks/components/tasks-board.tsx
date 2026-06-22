import {
	AnimatePresence,
	LayoutGroup,
	motion,
	useReducedMotion,
} from "motion/react";
import { useRef, useState } from "react";
import type { Task, TaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusKey } from "../filters/status-order";
import { cardLayoutTransition, cardTransition } from "../motion";
import { KanbanCard } from "./kanban-card";
import { TaskStatusIcon } from "./task-status-icon";

/** Column key under the given viewport point, if any. */
function columnKeyAt(x: number, y: number): string | null {
	const el = document
		.elementsFromPoint(x, y)
		.find((node) => node.hasAttribute("data-column-key"));
	return el?.getAttribute("data-column-key") ?? null;
}

export function TasksBoard({
	tasks,
	columns,
	visibleColumnKeys,
	selectedTaskId,
	onSelectTask,
	onMoveTask,
}: {
	tasks: Task[];
	columns: TaskStatus[];
	visibleColumnKeys: ReadonlySet<string>;
	selectedTaskId: string | null;
	onSelectTask: (taskId: string) => void;
	/** Fired when a card is dropped on a different column. */
	onMoveTask: (task: Task, target: TaskStatus) => void;
}) {
	const reduce = useReducedMotion();
	const [draggingId, setDraggingId] = useState<string | null>(null);
	// Column currently under the dragged card, for the drop-target highlight.
	const [dragOverKey, setDragOverKey] = useState<string | null>(null);
	// Set on drag-start so the synthetic click that follows a drop doesn't open
	// the drawer.
	const draggedRef = useRef(false);

	const visibleColumns = columns.filter((c) =>
		visibleColumnKeys.has(statusKey(c)),
	);
	const byColumn = new Map<string, Task[]>();
	for (const col of visibleColumns) byColumn.set(statusKey(col), []);
	for (const task of tasks) {
		const key = statusKey(task.status);
		byColumn.get(key)?.push(task);
	}

	const draggingTask = draggingId
		? (tasks.find((t) => t.id === draggingId) ?? null)
		: null;
	const draggingFromKey = draggingTask ? statusKey(draggingTask.status) : null;

	function handleDragEnd(task: Task, event: MouseEvent | PointerEvent) {
		setDraggingId(null);
		setDragOverKey(null);
		const targetKey = columnKeyAt(event.clientX, event.clientY);
		if (!targetKey || targetKey === statusKey(task.status)) return;
		const target = columns.find((c) => statusKey(c) === targetKey);
		if (target) onMoveTask(task, target);
	}

	return (
		<LayoutGroup>
			<div className="flex h-full gap-3 overflow-x-auto p-3">
				{visibleColumns.map((col) => {
					const key = statusKey(col);
					const items = byColumn.get(key) ?? [];
					const isDropTarget =
						draggingId !== null &&
						dragOverKey === key &&
						draggingFromKey !== key;
					// Faint "this is a valid landing zone" cue on every other column
					// while a drag is in flight, so the board reads as droppable.
					const isDroppable =
						draggingId !== null && draggingFromKey !== key && !isDropTarget;
					return (
						<div
							key={key}
							data-column-key={key}
							className={cn(
								"flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/20 transition-[background-color,border-color,box-shadow] duration-200 ease-out",
								isDropTarget
									? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/25 ring-inset"
									: isDroppable
										? "border-border/60 bg-muted/30"
										: "border-border/40",
							)}
						>
							<div className="flex items-center gap-2 px-3 py-2.5">
								<TaskStatusIcon
									kind={col.kind}
									color={col.color}
									title={col.name}
									size={15}
								/>
								<span className="font-medium text-foreground text-ui">
									{col.name}
								</span>
								<span className="ml-auto rounded-full bg-muted/70 px-1.5 py-0.5 text-muted-foreground text-small tabular-nums">
									{items.length}
								</span>
							</div>
							<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
								<AnimatePresence mode="popLayout" initial={false}>
									{items.map((task) => (
										<motion.div
											key={task.id}
											layout={!reduce}
											initial={reduce ? false : { opacity: 0, y: 6 }}
											animate={{ opacity: 1, y: 0 }}
											exit={
												reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
											}
											transition={
												reduce
													? cardTransition
													: { ...cardTransition, layout: cardLayoutTransition }
											}
											drag
											dragSnapToOrigin
											dragElastic={0.12}
											dragMomentum={false}
											whileDrag={{
												scale: 1.03,
												zIndex: 50,
												boxShadow:
													"0 12px 28px -8px rgb(0 0 0 / 0.35), 0 2px 6px -2px rgb(0 0 0 / 0.2)",
											}}
											onDragStart={() => {
												draggedRef.current = true;
												setDraggingId(task.id);
											}}
											onDrag={(event) => {
												const ev = event as PointerEvent;
												const k = columnKeyAt(ev.clientX, ev.clientY);
												setDragOverKey((prev) => (prev === k ? prev : k));
											}}
											onDragEnd={(event) =>
												handleDragEnd(task, event as PointerEvent)
											}
											onClick={() => {
												if (draggedRef.current) {
													draggedRef.current = false;
													return;
												}
												onSelectTask(task.id);
											}}
										>
											<KanbanCard
												task={task}
												selected={selectedTaskId === task.id}
												dragging={draggingId === task.id}
											/>
										</motion.div>
									))}
								</AnimatePresence>
								<div
									className={cn(
										"min-h-10 flex-1 rounded-lg transition-colors duration-200 ease-out",
										items.length === 0 &&
											"flex items-center justify-center border border-dashed text-small",
										items.length === 0 &&
											(isDropTarget
												? "border-primary/50 bg-primary/[0.06] text-primary"
												: "border-border/30 text-muted-foreground"),
									)}
								>
									{items.length === 0
										? isDropTarget
											? "Release to move here"
											: "No tasks"
										: null}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</LayoutGroup>
	);
}
