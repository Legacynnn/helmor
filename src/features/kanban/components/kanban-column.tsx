import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { memo } from "react";
import { GroupIcon } from "@/features/navigation/shared";
import type { GroupTone, WorkspaceRow, WorkspaceStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";

export type KanbanColumnProps = {
	status: WorkspaceStatus;
	tone: GroupTone;
	label: string;
	rows: WorkspaceRow[];
	highlighted?: boolean;
	onSelectWorkspace: (workspaceId: string) => void;
	onSetStatus: (workspaceId: string, status: WorkspaceStatus) => void;
	onCreatePr: (workspaceId: string) => void;
};

export const KanbanColumn = memo(function KanbanColumn({
	status,
	tone,
	label,
	rows,
	highlighted,
	onSelectWorkspace,
	onSetStatus,
	onCreatePr,
}: KanbanColumnProps) {
	const { setNodeRef } = useDroppable({
		id: `col:${status}`,
		data: { type: "column", status },
	});

	const ids = rows.map((row) => row.id);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex h-full w-[280px] shrink-0 flex-col rounded-lg transition-colors duration-150",
				highlighted ? "bg-foreground/[0.04]" : "bg-transparent",
			)}
		>
			<header className="flex items-center gap-2 px-3 py-2 text-[12px]">
				<GroupIcon tone={tone} />
				<span className="font-medium text-foreground">{label}</span>
				<span className="text-muted-foreground/60">{rows.length}</span>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				<SortableContext items={ids} strategy={verticalListSortingStrategy}>
					<div className="flex flex-col gap-2">
						{rows.map((row) => (
							<KanbanCard
								key={row.id}
								row={row}
								onSelect={onSelectWorkspace}
								onSetStatus={onSetStatus}
								onCreatePr={onCreatePr}
							/>
						))}
						{rows.length === 0 ? <div className="min-h-[120px]" /> : null}
					</div>
				</SortableContext>
			</div>
		</div>
	);
});
