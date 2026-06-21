import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanBlock } from "../../mdx/parse";

// Mock React Flow: render each node's title so we can assert without a real canvas.
vi.mock("@xyflow/react", () => ({
	ReactFlow: ({
		nodes,
	}: {
		nodes: Array<{ id: string; data: { title: string } }>;
	}) => (
		<div data-testid="rf">
			{nodes.map((n) => (
				<span key={n.id}>{n.data.title}</span>
			))}
		</div>
	),
	Background: () => null,
	Controls: () => null,
	BackgroundVariant: { Dots: "dots" },
	Handle: () => null,
	Position: { Top: "top", Bottom: "bottom" },
	useNodesState: (init: unknown) => [init, vi.fn(), vi.fn()],
	useEdgesState: (init: unknown) => [init, vi.fn(), vi.fn()],
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
