import {
	FileCode,
	FolderTree,
	GitBranch,
	Globe,
	NotebookPen,
	Pencil,
} from "lucide-react";
import { getShortcut } from "@/features/shortcuts/registry";
import { useSettings } from "@/lib/settings";
import { useCanvasCreateStore } from "../canvas-create-store";
import { GlassRail, RailButton } from "./glass-rail";

/** Right glass rail: arms panel types for the drag-to-place create flow. */
export function CanvasRightRail() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	const { settings } = useSettings();
	return (
		<GlassRail side="right">
			<RailButton icon={Globe} label="Browser (coming soon)" disabled />
			<RailButton
				icon={GitBranch}
				label="Git"
				shortcut={getShortcut(settings.shortcuts, "canvas.newGit")}
				armed={pendingType === "git"}
				onClick={() => toggle("git")}
			/>
			<RailButton
				icon={FolderTree}
				label="Files"
				shortcut={getShortcut(settings.shortcuts, "canvas.newFiles")}
				armed={pendingType === "file-manager"}
				onClick={() => toggle("file-manager")}
			/>
			<RailButton
				icon={FileCode}
				label="Editor"
				shortcut={getShortcut(settings.shortcuts, "canvas.newEditor")}
				armed={pendingType === "editor"}
				onClick={() => toggle("editor")}
			/>
			<RailButton
				icon={NotebookPen}
				label="Notes"
				shortcut={getShortcut(settings.shortcuts, "canvas.newNotes")}
				armed={pendingType === "notes"}
				onClick={() => toggle("notes")}
			/>
			<RailButton
				icon={Pencil}
				label="Drawing"
				shortcut={getShortcut(settings.shortcuts, "canvas.newDrawing")}
				armed={pendingType === "drawing"}
				onClick={() => toggle("drawing")}
			/>
		</GlassRail>
	);
}
