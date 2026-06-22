import { describe, expect, it } from "vitest";
import type { PlanBlock } from "../../mdx/parse";
import { buildCanvasGraph } from "./build-graph";

function node(
	id: string,
	props: Record<string, string>,
	children: PlanBlock[] = [],
): PlanBlock {
	return {
		kind: "component",
		id,
		name: "CanvasNode",
		props,
		rawText: "",
		childBlocks: children,
	};
}

describe("buildCanvasGraph", () => {
	it("builds nodes from CanvasNode blocks", () => {
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "A" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
		expect(nodes[0].data.title).toBe("A");
	});

	it("builds edges from connects and drops dangling targets", () => {
		const { edges } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", connects: "b, missing" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ source: "a", target: "b" });
	});

	it("synthesizes an id from the block id when id prop is absent", () => {
		const { nodes } = buildCanvasGraph([node("b7", { title: "No id" })]);
		expect(nodes[0].id).toBe("b7");
	});

	it("ignores non-CanvasNode child blocks", () => {
		const { nodes } = buildCanvasGraph([
			{ kind: "prose", id: "p0", markdown: "stray" },
			node("b0", { id: "a", title: "A" }),
		]);
		expect(nodes.map((n) => n.id)).toEqual(["a"]);
	});

	it("carries the node body blocks for rendering", () => {
		const body: PlanBlock = { kind: "prose", id: "p", markdown: "hi" };
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "A" }, [body]),
		]);
		expect(nodes[0].data.bodyBlocks).toEqual([body]);
	});

	it("deduplicates nodes that share an id", () => {
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "First" }),
			node("b1", { id: "a", title: "Second" }),
		]);
		expect(nodes).toHaveLength(1);
		expect(nodes[0].data.title).toBe("First");
	});

	it("deduplicates repeated edge targets", () => {
		const { edges } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", connects: "b,b" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(edges).toHaveLength(1);
	});

	it("drops self-loop edges", () => {
		const { edges } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", connects: "a" }),
		]);
		expect(edges).toHaveLength(0);
	});

	it("carries the node kind from props, defaulting to note", () => {
		const { nodes } = buildCanvasGraph([
			node("b0", { id: "a", title: "A", kind: "resume" }),
			node("b1", { id: "b", title: "B" }),
		]);
		expect(nodes[0].data.kind).toBe("resume");
		expect(nodes[1].data.kind).toBe("note");
	});
});
