import {
	Background,
	BackgroundVariant,
	Controls,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type CSSProperties, useEffect, useMemo } from "react";
import type { PlanBlock } from "../../mdx/parse";
import { buildCanvasGraph } from "./build-graph";
import { CanvasNode } from "./canvas-node";
import { layoutCanvasGraph, parseDirection } from "./layout";

const nodeTypes = { canvasNode: CanvasNode };

export type PlanCanvasSurfaceProps = {
	childBlocks: PlanBlock[];
	direction?: string;
};

export default function PlanCanvasSurface({
	childBlocks,
	direction,
}: PlanCanvasSurfaceProps) {
	const graph = useMemo(() => {
		const built = buildCanvasGraph(childBlocks);
		return layoutCanvasGraph(built, parseDirection(direction));
	}, [childBlocks, direction]);

	const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

	// `useNodesState`/`useEdgesState` only seed initial state, so re-sync when the
	// authored graph changes (e.g. the agent edits the plan and the watcher pushes
	// a fresh parse, or content streams in). Ephemeral user drags are intentionally
	// reset to the authored layout on such updates.
	useEffect(() => {
		setNodes(graph.nodes);
		setEdges(graph.edges);
	}, [graph, setNodes, setEdges]);

	if (nodes.length === 0) {
		return null;
	}

	return (
		<div className="h-[460px] w-full overflow-hidden border-border border-b bg-background">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				minZoom={0.2}
				maxZoom={1.5}
				proOptions={{ hideAttribution: true }}
				nodesConnectable={false}
				edgesFocusable={false}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
				<Controls
					showInteractive={false}
					// Theme React Flow's default light-on-white control buttons with
					// Helmor tokens (icon uses `fill: currentColor`, driven by `color`).
					style={
						{
							"--xy-controls-button-background-color": "var(--card)",
							"--xy-controls-button-background-color-hover": "var(--accent)",
							"--xy-controls-button-color": "var(--foreground)",
							"--xy-controls-button-color-hover": "var(--accent-foreground)",
							"--xy-controls-button-border-color": "var(--border)",
						} as CSSProperties
					}
				/>
			</ReactFlow>
		</div>
	);
}
