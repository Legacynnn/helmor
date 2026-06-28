import {
	FolderTree,
	GitBranch,
	Globe,
	NotebookPen,
	Pencil,
} from "lucide-react";
import { useCanvasCreateStore } from "../canvas-create-store";
import { GlassRail, RailButton } from "./glass-rail";

/** Right glass rail: arms panel types for the drag-to-place create flow. */
export function CanvasRightRail() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	return (
		<GlassRail side="right">
			<RailButton icon={Globe} label="Browser (coming soon)" disabled />
			<RailButton
				icon={GitBranch}
				label="Git"
				armed={pendingType === "git"}
				onClick={() => toggle("git")}
			/>
			<RailButton
				icon={FolderTree}
				label="Editor"
				armed={pendingType === "editor"}
				onClick={() => toggle("editor")}
			/>
			<RailButton
				icon={NotebookPen}
				label="Notes"
				armed={pendingType === "notes"}
				onClick={() => toggle("notes")}
			/>
			<RailButton
				icon={Pencil}
				label="Drawing"
				armed={pendingType === "drawing"}
				onClick={() => toggle("drawing")}
			/>
		</GlassRail>
	);
}
