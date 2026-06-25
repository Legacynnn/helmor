import { describe, expect, it } from "vitest";
import {
	closeLeaf,
	collectLeaves,
	insertLeaf,
	leafCount,
	MAX_LEAVES,
	makeLeaf,
	moveLeaf,
	type PaneNode,
	type PaneSplit,
	resizeSplit,
	splitLeaf,
} from "./tree-model";

const leaf = (sessionId: string): PaneNode => makeLeaf(sessionId);

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object") {
		Object.freeze(value);
		for (const key of Object.keys(value as object)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}

describe("makeLeaf", () => {
	it("creates a leaf node with a derived pane id", () => {
		const node = makeLeaf("session-a");
		expect(node).toEqual({
			type: "leaf",
			paneId: "pane-session-a",
			sessionId: "session-a",
		});
	});

	it("accepts an explicit pane id", () => {
		expect(makeLeaf("session-a", "p1").paneId).toBe("p1");
	});
});

describe("leafCount / collectLeaves", () => {
	it("counts a single leaf as one", () => {
		expect(leafCount(leaf("a"))).toBe(1);
	});

	it("counts all leaves across nested splits", () => {
		const tree: PaneSplit = {
			type: "split",
			direction: "row",
			children: [
				leaf("a"),
				{
					type: "split",
					direction: "col",
					children: [leaf("b"), leaf("c")],
					sizes: [0.5, 0.5],
				},
			],
			sizes: [0.5, 0.5],
		};
		expect(leafCount(tree)).toBe(3);
		expect(collectLeaves(tree).map((l) => l.sessionId)).toEqual([
			"a",
			"b",
			"c",
		]);
	});
});

describe("splitLeaf", () => {
	it("splits a single leaf into a row of two leaves", () => {
		const result = splitLeaf(leaf("a"), "pane-a", "row", "b");
		expect(result).toEqual({
			type: "split",
			direction: "row",
			children: [leaf("a"), leaf("b")],
			sizes: [0.5, 0.5],
		});
	});

	it("splits into a column when direction is col", () => {
		const result = splitLeaf(leaf("a"), "pane-a", "col", "b") as PaneSplit;
		expect(result.direction).toBe("col");
	});

	it("splits a nested leaf in place", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b") as PaneSplit;
		const result = splitLeaf(tree, "pane-b", "col", "c") as PaneSplit;
		expect(leafCount(result)).toBe(3);
		// 'a' untouched, 'b' replaced by a col split [b, c]
		expect(result.children[0]).toEqual(leaf("a"));
		expect(result.children[1]).toMatchObject({
			type: "split",
			direction: "col",
		});
	});

	it("is a no-op when the leaf cap is reached", () => {
		let tree: PaneNode = leaf("a");
		tree = splitLeaf(tree, "pane-a", "row", "b");
		tree = splitLeaf(tree, "pane-b", "row", "c");
		tree = splitLeaf(tree, "pane-c", "row", "d");
		expect(leafCount(tree)).toBe(MAX_LEAVES);
		const blocked = splitLeaf(tree, "pane-a", "row", "e");
		expect(leafCount(blocked)).toBe(MAX_LEAVES);
		expect(blocked).toBe(tree);
	});

	it("does not mutate the input tree", () => {
		const input = deepFreeze(leaf("a"));
		expect(() => splitLeaf(input, "pane-a", "row", "b")).not.toThrow();
	});
});

describe("closeLeaf", () => {
	it("collapses a single-child split back to a bare leaf", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		const result = closeLeaf(tree, "pane-b");
		expect(result).toEqual(leaf("a"));
	});

	it("returns null when the last remaining leaf is closed", () => {
		expect(closeLeaf(leaf("a"), "pane-a")).toBeNull();
	});

	it("removes a deeply nested leaf and collapses the orphaned split", () => {
		let tree: PaneNode = leaf("a");
		tree = splitLeaf(tree, "pane-a", "row", "b");
		tree = splitLeaf(tree, "pane-b", "col", "c");
		// tree = row[a, col[b, c]]; closing c collapses col → leaf b
		const result = closeLeaf(tree, "pane-c") as PaneSplit;
		expect(result.children).toEqual([leaf("a"), leaf("b")]);
	});

	it("is a no-op for an unknown pane id", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		expect(closeLeaf(tree, "pane-missing")).toBe(tree);
	});
});

