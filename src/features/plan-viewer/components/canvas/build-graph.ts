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
	// Adjacency of edges accepted so far, used to keep the graph acyclic.
	const adjacency = new Map<string, Set<string>>();
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
			// Drop any edge that would close a loop (e.g. the agent wiring the last
			// node back to the first). Cycles force dagre into a long edge sweeping
			// across the whole graph, which reads as clutter — keep it a clean DAG.
			if (canReach(adjacency, target, source)) continue;
			seenEdgeIds.add(id);
			const out = adjacency.get(source) ?? new Set<string>();
			out.add(target);
			adjacency.set(source, out);
			edges.push({ id, source, target });
		}
	}

	return { nodes, edges };
}

/** True when `to` is already reachable from `from` via accepted edges — i.e.
 * adding `from → to` would create a cycle. Iterative DFS over the adjacency. */
function canReach(
	adjacency: Map<string, Set<string>>,
	from: string,
	to: string,
): boolean {
	const stack = [from];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) continue;
		if (current === to) return true;
		if (seen.has(current)) continue;
		seen.add(current);
		const next = adjacency.get(current);
		if (next) {
			for (const node of next) stack.push(node);
		}
	}
	return false;
}
