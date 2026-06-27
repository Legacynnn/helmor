import {
	FolderTree,
	GitBranch,
	Globe,
	MoreHorizontal,
	NotebookPen,
	Pencil,
	SquarePen,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasPanelType } from "@/lib/api";
import { useCanvasCreateStore } from "../canvas-create-store";
import { GlassRail, RailButton } from "./glass-rail";

const MORE: {
	type: CanvasPanelType;
	label: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{ type: "notes", label: "Notes", icon: NotebookPen },
	{ type: "drawing", label: "Drawing", icon: Pencil },
];

/** Right glass rail: arms panel types for the drag-to-place create flow. */
export function CanvasRightRail() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	return (
		<GlassRail side="right">
			<RailButton icon={Globe} label="Browser (coming soon)" disabled />
			<RailButton
				icon={FolderTree}
				label="Files"
				armed={pendingType === "file-manager"}
				onClick={() => toggle("file-manager")}
			/>
			<RailButton
				icon={GitBranch}
				label="Git"
				armed={pendingType === "git"}
				onClick={() => toggle("git")}
			/>
			<RailButton
				icon={SquarePen}
				label="Editor"
				armed={pendingType === "editor"}
				onClick={() => toggle("editor")}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						title="More panels"
						className="flex size-9 cursor-pointer items-center justify-center rounded-[14px] text-app-foreground/80 transition-colors hover:bg-white/10 hover:text-app-foreground"
					>
						<MoreHorizontal className="size-4.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="left" align="end">
					{MORE.map((m) => (
						<DropdownMenuItem
							key={m.type}
							onClick={() => toggle(m.type)}
							className="cursor-pointer"
						>
							<m.icon className="size-3.5 opacity-70" />
							<span>{m.label}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</GlassRail>
	);
}
