import {
	ArrowLeft,
	MessageSquare,
	MousePointer2,
	Palette,
	SquareTerminal,
} from "lucide-react";
import { useCanvasCreateStore } from "../canvas-create-store";
import { useCanvasInteractionStore } from "../canvas-interaction-store";
import { useCanvasModeStore } from "../use-canvas-mode";
import { GlassRail, RailButton } from "./glass-rail";

export function CanvasLeftRail({
	workspaceId,
	onCustomize,
	customizeOpen,
}: {
	workspaceId: string;
	onCustomize: () => void;
	customizeOpen: boolean;
}) {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	const selectMode = useCanvasInteractionStore((s) => s.selectMode);
	const toggleSelect = useCanvasInteractionStore((s) => s.toggleSelect);
	return (
		<GlassRail side="left">
			<RailButton
				icon={ArrowLeft}
				label="Back to workspace"
				onClick={() =>
					useCanvasModeStore.getState().setMode(workspaceId, false)
				}
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
				armed={pendingType === "conversation"}
				onClick={() => toggle("conversation")}
			/>
			<RailButton
				icon={SquareTerminal}
				label="New terminal"
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
