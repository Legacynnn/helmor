import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	getFirstCollision,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Check, ChevronDown, Columns3, Search } from "lucide-react";
import { memo, useEffect, useId, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { STATUS_OPTIONS } from "@/features/navigation/shared";
import type {
	RepositoryCreateOption,
	WorkspaceRow,
	WorkspaceStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { KanbanCardOverlay } from "./components/kanban-card";
import { KanbanColumn } from "./components/kanban-column";
import { KANBAN_COLUMNS } from "./types";

type ItemsByColumn = Record<WorkspaceStatus, string[]>;

const EMPTY_ITEMS: ItemsByColumn = {
	backlog: [],
	"in-progress": [],
	review: [],
	done: [],
	canceled: [],
};

function deriveItems(rows: WorkspaceRow[]): ItemsByColumn {
	const next: ItemsByColumn = {
		backlog: [],
		"in-progress": [],
		review: [],
		done: [],
		canceled: [],
	};
	for (const row of rows) {
		const status = (row.status ?? "backlog") as WorkspaceStatus;
		(next[status] ?? next.backlog).push(row.id);
	}
	return next;
}

function findContainer(
	items: ItemsByColumn,
	id: string,
): WorkspaceStatus | null {
	if (id.startsWith("col:")) {
		return id.slice(4) as WorkspaceStatus;
	}
	for (const status of Object.keys(items) as WorkspaceStatus[]) {
		if (items[status].includes(id)) return status;
	}
	return null;
}

export type KanbanScreenProps = {
	rows: WorkspaceRow[];
	repositories: RepositoryCreateOption[];
	loading: boolean;
	onSelectWorkspace: (workspaceId: string) => void;
	onSetStatus: (workspaceId: string, status: WorkspaceStatus) => void;
	onCreatePr: (workspaceId: string) => void;
};

export const KanbanScreen = memo(function KanbanScreen({
	rows,
	repositories,
	loading,
	onSelectWorkspace,
	onSetStatus,
	onCreatePr,
}: KanbanScreenProps) {
	const searchInputId = useId();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [hiddenColumns, setHiddenColumns] = useState<Set<WorkspaceStatus>>(
		() => new Set(),
	);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overColumn, setOverColumn] = useState<WorkspaceStatus | null>(null);
	const [items, setItems] = useState<ItemsByColumn>(EMPTY_ITEMS);

	const rowById = useMemo(() => {
		const map = new Map<string, WorkspaceRow>();
		for (const row of rows) map.set(row.id, row);
		return map;
	}, [rows]);

	const filteredRows = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return rows.filter((row) => {
			if (selectedRepoIds.size > 0) {
				if (!row.repoId || !selectedRepoIds.has(row.repoId)) return false;
			}
			if (q.length === 0) return true;
			const haystack = [row.title, row.branch, row.repoName, row.prTitle]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [rows, searchQuery, selectedRepoIds]);

	// Sync local item ordering whenever the source rows or filters change,
	// except mid-drag — we don't want server invalidation to yank the card
	// out from under the user's cursor.
	useEffect(() => {
		if (activeId) return;
		setItems(deriveItems(filteredRows));
	}, [filteredRows, activeId]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);

	// Two-pass collision detection so a drop always resolves to a column,
	// even when the cursor isn't directly over a card. First we try
	// `pointerWithin` to find the column under the pointer; then we narrow
	// to the closest card inside that column (or fall back to the column
	// droppable itself for empty/below-last-card areas).
	const collisionDetection = useMemo<CollisionDetection>(
		() => (args) => {
			const pointerCollisions = pointerWithin(args);
			const columnHit = pointerCollisions.find((c) =>
				String(c.id).startsWith("col:"),
			);

			let resolvedColumn: WorkspaceStatus | null = null;
			if (columnHit) {
				resolvedColumn = String(columnHit.id).slice(4) as WorkspaceStatus;
			} else {
				// Pointer is outside any column (e.g. dragging past the edge);
				// fall back to the column of the nearest card via rect
				// intersection, so the drag always has a target.
				const rectCollisions = rectIntersection(args);
				const first = getFirstCollision(rectCollisions);
				if (first) {
					const id = String(first);
					if (id.startsWith("col:")) {
						resolvedColumn = id.slice(4) as WorkspaceStatus;
					} else {
						for (const status of Object.keys(items) as WorkspaceStatus[]) {
							if (items[status].includes(id)) {
								resolvedColumn = status;
								break;
							}
						}
					}
				}
			}

			if (!resolvedColumn) return pointerCollisions;

			// Within the resolved column: prefer a card collision (for
			// precise insertion), else the column droppable itself.
			const columnContainerId = `col:${resolvedColumn}`;
			const inColumn = pointerCollisions.filter((c) => {
				const id = String(c.id);
				if (id === columnContainerId) return true;
				return items[resolvedColumn]?.includes(id);
			});
			const cardHit = inColumn.find((c) => !String(c.id).startsWith("col:"));
			if (cardHit) return [cardHit];
			return [{ id: columnContainerId }];
		},
		[items],
	);

	const toggleRepo = (repoId: string) => {
		setSelectedRepoIds((prev) => {
			const next = new Set(prev);
			if (next.has(repoId)) next.delete(repoId);
			else next.add(repoId);
			return next;
		});
	};

	const toggleColumnVisibility = (status: WorkspaceStatus) => {
		setHiddenColumns((prev) => {
			const next = new Set(prev);
			if (next.has(status)) next.delete(status);
			else next.add(status);
			return next;
		});
	};

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(String(event.active.id));
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		if (!over) {
			setOverColumn(null);
			return;
		}
		const activeIdStr = String(active.id);
		const overIdStr = String(over.id);
		const overContainerFromEvent = findContainer(items, overIdStr);
		setOverColumn(overContainerFromEvent);

		if (activeIdStr === overIdStr) return;

		setItems((prev) => {
			const activeContainer = findContainer(prev, activeIdStr);
			const overContainer = findContainer(prev, overIdStr);
			if (!activeContainer || !overContainer) return prev;
			if (activeContainer === overContainer) return prev;

			const activeItems = prev[activeContainer];
			const overItems = prev[overContainer];
			const activeIndex = activeItems.indexOf(activeIdStr);
			if (activeIndex < 0) return prev;

			// If hovering directly over the column container, append.
			// If hovering over a card, insert before/after based on cursor side.
			let newIndex: number;
			if (overIdStr.startsWith("col:")) {
				newIndex = overItems.length;
			} else {
				const overIndex = overItems.indexOf(overIdStr);
				const isBelow =
					over.rect &&
					active.rect.current.translated &&
					active.rect.current.translated.top >
						over.rect.top + over.rect.height / 2;
				newIndex =
					overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : overItems.length;
			}

			return {
				...prev,
				[activeContainer]: activeItems.filter((id) => id !== activeIdStr),
				[overContainer]: [
					...overItems.slice(0, newIndex),
					activeIdStr,
					...overItems.slice(newIndex),
				],
			};
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		const activeIdStr = String(active.id);
		setActiveId(null);
		setOverColumn(null);

		if (!over) return;
		const overIdStr = String(over.id);

		const overContainer = findContainer(items, overIdStr);
		const activeContainer = findContainer(items, activeIdStr);
		if (!overContainer || !activeContainer) return;

		// Same-column reorder is visual-only (backend has no per-column
		// order), but we still slide the card to its drop slot for a
		// natural feel.
		if (activeContainer === overContainer) {
			const list = items[activeContainer];
			const fromIndex = list.indexOf(activeIdStr);
			const toIndex = list.indexOf(overIdStr);
			if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
				setItems((prev) => ({
					...prev,
					[activeContainer]: arrayMove(
						prev[activeContainer],
						fromIndex,
						toIndex,
					),
				}));
			}
		}

		const row = rowById.get(activeIdStr);
		if (!row) return;
		const currentStatus = (row.status ?? "backlog") as WorkspaceStatus;
		if (overContainer !== currentStatus) {
			onSetStatus(activeIdStr, overContainer);
		}
	};

	const activeRow = activeId ? rowById.get(activeId) : null;

	const visibleColumns = KANBAN_COLUMNS.filter(
		(col) => !hiddenColumns.has(col.status),
	);

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<header
				aria-label="Dashboard"
				className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border/40 bg-background/90 px-6 py-3 backdrop-blur"
				data-tauri-drag-region
			>
				<div className="flex items-center gap-2">
					<h1 className="text-[13px] font-semibold">Dashboard</h1>

					<div className="ml-auto flex items-center gap-2">
						<label
							htmlFor={searchInputId}
							className="relative flex w-[240px] items-center"
						>
							<Search
								aria-hidden="true"
								className="absolute left-2.5 size-3.5 text-muted-foreground/70"
								strokeWidth={2}
							/>
							<Input
								id={searchInputId}
								type="search"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Filter workspaces…"
								className="h-7 border-transparent bg-muted/40 pl-8 text-[12px] focus-visible:border-border focus-visible:bg-background"
								autoComplete="off"
								spellCheck={false}
							/>
						</label>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 text-[12px] text-muted-foreground hover:border-border hover:text-foreground"
								>
									<Columns3 className="size-3.5" strokeWidth={2} />
									<span>Columns</span>
									<ChevronDown className="size-3" strokeWidth={2} />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-44">
								<DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
									Show columns
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{KANBAN_COLUMNS.map((col) => {
									const visible = !hiddenColumns.has(col.status);
									return (
										<DropdownMenuItem
											key={col.status}
											onSelect={(e) => {
												e.preventDefault();
												toggleColumnVisibility(col.status);
											}}
										>
											<span className="flex size-3.5 items-center justify-center">
												{visible ? (
													<Check className="size-3.5" strokeWidth={2.2} />
												) : null}
											</span>
											<span className="flex-1">{col.label}</span>
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						onClick={() => setSelectedRepoIds(new Set())}
						className={cn(
							"cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
							selectedRepoIds.size === 0
								? "border-foreground/40 bg-foreground/10 text-foreground"
								: "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						All projects
					</button>
					{repositories.map((repo) => {
						const active = selectedRepoIds.has(repo.id);
						const initials =
							repo.repoInitials?.trim() ||
							repo.name.slice(0, 2).toUpperCase() ||
							"WS";
						return (
							<button
								key={repo.id}
								type="button"
								onClick={() => toggleRepo(repo.id)}
								className={cn(
									"flex cursor-pointer items-center gap-1.5 rounded-full border px-1.5 py-0.5 pr-2.5 text-[11px] transition-colors",
									active
										? "border-foreground/40 bg-foreground/10 text-foreground"
										: "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
								)}
							>
								<span
									className={cn(
										"flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold uppercase",
										active ? "text-foreground" : "text-muted-foreground",
									)}
									aria-hidden="true"
								>
									{repo.repoIconSrc ? (
										<img
											src={repo.repoIconSrc}
											alt=""
											className="size-full object-cover"
										/>
									) : (
										initials
									)}
								</span>
								<span className="max-w-[120px] truncate">{repo.name}</span>
							</button>
						);
					})}
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
				{loading && rows.length === 0 ? (
					<div className="px-6 py-12 text-center text-[13px] text-muted-foreground">
						Loading workspaces…
					</div>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={collisionDetection}
						onDragStart={handleDragStart}
						onDragOver={handleDragOver}
						onDragEnd={handleDragEnd}
						onDragCancel={() => {
							setActiveId(null);
							setOverColumn(null);
						}}
					>
						<div className="flex h-full gap-2 px-4 py-4">
							{visibleColumns.map((col) => {
								const opt = STATUS_OPTIONS.find((o) => o.value === col.status);
								const tone = opt?.tone ?? "backlog";
								const ids = items[col.status] ?? [];
								const columnRows = ids
									.map((id) => rowById.get(id))
									.filter((row): row is WorkspaceRow => Boolean(row));
								return (
									<KanbanColumn
										key={col.status}
										status={col.status}
										tone={tone}
										label={col.label}
										rows={columnRows}
										highlighted={activeId !== null && overColumn === col.status}
										onSelectWorkspace={onSelectWorkspace}
										onSetStatus={onSetStatus}
										onCreatePr={onCreatePr}
									/>
								);
							})}
						</div>

						<DragOverlay dropAnimation={null}>
							{activeRow ? (
								<KanbanCardOverlay
									row={activeRow}
									onSelect={onSelectWorkspace}
									onSetStatus={onSetStatus}
									onCreatePr={onCreatePr}
								/>
							) : null}
						</DragOverlay>
					</DndContext>
				)}
			</div>
		</div>
	);
});
