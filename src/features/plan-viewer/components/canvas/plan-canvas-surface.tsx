import {
	Background,
	BackgroundVariant,
	Controls,
	MarkerType,
	MiniMap,
	ReactFlow,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type CSSProperties, useEffect, useMemo } from "react";
import type { PlanBlock } from "../../mdx/parse";
import {
	autoLayoutFrames,
	computeGroupBounds,
	parseDirection,
} from "./auto-layout";
import { buildCanvasGraph } from "./build-graph";
import { DesignToolbar } from "./design-toolbar";
import { FlowEdge } from "./flow-edge";
import type { FrameKind } from "./frame-kinds";
import { GroupNode } from "./frames/group-node";
import { NoteFrame } from "./frames/note-frame";
import { PreviewFrame } from "./frames/preview-frame";
import { WireframeFrame } from "./frames/wireframe-frame";
import { normalizeTheme } from "./theme-modes";

const nodeTypes = {
	previewFrame: PreviewFrame,
	wireframeFrame: WireframeFrame,
	noteFrame: NoteFrame,
	// NOT "group": React Flow ships default grey fill + border CSS for the
	// reserved `group` type (`.react-flow__node-group`). A custom name avoids it
	// so only our faint dashed outline shows.
	sectionGroup: GroupNode,
};
const edgeTypes = { flow: FlowEdge };

/** Frame kind → registered React Flow node type. */
const NODE_TYPE: Record<FrameKind, string> = {
	preview: "previewFrame",
	wireframe: "wireframeFrame",
	note: "noteFrame",
	screen: "noteFrame",
};

const CONTROLS_STYLE = {
	"--xy-controls-button-background-color": "var(--card)",
	"--xy-controls-button-background-color-hover": "var(--accent)",
	"--xy-controls-button-color": "var(--foreground)",
	"--xy-controls-button-color-hover": "var(--accent-foreground)",
	"--xy-controls-button-border-color": "var(--border)",
} as CSSProperties;

export type PlanCanvasSurfaceProps = {
	childBlocks: PlanBlock[];
	direction?: string;
	theme?: string;
	height?: string;
};

/** Re-fit the viewport whenever the authored graph changes (e.g. the agent
 * edits the plan and the watcher pushes a fresh parse). */
function FitView({ dep }: { dep: unknown }) {
	const { fitView } = useReactFlow();
	useEffect(() => {
		fitView({ padding: 0.2 });
	}, [dep, fitView]);
	return null;
}

function parseHeight(value: string | undefined): number {
	const n = value ? Number.parseFloat(value) : Number.NaN;
	if (!Number.isFinite(n)) return 720;
	return Math.max(360, Math.min(1600, n));
}

export default function PlanCanvasSurface({
	childBlocks,
	direction,
	theme: themeProp,
	height,
}: PlanCanvasSurfaceProps) {
	const theme = normalizeTheme(themeProp);
	const graph = useMemo(() => {
		const built = buildCanvasGraph(childBlocks, theme);
		const positioned = autoLayoutFrames(
			built.frames,
			built.edges,
			parseDirection(direction),
		);
		const groups = computeGroupBounds(built.groups, positioned);

		const groupNodes = groups.map((g) => ({
			id: `group-${g.spec.id}`,
			type: "sectionGroup",
			position: { x: g.x, y: g.y },
			width: g.width,
			height: g.height,
			data: { title: g.spec.title, accent: g.spec.accent, theme },
			// Neutralize any base node chrome so only the component's outline shows.
			style: { background: "transparent", border: "none", padding: 0 },
			selectable: false,
			draggable: false,
			zIndex: 0,
		}));
		const frameNodes = positioned.map((f) => ({
			id: f.id,
			type: NODE_TYPE[f.frameKind],
			position: f.position ?? { x: 0, y: 0 },
			width: f.width,
			height: f.height,
			data: f.data,
			zIndex: 1,
		}));
		const edges = built.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			type: "flow",
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color:
					e.kind === "primary" ? "var(--primary)" : "var(--muted-foreground)",
			},
			data: { kind: e.kind, label: e.label },
		}));
		// Group backgrounds first so they paint behind the frames.
		return { nodes: [...groupNodes, ...frameNodes], edges };
	}, [childBlocks, direction, theme]);

	const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

	// Re-seed when the authored graph changes (ephemeral drags reset to authored).
	useEffect(() => {
		setNodes(graph.nodes);
		setEdges(graph.edges);
	}, [graph, setNodes, setEdges]);

	if (nodes.length === 0) {
		return null;
	}

	return (
		<div
			className="w-full overflow-hidden border-border border-b bg-background"
			style={{ height: parseHeight(height) }}
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				minZoom={0.2}
				maxZoom={1.5}
				proOptions={{ hideAttribution: true }}
				nodesConnectable={false}
				edgesFocusable={false}
				// Keep off-screen frames from mounting their live preview iframe until
				// they scroll into view — lets every preview run live without paying
				// for all of them at once.
				onlyRenderVisibleElements
			>
				<Background variant={BackgroundVariant.Dots} gap={22} size={1} />
				<MiniMap
					pannable
					zoomable
					// Small + theme-matched. Sized via Tailwind; panel bg follows --card;
					// the out-of-view mask is a plain translucent black so it reads as a
					// dimmed canvas on the dark theme rather than RF's default bright-grey
					// patch. Values kept to rgba / CSS vars that WebKit accepts as fills.
					className="!h-[92px] !w-[132px] overflow-hidden !rounded-md border border-border !bg-card"
					maskColor="rgba(0, 0, 0, 0.55)"
					nodeColor="var(--muted-foreground)"
					nodeStrokeColor="var(--border)"
				/>
				<Controls showInteractive={false} style={CONTROLS_STYLE} />
				<DesignToolbar theme={theme} />
				<FitView dep={graph} />
			</ReactFlow>
		</div>
	);
}