describe("resizeSplit", () => {
	it("replaces the sizes of the split at the given path", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b") as PaneSplit;
		const result = resizeSplit(tree, [], [0.3, 0.7]) as PaneSplit;
		expect(result.sizes).toEqual([0.3, 0.7]);
		expect(result.children).toEqual(tree.children);
	});

	it("resizes a nested split addressed by child index path", () => {
		let tree: PaneNode = leaf("a");
		tree = splitLeaf(tree, "pane-a", "row", "b");
		tree = splitLeaf(tree, "pane-b", "col", "c");
		// tree = row[a, col[b, c]]; nested split is at child index [1]
		const result = resizeSplit(tree, [1], [0.2, 0.8]) as PaneSplit;
		expect((result.children[1] as PaneSplit).sizes).toEqual([0.2, 0.8]);
		expect(result.sizes).toEqual([0.5, 0.5]);
	});
});

describe("moveLeaf", () => {
	it("moves a leaf next to a target on the right edge (row, after)", () => {
		// start: row[a, b]; move a to the right of b → row[b, a]
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		const result = moveLeaf(tree, "pane-a", "pane-b", "right") as PaneSplit;
		expect(collectLeaves(result).map((l) => l.sessionId)).toEqual(["b", "a"]);
	});

	it("moves a leaf to the left edge (row, before)", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		const result = moveLeaf(tree, "pane-b", "pane-a", "left") as PaneSplit;
		expect(collectLeaves(result).map((l) => l.sessionId)).toEqual(["b", "a"]);
	});

	it("moves a leaf to the bottom edge as a column split", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		const result = moveLeaf(tree, "pane-a", "pane-b", "bottom") as PaneSplit;
		// 'a' removed from row (row collapses to leaf b), then b split col[b, a]
		expect(result.direction).toBe("col");
		expect(collectLeaves(result).map((l) => l.sessionId)).toEqual(["b", "a"]);
	});

	it("is a no-op when source and target are the same pane", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		expect(moveLeaf(tree, "pane-a", "pane-a", "right")).toBe(tree);
	});
});

describe("insertLeaf", () => {
	it("inserts a NEW session leaf to the right of a single leaf", () => {
		const result = insertLeaf(leaf("a"), "b", "pane-a", "right") as PaneSplit;
		expect(result.direction).toBe("row");
		expect(collectLeaves(result).map((l) => l.sessionId)).toEqual(["a", "b"]);
	});

	it("inserts to the left/top as the first child", () => {
		const right = insertLeaf(leaf("a"), "b", "pane-a", "left") as PaneSplit;
		expect(collectLeaves(right).map((l) => l.sessionId)).toEqual(["b", "a"]);
		const top = insertLeaf(leaf("a"), "b", "pane-a", "top") as PaneSplit;
		expect(top.direction).toBe("col");
		expect(collectLeaves(top).map((l) => l.sessionId)).toEqual(["b", "a"]);
	});

	it("inserts adjacent to a nested target leaf", () => {
		const tree = splitLeaf(leaf("a"), "pane-a", "row", "b");
		const result = insertLeaf(tree, "c", "pane-b", "bottom") as PaneSplit;
		expect(leafCount(result)).toBe(3);
		expect(collectLeaves(result).map((l) => l.sessionId)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("is a no-op when the leaf cap is reached", () => {
		let tree: PaneNode = leaf("a");
		tree = splitLeaf(tree, "pane-a", "row", "b");
		tree = splitLeaf(tree, "pane-b", "row", "c");
		tree = splitLeaf(tree, "pane-c", "row", "d");
		expect(insertLeaf(tree, "e", "pane-a", "right")).toBe(tree);
	});

	it("is a no-op for an unknown target pane", () => {
		const input = leaf("a");
		expect(insertLeaf(input, "b", "pane-missing", "right")).toBe(input);
	});
});
