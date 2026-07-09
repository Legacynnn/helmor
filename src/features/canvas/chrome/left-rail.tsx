import {
	ArrowLeft,
	MessageSquare,
	MousePointer2,
	Palette,
	PanelLeft,
	SquareTerminal,
} from "lucide-react";
import {
	CANVAS_SIDEBAR_OPEN_LEFT,
	useCanvasSidebarStore,
} from "@/features/canvas/use-canvas-sidebar-store";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { getShortcut } from "@/features/shortcuts/registry";
import { useSettings } from "@/lib/settings";
import { useCanvasCreateStore } from "../canvas-create-store";
import { useCanvasInteractionStore } from "../canvas-interaction-store";
import { GlassRail, RailButton } from "./glass-rail";

export function CanvasLeftRail({
	onCustomize,
	customizeOpen,
}: {
	onCustomize: () => void;
	customizeOpen: boolean;
}) {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	const selectMode = useCanvasInteractionStore((s) => s.selectMode);
	const toggleSelect = useCanvasInteractionStore((s) => s.toggleSelect);
	const sidebarOpen = useCanvasSidebarStore((s) => s.open);
	const toggleSidebar = useCanvasSidebarStore((s) => s.toggle);
	const { settings } = useSettings();
	return (
		<GlassRail
			side="left"
			className={sidebarOpen ? CANVAS_SIDEBAR_OPEN_LEFT : ""}
		>
			<RailButton
				icon={PanelLeft}
				label="Workspaces (⌘B)"
				armed={sidebarOpen}
				onClick={toggleSidebar}
			/>
			<RailButton
				icon={ArrowLeft}
				label="Back to workspaces"
				onClick={() => useSpaceStore.getState().setActiveSpace("normal")}
			/>
			<RailButton
				icon={MousePointer2}
				label="Select / move"
				armed={selectMode}
				onClick={() => {
					useCanvasCreateStore.getState().clear();
					toggleSelect();
				}}
			/>
			<RailButton
				icon={MessageSquare}
				label="New conversation"
				shortcut={getShortcut(settings.shortcuts, "canvas.newConversation")}
				armed={pendingType === "conversation"}
				onClick={() => toggle("conversation")}
			/>
			<RailButton
				icon={SquareTerminal}
				label="New terminal"
				shortcut={getShortcut(settings.shortcuts, "canvas.newTerminal")}
				armed={pendingType === "terminal"}
				onClick={() => toggle("terminal")}
			/>
			<RailButton
				icon={Palette}
				label="Customize canvas"
				armed={customizeOpen}
				onClick={onCustomize}
			/>
		</GlassRail>
	);
}
