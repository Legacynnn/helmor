import { describe, expect, it } from "vitest";
import type { PlanBlock } from "../../mdx/parse";
import { buildCanvasGraph } from "./build-graph";

function comp(
	name: string,
	props: Record<string, string>,
	rawText = "",
	children: PlanBlock[] = [],
): PlanBlock {
	return {
		kind: "component",
		id: `b-${name}-${props.id ?? ""}`,
		name,
		props,
		rawText,
		childBlocks: children,
	};
}

function node(
	props: Record<string, string>,
	children: PlanBlock[] = [],
): PlanBlock {
	return comp("CanvasNode", props, "", children);
}

describe("buildCanvasGraph", () => {
	it("builds a frame per CanvasNode, carrying title", () => {
		const { frames } = buildCanvasGraph(
			[node({ id: "a", title: "A" }), node({ id: "b", title: "B" })],
			"repo",
		);
		expect(frames.map((f) => f.id)).toEqual(["a", "b"]);
		expect(frames[0].data.title).toBe("A");
	});

	it("honors explicit x/y coordinates and flags hasCoords", () => {
		const { frames, hasCoords } = buildCanvasGraph(
			[node({ id: "a", title: "A", x: "40", y: "80" })],
			"repo",
		);
		expect(frames[0].position).toEqual({ x: 40, y: 80 });
		expect(hasCoords).toBe(true);
	});

	it("leaves position undefined when coords are absent", () => {
		const { frames, hasCoords } = buildCanvasGraph(
			[node({ id: "a", title: "A" })],
			"repo",
		);
		expect(frames[0].position).toBeUndefined();
		expect(hasCoords).toBe(false);
	});

	it("infers a preview frame from a nested Preview and lifts its code", () => {
		const { frames } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }, [
					comp("Preview", {}, "function App() {}"),
				]),
			],
			"repo",
		);
		expect(frames[0].frameKind).toBe("preview");
		expect(frames[0].data.previewCode).toContain("function App()");
	});

	it("infers a wireframe frame from a nested Wireframe and lifts its source", () => {
		const { frames } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }, [
					comp("Wireframe", { surface: "mobile" }, "row\n  button Go"),
				]),
			],
			"repo",
		);
		expect(frames[0].frameKind).toBe("wireframe");
		expect(frames[0].data.wireframeSource).toContain("button Go");
		expect(frames[0].data.device).toBe("mobile");
	});

	it("defaults a bodyless / old-kind node to a note frame", () => {
		const { frames } = buildCanvasGraph(
			[node({ id: "a", title: "A", kind: "resume" })],
			"repo",
		);
		expect(frames[0].frameKind).toBe("note");
	});

	it("propagates the canvas theme onto frame data", () => {
		const { frames } = buildCanvasGraph(
			[node({ id: "a", title: "A" })],
			"wireframe",
		);
		expect(frames[0].data.theme).toBe("wireframe");
	});

	it("builds labeled flow edges from CanvasFlow blocks", () => {
		const { edges } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }),
				node({ id: "b", title: "B" }),
				comp("CanvasFlow", {
					from: "a",
					to: "b",
					label: "Go",
					kind: "primary",
				}),
			],
			"repo",
		);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			source: "a",
			target: "b",
			label: "Go",
			kind: "primary",
		});
	});

	it("keeps back-compat connects as edges", () => {
		const { edges } = buildCanvasGraph(
			[
				node({ id: "a", title: "A", connects: "b,missing" }),
				node({ id: "b", title: "B" }),
			],
			"repo",
		);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ source: "a", target: "b" });
	});

	it("drops self-loops and unknown flow ids", () => {
		const { edges } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }),
				comp("CanvasFlow", { from: "a", to: "a" }),
				comp("CanvasFlow", { from: "a", to: "ghost" }),
			],
			"repo",
		);
		expect(edges).toHaveLength(0);
	});

	it("preserves cycles (user journeys loop)", () => {
		const { edges } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }),
				node({ id: "b", title: "B" }),
				node({ id: "c", title: "C" }),
				comp("CanvasFlow", { from: "a", to: "b" }),
				comp("CanvasFlow", { from: "b", to: "c" }),
				comp("CanvasFlow", { from: "c", to: "a" }),
			],
			"repo",
		);
		expect(edges.map((e) => `${e.source}->${e.target}`)).toEqual([
			"a->b",
			"b->c",
			"c->a",
		]);
	});

	it("builds a group from CanvasGroup, keeping only known member ids", () => {
		const { groups } = buildCanvasGraph(
			[
				node({ id: "a", title: "A" }),
				node({ id: "b", title: "B" }),
				comp("CanvasGroup", { id: "g", title: "Sec", contains: "a,b,ghost" }),
			],
			"repo",
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].contains).toEqual(["a", "b"]);
	});

	it("drops a group whose members are all unknown", () => {
		const { groups } = buildCanvasGraph(
			[comp("CanvasGroup", { id: "g", title: "Sec", contains: "ghost" })],
			"repo",
		);
		expect(groups).toHaveLength(0);
	});

	it("deduplicates frames that share an id", () => {
		const { frames } = buildCanvasGraph(
			[node({ id: "a", title: "First" }), node({ id: "a", title: "Second" })],
			"repo",
		);
		expect(frames).toHaveLength(1);
		expect(frames[0].data.title).toBe("First");
	});
});
