import {
	Background,
	BackgroundVariant,
	Controls,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
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

	const [nodes, , onNodesChange] = useNodesState(graph.nodes);
	const [edges, , onEdgesChange] = useEdgesState(graph.edges);

	if (nodes.length === 0) {
		return null;
	}

	return (
		<div className="my-4 h-[460px] w-full overflow-hidden rounded-xl border border-border bg-background">
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
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}
