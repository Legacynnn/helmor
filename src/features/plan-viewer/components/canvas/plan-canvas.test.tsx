import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanBlock } from "../../mdx/parse";

// Mock React Flow: render each node's title so we can assert without a real canvas.
vi.mock("@xyflow/react", () => ({
	ReactFlow: ({
		nodes,
	}: {
		nodes: Array<{ id: string; data: { title?: string } }>;
	}) => (
		<div data-testid="rf">
			{nodes.map((n) => (
				<span key={n.id}>{n.data.title}</span>
			))}
		</div>
	),
	Background: () => null,
	Controls: () => null,
	MiniMap: () => null,
	Panel: () => null,
	BaseEdge: () => null,
	EdgeLabelRenderer: () => null,
	getBezierPath: () => ["", 0, 0],
	BackgroundVariant: { Dots: "dots" },
	MarkerType: { ArrowClosed: "arrowclosed" },
	Handle: () => null,
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
	useNodesState: (init: unknown) => [init, vi.fn(), vi.fn()],
	useEdgesState: (init: unknown) => [init, vi.fn(), vi.fn()],
	useReactFlow: () => ({ fitView: vi.fn() }),
	useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}));

import PlanCanvasSurface from "./plan-canvas-surface";

function canvasNode(id: string, title: string): PlanBlock {
	return {
		kind: "component",
		id,
		name: "CanvasNode",
		props: { id, title },
		rawText: "",
		childBlocks: [],
	};
}

describe("PlanCanvasSurface", () => {
	it("renders a node per CanvasNode", () => {
		render(
			<PlanCanvasSurface
				childBlocks={[canvasNode("a", "Alpha"), canvasNode("b", "Beta")]}
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
	});

	it("renders nothing when there are no nodes", () => {
		const { container } = render(<PlanCanvasSurface childBlocks={[]} />);
		expect(container.querySelector('[data-testid="rf"]')).toBeNull();
	});
});
