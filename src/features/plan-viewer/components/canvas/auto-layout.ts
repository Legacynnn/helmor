import dagre from "@dagrejs/dagre";
import type { CanvasGraph, FrameNode, GroupSpec } from "./build-graph";

/** Auto-layout direction, from `<PlanCanvas direction="…">` (legacy coordless). */
export type CanvasDirection = "TB" | "LR";

export function parseDirection(value: string | undefined): CanvasDirection {
	return value === "LR" ? "LR" : "TB";
}

const GROUP_PADDING = 36;
const GROUP_HEADER = 26;
const STACK_GAP = 72;

/** Run Dagre over every frame, sizing each by its own width/height. Cycles are
 * tolerated (Dagre breaks them internally) so user journeys can loop. */
function dagreLayout(
	frames: FrameNode[],
	edges: CanvasGraph["edges"],
	direction: CanvasDirection,
): FrameNode[] {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: direction, nodesep: 110, ranksep: 160 });
	g.setDefaultEdgeLabel(() => ({}));
	for (const frame of frames) {
		g.setNode(frame.id, { width: frame.width, height: frame.height });
	}
	for (const edge of edges) {
		g.setEdge(edge.source, edge.target);
	}
	dagre.layout(g);
	return frames.map((frame) => {
		const pos = g.node(frame.id);
		// Dagre returns the node center; React Flow wants the top-left corner.
		return {
			...frame,
			position: { x: pos.x - frame.width / 2, y: pos.y - frame.height / 2 },
		};
	});
}

/** Bounding box of frames that already have a position. */
function boundsOf(frames: FrameNode[]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const f of frames) {
		if (!f.position) continue;
		minX = Math.min(minX, f.position.x);
		minY = Math.min(minY, f.position.y);
		maxX = Math.max(maxX, f.position.x + f.width);
		maxY = Math.max(maxY, f.position.y + f.height);
	}
	return { minX, minY, maxX, maxY };
}

/**
 * Ensure every frame has a position.
 * - Fully coordless graph (old `connects=` plans): Dagre-layout everything.
 * - Fully positioned graph (new freeform plans): return as-is.
 * - Mixed: honor authored coords, stack the coordless frames in a column just
 *   right of the positioned cluster so nothing overlaps.
 */
export function autoLayoutFrames(
	frames: FrameNode[],
	edges: CanvasGraph["edges"],
	direction: CanvasDirection,
): FrameNode[] {
	const missing = frames.filter((f) => !f.position);
	if (missing.length === 0) return frames;
	if (missing.length === frames.length) {
		return dagreLayout(frames, edges, direction);
	}
	const { maxX, minY } = boundsOf(frames);
	const startX = Number.isFinite(maxX) ? maxX + STACK_GAP : 0;
	let cursorY = Number.isFinite(minY) ? minY : 0;
	return frames.map((frame) => {
		if (frame.position) return frame;
		const position = { x: startX, y: cursorY };
		cursorY += frame.height + STACK_GAP;
		return { ...frame, position };
	});
}

export type GroupBounds = {
	spec: GroupSpec;
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Compute each group's background rectangle from its member frames' positions
 * (run AFTER {@link autoLayoutFrames} so every member has a position). Padding
 * leaves room for the group's title strip above its members.
 */
export function computeGroupBounds(
	groups: GroupSpec[],
	frames: FrameNode[],
): GroupBounds[] {
	const byId = new Map(frames.map((f) => [f.id, f]));
	const out: GroupBounds[] = [];
	for (const spec of groups) {
		const members = spec.contains
			.map((id) => byId.get(id))
			.filter((f): f is FrameNode => f != null && f.position != null);
		if (members.length === 0) continue;
		const { minX, minY, maxX, maxY } = boundsOf(members);
		out.push({
			spec,
			x: minX - GROUP_PADDING,
			y: minY - GROUP_PADDING - GROUP_HEADER,
			width: maxX - minX + GROUP_PADDING * 2,
			height: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
		});
	}
	return out;
}
