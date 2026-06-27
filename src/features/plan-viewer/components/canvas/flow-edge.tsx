import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	type InternalNode,
	type Node,
	Position,
	useInternalNode,
} from "@xyflow/react";
import type { CSSProperties } from "react";
import type { FlowKind } from "./build-graph";

/** Per-kind stroke: a solid accent for the primary path, quieter dashed lines
 * for secondary branches and back/return journeys. */
const STROKE: Record<FlowKind, CSSProperties> = {
	primary: { stroke: "var(--primary)", strokeWidth: 1.75 },
	secondary: {
		stroke: "var(--muted-foreground)",
		strokeWidth: 1.5,
		strokeDasharray: "6 5",
		opacity: 0.65,
	},
	back: {
		stroke: "var(--muted-foreground)",
		strokeWidth: 1.5,
		strokeDasharray: "2 5",
		opacity: 0.55,
	},
};

/** Point where the line from `node`'s center toward `target`'s center crosses
 * `node`'s border — so edges anchor to the frame edge, never cut into it. */
function nodeIntersection(
	node: InternalNode<Node>,
	target: InternalNode<Node>,
): { x: number; y: number } {
	const w = (node.measured?.width ?? 0) / 2;
	const h = (node.measured?.height ?? 0) / 2;
	const x2 = node.internals.positionAbsolute.x + w;
	const y2 = node.internals.positionAbsolute.y + h;
	const x1 =
		target.internals.positionAbsolute.x + (target.measured?.width ?? 0) / 2;
	const y1 =
		target.internals.positionAbsolute.y + (target.measured?.height ?? 0) / 2;
	if (w === 0 || h === 0) return { x: x2, y: y2 };
	const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
	const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
	const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
	const xx3 = a * xx1;
	const yy3 = a * yy1;
	return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

/** Which side of `node` the intersection point sits on (drives bezier tangent). */
function edgeSide(
	node: InternalNode<Node>,
	point: { x: number; y: number },
): Position {
	const nx = node.internals.positionAbsolute.x;
	const ny = node.internals.positionAbsolute.y;
	const w = node.measured?.width ?? 0;
	if (point.x <= nx + 1) return Position.Left;
	if (point.x >= nx + w - 1) return Position.Right;
	if (point.y <= ny + 1) return Position.Top;
	return Position.Bottom;
}

/** A labeled, directional user-flow arrow. Floating: it anchors to the nearest
 * border of each frame (computed from live node geometry), so the line meets the
 * frame cleanly from whatever direction it approaches instead of always
 * left→right — which keeps connections from slicing across the canvas. */
export function FlowEdge({ id, source, target, markerEnd, data }: EdgeProps) {
	const sourceNode = useInternalNode(source);
	const targetNode = useInternalNode(target);
	if (!sourceNode || !targetNode) return null;

	const sp = nodeIntersection(sourceNode, targetNode);
	const tp = nodeIntersection(targetNode, sourceNode);
	const meta = (data ?? {}) as { kind?: FlowKind; label?: string };
	const kind = meta.kind ?? "primary";
	const [path, labelX, labelY] = getBezierPath({
		sourceX: sp.x,
		sourceY: sp.y,
		sourcePosition: edgeSide(sourceNode, sp),
		targetX: tp.x,
		targetY: tp.y,
		targetPosition: edgeSide(targetNode, tp),
		curvature: 0.3,
	});
	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				markerEnd={markerEnd}
				style={STROKE[kind]}
			/>
			{meta.label ? (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan absolute rounded border border-border bg-card px-1.5 py-0.5 text-foreground text-nano shadow-sm"
						style={{
							transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
						}}
					>
						{meta.label}
					</div>
				</EdgeLabelRenderer>
			) : null}
		</>
	);
}
