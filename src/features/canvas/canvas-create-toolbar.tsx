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
import { useCanvasActions } from "./canvas-actions-context";

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

/** Right "Create" rail — a palette to add new panels at the viewport center. */
export function CanvasCreateToolbar() {
	const { addPanel } = useCanvasActions();
	return (
		<div className="pointer-events-auto absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-app-border bg-app-base/90 p-1 shadow-lg backdrop-blur">
			<div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1 text-[10px] text-app-muted-foreground uppercase tracking-wide">
				<Plus className="size-3" /> Create
			</div>
			{PALETTE.map((entry) => {
				const Icon = entry.icon;
				return (
					<button
						key={entry.type}
						type="button"
						className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-app-muted"
						onClick={() => {
							void addPanel(entry.type);
						}}
					>
						<Icon className="size-3.5 shrink-0 opacity-70" />
						<span>{entry.label}</span>
					</button>
				);
			})}
		</div>
	);
}
