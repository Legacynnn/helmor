import dagre from "@dagrejs/dagre";
import type { CanvasGraph } from "./build-graph";

/** Nominal node size used for layout spacing (actual nodes size to content). */
const NODE_W = 220;
const NODE_H = 96;

export type CanvasDirection = "TB" | "LR";

/** Position every node with dagre. Pure: returns a new graph; input untouched. */
export function layoutCanvasGraph(
	graph: CanvasGraph,
	direction: CanvasDirection,
): CanvasGraph {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 64 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of graph.nodes) {
		g.setNode(node.id, { width: NODE_W, height: NODE_H });
	}
	for (const edge of graph.edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const nodes = graph.nodes.map((node) => {
		const pos = g.node(node.id);
		// dagre returns the node center; React Flow wants the top-left corner.
		return {
			...node,
			position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
		};
	});

	return { nodes, edges: graph.edges };
}

export function parseDirection(value: string | undefined): CanvasDirection {
	return value === "LR" ? "LR" : "TB";
}
