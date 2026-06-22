import { describe, expect, it } from "vitest";
import type { CanvasGraph } from "./build-graph";
import { layoutCanvasGraph } from "./layout";

const graph: CanvasGraph = {
	nodes: [
		{
			id: "a",
			type: "canvasNode",
			data: { title: "A", bodyBlocks: [] },
			position: { x: 0, y: 0 },
		},
		{
			id: "b",
			type: "canvasNode",
			data: { title: "B", bodyBlocks: [] },
			position: { x: 0, y: 0 },
		},
	],
	edges: [{ id: "a->b", source: "a", target: "b" }],
};

describe("layoutCanvasGraph", () => {
	it("assigns distinct positions to connected nodes", () => {
		const out = layoutCanvasGraph(graph, "TB");
		const a = out.nodes.find((n) => n.id === "a");
		const b = out.nodes.find((n) => n.id === "b");
		expect(a && b).toBeTruthy();
		expect((b as { position: { y: number } }).position.y).toBeGreaterThan(
			(a as { position: { y: number } }).position.y,
		);
	});

	it("returns finite coordinates", () => {
		const out = layoutCanvasGraph(graph, "LR");
		for (const n of out.nodes) {
			expect(Number.isFinite(n.position.x)).toBe(true);
			expect(Number.isFinite(n.position.y)).toBe(true);
		}
	});

	it("handles a single node with no edges", () => {
		const out = layoutCanvasGraph({ nodes: [graph.nodes[0]], edges: [] }, "TB");
		expect(out.nodes).toHaveLength(1);
		expect(Number.isFinite(out.nodes[0].position.x)).toBe(true);
	});

	it("spaces a taller node kind further from its successor", () => {
		// A taller source node ("wireframe", h=160) pushes its TB successor lower
		// than a short one ("note", h=96) does — proving layout consults the
		// per-kind size, not a fixed height.
		const make = (sourceKind: "note" | "wireframe"): CanvasGraph => ({
			nodes: [
				{
					id: "a",
					type: "canvasNode",
					data: { title: "A", bodyBlocks: [], kind: sourceKind },
					position: { x: 0, y: 0 },
				},
				{
					id: "b",
					type: "canvasNode",
					data: { title: "B", bodyBlocks: [] },
					position: { x: 0, y: 0 },
				},
			],
			edges: [{ id: "a->b", source: "a", target: "b" }],
		});
		const yOfB = (g: CanvasGraph) =>
			layoutCanvasGraph(g, "TB").nodes.find((n) => n.id === "b")?.position.y ??
			0;
		expect(yOfB(make("wireframe"))).toBeGreaterThan(yOfB(make("note")));
	});
});
