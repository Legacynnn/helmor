import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
	FlagIcon,
	GitBranchIcon,
	LayoutDashboardIcon,
	LayoutTemplateIcon,
	type LucideIcon,
	StickyNoteIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { renderBlocks } from "../../render-blocks";
import { accentClasses, type PlanAccent } from "../shell/accent";
import type { CanvasNodeData } from "./build-graph";
import { type CanvasNodeKind, NODE_SIZE, normalizeKind } from "./node-kinds";

/** Per-kind accent, icon, and short role label so a node's role is legible at a
 * glance — a phase reads differently from an option, an overview from a note. */
const KIND_META: Record<
	CanvasNodeKind,
	{ accent: PlanAccent; icon: LucideIcon; label: string }
> = {
	note: { accent: "neutral", icon: StickyNoteIcon, label: "Note" },
	resume: { accent: "info", icon: LayoutDashboardIcon, label: "Overview" },
	option: { accent: "success", icon: GitBranchIcon, label: "Option" },
	phase: { accent: "warning", icon: FlagIcon, label: "Phase" },
	wireframe: { accent: "highlight", icon: LayoutTemplateIcon, label: "Mockup" },
};

/** A single card on the canvas. `data` comes from build-graph. */
export function CanvasNode({ data, selected }: NodeProps) {
	const d = data as unknown as CanvasNodeData;
	const kind = normalizeKind(d.kind);
	const meta = KIND_META[kind];
	const styles = accentClasses(meta.accent);
	const Icon = meta.icon;
	return (
		<div
			style={{ width: NODE_SIZE[kind].width }}
			className={cn(
				// Flat, bordered surface (no shadow); `styles.container` supplies the
				// per-kind fill + border so the node never sits white-on-white.
				"max-h-[240px] overflow-hidden rounded-lg border transition-colors",
				styles.container,
				selected ? "border-ring ring-2 ring-ring" : "hover:border-ring/60",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-border" />
			<div
				className={cn(
					"flex items-center gap-1.5 border-b border-border/50 px-3 py-2 font-medium text-small",
					styles.header,
				)}
			>
				<Icon className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
				<span className="min-w-0 flex-1 truncate">{d.title}</span>
				<span
					className={cn(
						"shrink-0 rounded border px-1 py-px text-nano uppercase tracking-wide",
						styles.badge,
					)}
				>
					{meta.label}
				</span>
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
