import { describe, expect, it } from "vitest";
import { autoLayoutFrames, computeGroupBounds } from "./auto-layout";
import type { FlowEdge, FrameNode, GroupSpec } from "./build-graph";

function frame(id: string, position?: { x: number; y: number }): FrameNode {
	return {
		id,
		frameKind: "note",
		data: {
			title: id,
			frameKind: "note",
			device: "browser",
			theme: "repo",
			accent: "neutral",
			previewCode: "",
			wireframeSource: "",
			bodyBlocks: [],
		},
		position,
		width: 200,
		height: 120,
	};
}

const edge: FlowEdge = {
	id: "a->b",
	source: "a",
	target: "b",
	label: "",
	kind: "primary",
};

describe("autoLayoutFrames", () => {
	it("assigns positions to a fully coordless graph (Dagre fallback)", () => {
		const out = autoLayoutFrames([frame("a"), frame("b")], [edge], "LR");
		expect(out.every((f) => f.position != null)).toBe(true);
		const [a, b] = out;
		expect(a.position).not.toEqual(b.position);
	});

	it("leaves a fully positioned graph untouched", () => {
		const a = frame("a", { x: 10, y: 20 });
		const b = frame("b", { x: 300, y: 20 });
		const out = autoLayoutFrames([a, b], [], "LR");
		expect(out[0].position).toEqual({ x: 10, y: 20 });
		expect(out[1].position).toEqual({ x: 300, y: 20 });
	});

	it("fills only the coordless frames in a mixed graph", () => {
		const a = frame("a", { x: 10, y: 20 });
		const out = autoLayoutFrames([a, frame("b")], [], "LR");
		expect(out[0].position).toEqual({ x: 10, y: 20 });
		expect(out[1].position).toBeDefined();
	});
});

describe("computeGroupBounds", () => {
	it("frames the bounding box of its members", () => {
		const a = frame("a", { x: 0, y: 0 });
		const b = frame("b", { x: 300, y: 100 });
		const group: GroupSpec = {
			id: "g",
			title: "Sec",
			contains: ["a", "b"],
			accent: "info",
		};
		const [bounds] = computeGroupBounds([group], [a, b]);
		// Encloses both members (a at 0,0 and b ending at 500,220) with padding.
		expect(bounds.x).toBeLessThan(0);
		expect(bounds.y).toBeLessThan(0);
		expect(bounds.width).toBeGreaterThan(500);
		expect(bounds.height).toBeGreaterThan(220);
	});

	it("skips a group whose members have no position", () => {
		const group: GroupSpec = {
			id: "g",
			title: "Sec",
			contains: ["ghost"],
			accent: "neutral",
		};
		expect(computeGroupBounds([group], [frame("a")])).toHaveLength(0);
	});
});
