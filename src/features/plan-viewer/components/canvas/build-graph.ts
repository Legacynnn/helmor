import type { PlanBlock } from "../../mdx/parse";
import { type CanvasNodeKind, normalizeKind } from "./node-kinds";

/** Data carried on each React Flow node (rendered by canvas-node.tsx). */
export type CanvasNodeData = {
	title: string;
	bodyBlocks: PlanBlock[];
	/** Optional only because nodes may be constructed outside `buildCanvasGraph`
	 * (e.g. test fixtures); `buildCanvasGraph` always resolves it via
	 * `normalizeKind`. Consumers should default a missing value to "note". */
	kind?: CanvasNodeKind;
};

export type CanvasGraphNode = {
	id: string;
	type: "canvasNode";
	data: CanvasNodeData;
	position: { x: number; y: number };
};

export type CanvasGraphEdge = {
	id: string;
	source: string;
	target: string;
};

export type CanvasGraph = {
	nodes: CanvasGraphNode[];
	edges: CanvasGraphEdge[];
};

function splitConnects(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Convert a PlanCanvas component's child blocks into a React Flow graph.
 * Only `CanvasNode` component blocks become nodes; everything else is ignored.
 * Positions are all `{0,0}` here — `layout.ts` assigns real coordinates.
 */
export function buildCanvasGraph(childBlocks: PlanBlock[]): CanvasGraph {
	const nodes: CanvasGraphNode[] = [];
	const ids = new Set<string>();

	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasNode") {
			continue;
		}
		const id = block.props.id?.trim() || block.id;
		if (ids.has(id)) continue;
		ids.add(id);
		nodes.push({
			id,
			type: "canvasNode",
			data: {
				title: block.props.title?.trim() || id,
				bodyBlocks: block.childBlocks,
				kind: normalizeKind(block.props.kind),
			},
			position: { x: 0, y: 0 },
		});
	}

	const edges: CanvasGraphEdge[] = [];
	const seenEdgeIds = new Set<string>();
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasNode") {
			continue;
		}
		const source = block.props.id?.trim() || block.id;
		for (const target of splitConnects(block.props.connects)) {
			if (!ids.has(target)) continue; // drop dangling edges
			if (target === source) continue; // drop self-loops (degenerate layout)
			const id = `${source}->${target}`;
			if (seenEdgeIds.has(id)) continue; // dedupe repeated targets (e.g. "b,b")
			seenEdgeIds.add(id);
			edges.push({ id, source, target });
		}
	}

	return { nodes, edges };
}
