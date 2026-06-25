// Pure pane-tree model for the split-canvas center column. No React, no DOM —
// fully unit-testable. A canvas is a recursive tree whose leaves each host one
// conversation session and whose splits arrange children in a row (side by
// side) or a column (stacked). Every op returns a NEW tree (or the same
// reference when it would be a no-op) and never mutates its input.

/** A leaf hosts exactly one conversation session. */
export type PaneLeaf = {
	type: "leaf";
	paneId: string;
	sessionId: string;
};

/** A split arranges its children horizontally (`row`) or vertically (`col`). */
export type PaneSplit = {
	type: "split";
	direction: "row" | "col";
	children: PaneNode[];
	/** Fractional sizes, one per child, summing to ~1. */
	sizes: number[];
};

export type PaneNode = PaneLeaf | PaneSplit;

/** Drag-to-split target edge of a leaf. */
export type DropEdge = "left" | "right" | "top" | "bottom";

/** Hard cap on simultaneously-open conversation panes in one canvas. */
export const MAX_LEAVES = 4;

/** Build a leaf, deriving a stable pane id from the session id by default. */
export function makeLeaf(sessionId: string, paneId?: string): PaneLeaf {
	return { type: "leaf", paneId: paneId ?? `pane-${sessionId}`, sessionId };
}

export function leafCount(node: PaneNode): number {
	if (node.type === "leaf") {
		return 1;
	}
	return node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
	if (node.type === "leaf") {
		return [node];
	}
	return node.children.flatMap(collectLeaves);
}

function evenSizes(count: number): number[] {
	return Array.from({ length: count }, () => 1 / count);
}

/**
 * Replace the leaf identified by `paneId` with a split that contains the
 * original leaf plus a freshly-created leaf for `newSessionId`. No-op (returns
 * the same reference) when the cap is reached or the pane id is absent.
 */
export function splitLeaf(
	root: PaneNode,
	paneId: string,
	direction: "row" | "col",
	newSessionId: string,
	newPaneId?: string,
): PaneNode {
	if (leafCount(root) >= MAX_LEAVES) {
		return root;
	}

	let replaced = false;
	const next = mapLeaf(root, paneId, (leaf) => {
		replaced = true;
		const fresh = makeLeaf(newSessionId, newPaneId);
		return {
			type: "split",
			direction,
			children: [leaf, fresh],
			sizes: evenSizes(2),
		};
	});

	return replaced ? next : root;
}

/**
 * Remove the leaf identified by `paneId`. Splits left with a single child
 * collapse into that child. Returns `null` when the very last leaf is closed,
 * or the same reference when the pane id is absent.
 */
export function closeLeaf(root: PaneNode, paneId: string): PaneNode | null {
	if (root.type === "leaf") {
		return root.paneId === paneId ? null : root;
	}

	let changed = false;
	const children: PaneNode[] = [];
	const sizes: number[] = [];
	root.children.forEach((child, index) => {
		const pruned = closeLeaf(child, paneId);
		if (pruned === null) {
			changed = true;
			return;
		}
		if (pruned !== child) {
			changed = true;
		}
		children.push(pruned);
		sizes.push(root.sizes[index] ?? 1 / root.children.length);
	});

	if (!changed) {
		return root;
	}

	if (children.length === 1) {
		return children[0];
	}

	return { ...root, children, sizes: normalize(sizes) };
}

/**
 * Replace the `sizes` of the split addressed by `path` (a sequence of child
 * indices from the root). An empty path targets the root split.
 */
export function resizeSplit(
	root: PaneNode,
	path: number[],
	sizes: number[],
): PaneNode {
	if (path.length === 0) {
		if (root.type !== "split") {
			return root;
		}
		return { ...root, sizes };
	}

	if (root.type !== "split") {
		return root;
	}

	const [index, ...rest] = path;
	const target = root.children[index];
	if (!target) {
		return root;
	}

	const updated = resizeSplit(target, rest, sizes);
	if (updated === target) {
		return root;
	}

	const children = root.children.slice();
	children[index] = updated;
	return { ...root, children };
}

/**
 * Drag-to-split: detach the leaf `paneId` and re-insert it adjacent to
 * `targetPaneId` on the given `edge`. `left`/`right` produce a row split,
 * `top`/`bottom` a column split; `left`/`top` place the moved leaf first.
 */
export function moveLeaf(
	root: PaneNode,
	paneId: string,
	targetPaneId: string,
	edge: DropEdge,
): PaneNode {
	if (paneId === targetPaneId) {
		return root;
	}

	const moving = findLeaf(root, paneId);
	if (!moving) {
		return root;
	}

	const detached = closeLeaf(root, paneId);
	if (detached === null) {
		return root;
	}

	return insertAdjacent(detached, moving, targetPaneId, edge) ?? root;
}

/**
 * Drop-to-add: insert a freshly-created leaf for `newSessionId` adjacent to
 * `targetPaneId` on the given `edge`. Used when dragging a session that is NOT
 * yet in the canvas onto a pane. No-op (same reference) if the cap is reached
 * or the target is absent.
 */
export function insertLeaf(
	root: PaneNode,
	newSessionId: string,
	targetPaneId: string,
	edge: DropEdge,
	newPaneId?: string,
): PaneNode {
	if (leafCount(root) >= MAX_LEAVES) {
		return root;
	}
	const fresh = makeLeaf(newSessionId, newPaneId);
	return insertAdjacent(root, fresh, targetPaneId, edge) ?? root;
}

// --- internals -----------------------------------------------------------

/** Insert `leaf` next to `targetPaneId` at `edge`. Returns null on no match. */
function insertAdjacent(
	root: PaneNode,
	leaf: PaneNode,
	targetPaneId: string,
	edge: DropEdge,
): PaneNode | null {
	const direction: "row" | "col" =
		edge === "left" || edge === "right" ? "row" : "col";
	const before = edge === "left" || edge === "top";

	let inserted = false;
	const next = mapLeaf(root, targetPaneId, (target) => {
		inserted = true;
		const children = before ? [leaf, target] : [target, leaf];
		return { type: "split", direction, children, sizes: evenSizes(2) };
	});

	return inserted ? next : null;
}

function mapLeaf(
	node: PaneNode,
	paneId: string,
	fn: (leaf: PaneLeaf) => PaneNode,
): PaneNode {
	if (node.type === "leaf") {
		return node.paneId === paneId ? fn(node) : node;
	}

	let changed = false;
	const children = node.children.map((child) => {
		const updated = mapLeaf(child, paneId, fn);
		if (updated !== child) {
			changed = true;
		}
		return updated;
	});

	return changed ? { ...node, children } : node;
}

function findLeaf(node: PaneNode, paneId: string): PaneLeaf | null {
	if (node.type === "leaf") {
		return node.paneId === paneId ? node : null;
	}
	for (const child of node.children) {
		const found = findLeaf(child, paneId);
		if (found) {
			return found;
		}
	}
	return null;
}

function normalize(sizes: number[]): number[] {
	const total = sizes.reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		return evenSizes(sizes.length);
	}
	return sizes.map((value) => value / total);
}
