import { Panel, useReactFlow, useViewport } from "@xyflow/react";
import { MaximizeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasTheme } from "./theme-modes";

const BTN =
	"flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** Overlay toolbar: live theme pill, current zoom, and fit-to-view. Rendered
 * inside `<ReactFlow>` so its hooks resolve against the flow instance. */
export function DesignToolbar({ theme }: { theme: CanvasTheme }) {
	const { fitView } = useReactFlow();
	const { zoom } = useViewport();
	return (
		<Panel position="top-left">
			<div className="flex items-center gap-0.5 rounded-md border border-border bg-card/90 p-1 text-mini backdrop-blur">
				<span className="rounded bg-muted px-1.5 py-0.5 text-nano text-muted-foreground uppercase tracking-wide">
					{theme}
				</span>
				<span className="px-1.5 text-muted-foreground tabular-nums">
					{Math.round(zoom * 100)}%
				</span>
				<button
					type="button"
					className={cn(BTN)}
					onClick={() => fitView({ padding: 0.2, duration: 200 })}
				>
					<MaximizeIcon className="size-3.5" />
					Fit
				</button>
			</div>
		</Panel>
	);
}
