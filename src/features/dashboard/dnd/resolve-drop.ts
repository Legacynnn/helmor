import type { DashboardColumnId } from "../hooks/use-dashboard-board";

/** Horizontal bounds of a single kanban column, in viewport coordinates. */
export type ColumnBounds = {
	id: DashboardColumnId;
	left: number;
	right: number;
};

/** A resolved drop position: which column the card lands in and which card it
 *  lands *before* (`null` = append to the end of the column). */
export type KanbanDropTarget = {
	columnId: DashboardColumnId;
	beforeId: string | null;
};

/** Selector marking a column section that can receive a drop. */
export const KANBAN_COLUMN_SELECTOR = "[data-kanban-column-id]";
/** Selector for the scrollable card list inside a column. */
export const KANBAN_CARDS_SELECTOR = "[data-kanban-cards]";
/** Selector for a single draggable card row. */
export const KANBAN_CARD_SELECTOR = "[data-kanban-card-id]";

/** Pick the column the pointer's X coordinate falls into. Unlike the native
 *  drag API — which needs the pointer to physically enter the target element —
 *  this clamps to the nearest column so a drag that drifts past the board edge
 *  still resolves to the first/last column instead of dropping the gesture.
 *  Columns are assumed left-to-right and non-overlapping. */
export function pickColumnIdByX(
	columns: readonly ColumnBounds[],
	clientX: number,
): DashboardColumnId | null {
	if (columns.length === 0) return null;
	const first = columns[0]!;
	if (clientX < first.left) return first.id;
	for (const column of columns) {
		if (clientX >= column.left && clientX < column.right) return column.id;
	}
	return columns[columns.length - 1]!.id;
}

/** Find the id of the card the pointer sits *before*, by comparing the pointer
 *  Y against each card's vertical midpoint. Returns `null` when the pointer is
 *  past the last card (append to the end). The card currently being dragged is
 *  skipped so it never counts as its own neighbour. */
export function computeBeforeId(
	container: HTMLElement | null,
	clientY: number,
	excludeId?: string | null,
): string | null {
	if (!container) return null;
	const cards = container.querySelectorAll<HTMLElement>(
		"[data-kanban-card-id]",
	);
	for (const card of cards) {
		const id = card.dataset.kanbanCardId ?? null;
		if (id !== null && id === excludeId) continue;
		const rect = card.getBoundingClientRect();
		if (clientY < rect.top + rect.height / 2) return id;
	}
	return null;
}

/** Resolve a full drop target from the live DOM. Reads every column's
 *  horizontal bounds, picks the column under `clientX`, then computes the
 *  insertion point within that column from `clientY`. Returns `null` only when
 *  the board has no columns mounted. */
export function resolveKanbanDropTarget(
	clientX: number,
	clientY: number,
	draggingId: string | null,
	root: Document | HTMLElement = document,
): KanbanDropTarget | null {
	const sections = Array.from(
		root.querySelectorAll<HTMLElement>(KANBAN_COLUMN_SELECTOR),
	);
	if (sections.length === 0) return null;

	const bounds: ColumnBounds[] = sections.map((section) => {
		const rect = section.getBoundingClientRect();
		return {
			id: section.dataset.kanbanColumnId as DashboardColumnId,
			left: rect.left,
			right: rect.right,
		};
	});

	const columnId = pickColumnIdByX(bounds, clientX);
	if (!columnId) return null;

	const section = sections.find(
		(element) => element.dataset.kanbanColumnId === columnId,
	);
	const container =
		section?.querySelector<HTMLElement>(KANBAN_CARDS_SELECTOR) ?? null;
	const beforeId = computeBeforeId(container, clientY, draggingId);
	return { columnId, beforeId };
}
