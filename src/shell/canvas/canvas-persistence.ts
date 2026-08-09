// Pure (de)serialization + validation for a workspace canvas. Kept free of
// React so the round-trip + structural validation are unit-testable; the
// `useCanvasState` hook layers localStorage + reducers on top.

import {
	collectLeaves,
	makeLeaf,
	type PaneNode,
	type PaneSplit,
} from "./tree-model";

/** A persisted canvas: the pane tree plus which leaf is active. */
export type CanvasState = {
	root: PaneNode;
	focusedPaneId: string;
};

/** localStorage namespace; one entry per workspace. */
export const CANVAS_STORAGE_PREFIX = "helmor.workspaceCanvas:";

export function canvasStorageKey(workspaceId: string): string {
	return `${CANVAS_STORAGE_PREFIX}${workspaceId}`;
}

/** The zero-risk default: one leaf for `sessionId`, focused. */
export function singleLeafCanvas(sessionId: string): CanvasState {
	const leaf = makeLeaf(sessionId);
	return { root: leaf, focusedPaneId: leaf.paneId };
}

function isValidNode(value: unknown): value is PaneNode {
	if (!value || typeof value !== "object") {
		return false;
	}
	const node = value as Record<string, unknown>;
	if (node.type === "leaf") {
		return (
			typeof node.paneId === "string" && typeof node.sessionId === "string"
		);
	}
	if (node.type === "split") {
		const split = value as Partial<PaneSplit>;
		if (split.direction !== "row" && split.direction !== "col") {
			return false;
		}
		if (!Array.isArray(split.children) || split.children.length < 2) {
			return false;
		}
		if (
			!Array.isArray(split.sizes) ||
			split.sizes.length !== split.children.length ||
			!split.sizes.every((size) => typeof size === "number")
		) {
			return false;
		}
		return split.children.every(isValidNode);
	}
	return false;
}

export function isValidCanvas(value: unknown): value is CanvasState {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.focusedPaneId !== "string") {
		return false;
	}
	if (!isValidNode(candidate.root)) {
		return false;
	}
	const paneIds = new Set(
		collectLeaves(candidate.root as PaneNode).map((leaf) => leaf.paneId),
	);
	return paneIds.has(candidate.focusedPaneId);
}

export function serializeCanvas(state: CanvasState): string {
	return JSON.stringify(state);
}

export function deserializeCanvas(raw: string | null): CanvasState | null {
	if (!raw) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	return isValidCanvas(parsed) ? parsed : null;
}

/** If the focused pane no longer exists, repoint focus to the first leaf. */
export function ensureFocused(state: CanvasState): CanvasState {
	const leaves = collectLeaves(state.root);
	if (leaves.some((leaf) => leaf.paneId === state.focusedPaneId)) {
		return state;
	}
	return { ...state, focusedPaneId: leaves[0]?.paneId ?? state.focusedPaneId };
}
