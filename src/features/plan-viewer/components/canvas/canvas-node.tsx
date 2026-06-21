import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { renderBlocks } from "../../render-blocks";
import type { CanvasNodeData } from "./build-graph";

/** A single mind-map card on the canvas. `data` comes from build-graph. */
export function CanvasNode({ data, selected }: NodeProps) {
	const { title, bodyBlocks } = data as unknown as CanvasNodeData;
	return (
		<div
			className={cn(
				"w-[220px] max-h-[200px] overflow-hidden rounded-lg border bg-card shadow-sm transition-all",
				"border-border",
				selected ? "ring-2 ring-ring border-ring" : "hover:border-ring/60",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-border" />
			<div className="border-b border-border px-3 py-2 text-small font-medium text-foreground">
				{title}
			</div>
			{bodyBlocks.length > 0 ? (
				<div className="max-h-[140px] overflow-auto px-3 py-2 text-micro text-muted-foreground">
					{renderBlocks(bodyBlocks)}
				</div>
			) : null}
			<Handle type="source" position={Position.Bottom} className="!bg-border" />
		</div>
	);
}
