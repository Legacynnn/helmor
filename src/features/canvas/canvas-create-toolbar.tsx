import {
	FolderTree,
	LayoutGrid,
	MessageSquare,
	NotebookPen,
	Pencil,
	Plus,
	SquarePen,
	SquareTerminal,
} from "lucide-react";
import type { ComponentType } from "react";
import type { CanvasPanelType } from "@/lib/api";
import { useCanvasCreateStore } from "./canvas-create-store";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";

type PaletteEntry = {
	type: CanvasPanelType;
	label: string;
	icon: ComponentType<{ className?: string }>;
};

const PALETTE: PaletteEntry[] = [
	{ type: "conversation", label: "Conversation", icon: MessageSquare },
	{ type: "terminal", label: "Terminal", icon: SquareTerminal },
	{ type: "notes", label: "Notes", icon: NotebookPen },
	{ type: "drawing", label: "Drawing", icon: Pencil },
	{ type: "file-manager", label: "Files", icon: FolderTree },
	{ type: "editor", label: "Editor", icon: SquarePen },
	{ type: "placeholder", label: "Panel", icon: LayoutGrid },
];

/** Right "Create" rail — a palette that arms a panel type for drag-to-place.
 * Clicking a type doesn't create a panel; it switches the canvas into a
 * crosshair "draw" mode (see {@link CanvasCreateOverlay}) where the user drags
 * out the panel's position + size. Clicking the armed type again disarms. */
export function CanvasCreateToolbar() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	return (
		<div className="pointer-events-auto absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-app-border bg-app-base/90 p-1 shadow-lg backdrop-blur">
			<div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1 text-[10px] text-app-muted-foreground uppercase tracking-wide">
				<Plus className="size-3" /> Create
			</div>
			{PALETTE.map((entry) => {
				const Icon = entry.icon;
				const armed = pendingType === entry.type;
				return (
					<button
						key={entry.type}
						type="button"
						aria-pressed={armed}
						className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-app-muted"
						style={
							armed
								? {
										backgroundColor: `color-mix(in oklab, ${SELECTED_COLOR} 15%, transparent)`,
										color: SELECTED_COLOR,
										boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${SELECTED_COLOR} 40%, transparent)`,
									}
								: undefined
						}
						onClick={() => toggle(entry.type)}
					>
						<Icon className="size-3.5 shrink-0 opacity-70" />
						<span>{entry.label}</span>
					</button>
				);
			})}
		</div>
	);
}
