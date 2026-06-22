import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { renderBlocks } from "../../render-blocks";
import { accentClasses, type PlanAccent } from "../shell/accent";
import type { CanvasNodeData } from "./build-graph";
import { type CanvasNodeKind, NODE_SIZE, normalizeKind } from "./node-kinds";

/** Accent per node kind, so a resume/option/phase/wireframe box reads
 * differently from a plain note. */
const KIND_ACCENT: Record<CanvasNodeKind, PlanAccent> = {
	note: "neutral",
	resume: "info",
	option: "success",
	phase: "warning",
	wireframe: "highlight",
};

/** A single card on the canvas. `data` comes from build-graph. */
export function CanvasNode({ data, selected }: NodeProps) {
	const d = data as unknown as CanvasNodeData;
	const kind = normalizeKind(d.kind);
	const styles = accentClasses(KIND_ACCENT[kind]);
	return (
		<div
			style={{ width: NODE_SIZE[kind].width }}
			className={cn(
				"max-h-[240px] overflow-hidden rounded-lg border bg-card shadow-sm transition-colors",
				styles.container,
				selected ? "border-ring ring-2 ring-ring" : "hover:border-ring/60",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-border" />
			<div
				className={cn(
					"border-b border-border/50 px-3 py-2 font-medium text-small",
					styles.header,
				)}
			>
				{d.title}
			</div>
			{d.bodyBlocks.length > 0 ? (
				<div className="max-h-[180px] overflow-auto px-3 py-2 text-micro text-muted-foreground">
					{renderBlocks(d.bodyBlocks)}
				</div>
			) : null}
			<Handle type="source" position={Position.Bottom} className="!bg-border" />
		</div>
	);
}
