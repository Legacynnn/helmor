import dagre from "@dagrejs/dagre";
import type { CanvasGraph } from "./build-graph";
import { NODE_SIZE, normalizeKind } from "./node-kinds";

export type CanvasDirection = "TB" | "LR";

/** Position every node with dagre, sizing each by its kind. Pure: returns a new
 * graph; input untouched. */
export function layoutCanvasGraph(
	graph: CanvasGraph,
	direction: CanvasDirection,
): CanvasGraph {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 64 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of graph.nodes) {
		const size = NODE_SIZE[normalizeKind(node.data.kind)];
		g.setNode(node.id, { width: size.width, height: size.height });
	}
	for (const edge of graph.edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const nodes = graph.nodes.map((node) => {
		const pos = g.node(node.id);
		const size = NODE_SIZE[normalizeKind(node.data.kind)];
		// dagre returns the node center; React Flow wants the top-left corner.
		return {
			...node,
			position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
		};
	});

	return { nodes, edges: graph.edges };
}

export function parseDirection(value: string | undefined): CanvasDirection {
	return value === "LR" ? "LR" : "TB";
}
