import { describe, expect, it } from "vitest";
import {
	canvasStorageKey,
	deserializeCanvas,
	ensureFocused,
	serializeCanvas,
	singleLeafCanvas,
} from "./canvas-persistence";
import { makeLeaf, splitLeaf } from "./tree-model";

describe("canvasStorageKey", () => {
	it("namespaces the key by workspace id", () => {
		expect(canvasStorageKey("ws-1")).toBe("helmor.workspaceCanvas:ws-1");
	});
});

describe("singleLeafCanvas", () => {
	it("wraps a session in a one-leaf canvas focused on that leaf", () => {
		const canvas = singleLeafCanvas("s1");
		expect(canvas.root).toEqual(makeLeaf("s1"));
		expect(canvas.focusedPaneId).toBe("pane-s1");
	});
});

describe("serialize / deserialize round-trip", () => {
	it("restores a multi-leaf canvas", () => {
		const canvas = {
			root: splitLeaf(makeLeaf("a"), "pane-a", "row", "b"),
			focusedPaneId: "pane-b",
		};
		const restored = deserializeCanvas(serializeCanvas(canvas));
		expect(restored).toEqual(canvas);
	});

	it("returns null for null/garbage input", () => {
		expect(deserializeCanvas(null)).toBeNull();
		expect(deserializeCanvas("not json")).toBeNull();
		expect(deserializeCanvas("{}")).toBeNull();
		expect(deserializeCanvas('{"root":{"type":"leaf"}}')).toBeNull();
	});

	it("rejects a tree whose split is structurally invalid", () => {
		const bad = JSON.stringify({
			root: { type: "split", direction: "row", children: [], sizes: [] },
			focusedPaneId: "x",
		});
		expect(deserializeCanvas(bad)).toBeNull();
	});

	it("rejects a focusedPaneId that is not present in the tree", () => {
		const bad = JSON.stringify({
			root: makeLeaf("a"),
			focusedPaneId: "pane-missing",
		});
		expect(deserializeCanvas(bad)).toBeNull();
	});
});

describe("ensureFocused", () => {
	it("keeps a valid focus untouched", () => {
		const canvas = singleLeafCanvas("a");
		expect(ensureFocused(canvas)).toBe(canvas);
	});

	it("repoints focus to the first leaf when the focused pane is gone", () => {
		const canvas = {
			root: splitLeaf(makeLeaf("a"), "pane-a", "row", "b"),
			focusedPaneId: "pane-gone",
		};
		expect(ensureFocused(canvas).focusedPaneId).toBe("pane-a");
	});
});
