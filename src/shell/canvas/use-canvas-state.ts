// Stateful glue over the pure pane-tree model. Owns the per-workspace SPLIT:
// a multi-leaf pane tree (or null when there is no split). The split is a
// PERSISTENT entity — it survives navigating to other (non-split) sessions and
// back, and is only dissolved by closing panes down to one. Single sessions are
// NOT represented here; they render through the normal conversation path.
//
// Persisted to localStorage per workspace (multi-leaf only).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type CanvasState,
	canvasStorageKey,
	deserializeCanvas,
	ensureFocused,
	serializeCanvas,
} from "./canvas-persistence";
import {
	closeLeaf,
	collectLeaves,
	type DropEdge,
	insertLeaf,
	leafCount,
	makeLeaf,
	moveLeaf,
	type PaneLeaf,
	type PaneSplit,
	resizeSplit,
	splitLeaf,
} from "./tree-model";

type Params = {
	workspaceId: string | null;
};

export type CanvasStateApi = {
	/** The current split (always ≥2 leaves), or null when there is no split. */
	canvas: CanvasState | null;
	leaves: PaneLeaf[];
	/** Session IDs of every pane in the split (empty when no split). */
	splitSessionIds: string[];
	hasSplit: boolean;
	focusedPaneId: string | null;
	/** Start a fresh 2-pane split from a single session (single view → split).
	 *  Replaces any existing split. */
	startSplit: (
		sourceSessionId: string,
		direction: "row" | "col",
		newSessionId: string,
	) => void;
	/** Start a split by dropping `droppedSessionId` onto a single session at an
	 *  edge (drag-to-split from the non-split single view). */
	startSplitByDrop: (
		sourceSessionId: string,
		droppedSessionId: string,
		edge: DropEdge,
	) => void;
	/** Extend the existing split at the focused pane. */
	splitFocused: (direction: "row" | "col", newSessionId: string) => void;
	/** Extend the existing split at a specific pane. */
	splitPane: (
		paneId: string,
		direction: "row" | "col",
		newSessionId: string,
	) => void;
	/** Close a pane. When only one leaf would remain, the split is dissolved
	 *  (returns to null) — its remaining session becomes a normal single tab. */
	closePane: (paneId: string) => void;
	resize: (path: number[], sizes: number[]) => void;
	movePane: (paneId: string, targetPaneId: string, edge: DropEdge) => void;
	/** Drop a session NOT yet in the split next to a pane (drag-to-split). */
	insertPane: (
		newSessionId: string,
		targetPaneId: string,
		edge: DropEdge,
	) => void;
	focusPane: (paneId: string) => void;
};

function readPersisted(workspaceId: string | null): CanvasState | null {
	if (!workspaceId || typeof window === "undefined") {
		return null;
	}
	try {
		return deserializeCanvas(
			window.localStorage.getItem(canvasStorageKey(workspaceId)),
		);
	} catch {
		return null;
	}
}

function twoPaneSplit(
	first: PaneLeaf,
	second: PaneLeaf,
	direction: "row" | "col",
): PaneSplit {
	return {
		type: "split",
		direction,
		children: [first, second],
		sizes: [0.5, 0.5],
	};
}

export function useCanvasState({ workspaceId }: Params): CanvasStateApi {
	// Seed strictly from the persisted split — single sessions are not part of
	// the canvas, so there is nothing to seed when no split is saved.
	const [canvas, setCanvas] = useState<CanvasState | null>(() => {
		const persisted = readPersisted(workspaceId);
		return persisted ? ensureFocused(persisted) : null;
	});

	// Re-seed the split when the workspace changes.
	const workspaceRef = useRef(workspaceId);
	useEffect(() => {
		if (workspaceRef.current === workspaceId) {
			return;
		}
		workspaceRef.current = workspaceId;
		const persisted = readPersisted(workspaceId);
		setCanvas(persisted ? ensureFocused(persisted) : null);
	}, [workspaceId]);

	// Persist the split; clear the key when there is no split.
	useEffect(() => {
		if (!workspaceId || typeof window === "undefined") {
			return;
		}
		const key = canvasStorageKey(workspaceId);
		try {
			if (canvas && leafCount(canvas.root) > 1) {
				window.localStorage.setItem(key, serializeCanvas(canvas));
			} else {
				window.localStorage.removeItem(key);
			}
		} catch {
			// Storage full / unavailable — non-fatal, layout just won't persist.
		}
	}, [workspaceId, canvas]);

	const startSplit = useCallback(
		(
			sourceSessionId: string,
			direction: "row" | "col",
			newSessionId: string,
		) => {
			const root = twoPaneSplit(
				makeLeaf(sourceSessionId),
				makeLeaf(newSessionId),
				direction,
			);
			setCanvas({ root, focusedPaneId: makeLeaf(newSessionId).paneId });
		},
		[],
	);

	const startSplitByDrop = useCallback(
		(sourceSessionId: string, droppedSessionId: string, edge: DropEdge) => {
			const direction: "row" | "col" =
				edge === "left" || edge === "right" ? "row" : "col";
			const before = edge === "left" || edge === "top";
			const source = makeLeaf(sourceSessionId);
			const dropped = makeLeaf(droppedSessionId);
			const root = before
				? twoPaneSplit(dropped, source, direction)
				: twoPaneSplit(source, dropped, direction);
			setCanvas({ root, focusedPaneId: dropped.paneId });
		},
		[],
	);

	const splitPane = useCallback(
		(paneId: string, direction: "row" | "col", newSessionId: string) => {
			setCanvas((current) => {
				if (!current) {
					return current;
				}
				const root = splitLeaf(current.root, paneId, direction, newSessionId);
				if (root === current.root) {
					return current; // cap reached or pane absent — no-op
				}
				return { root, focusedPaneId: makeLeaf(newSessionId).paneId };
			});
		},
		[],
	);

	const splitFocused = useCallback(
		(direction: "row" | "col", newSessionId: string) => {
			setCanvas((current) => {
				if (!current) {
					return current;
				}
				const root = splitLeaf(
					current.root,
					current.focusedPaneId,
					direction,
					newSessionId,
				);
				if (root === current.root) {
					return current;
				}
				return { root, focusedPaneId: makeLeaf(newSessionId).paneId };
			});
		},
		[],
	);

	const closePane = useCallback((paneId: string) => {
		setCanvas((current) => {
			if (!current) {
				return current;
			}
			const root = closeLeaf(current.root, paneId);
			if (root === current.root) {
				return current;
			}
			// Dissolved to a single leaf (or nothing) → no more split.
			if (root === null || root.type === "leaf") {
				return null;
			}
			return ensureFocused({ ...current, root });
		});
	}, []);

	const resize = useCallback((path: number[], sizes: number[]) => {
		setCanvas((current) => {
			if (!current) {
				return current;
			}
			const root = resizeSplit(current.root, path, sizes);
			if (root === current.root) {
				return current;
			}
			return { ...current, root };
		});
	}, []);

	const movePane = useCallback(
		(paneId: string, targetPaneId: string, edge: DropEdge) => {
			setCanvas((current) => {
				if (!current) {
					return current;
				}
				const root = moveLeaf(current.root, paneId, targetPaneId, edge);
				if (root === current.root) {
					return current;
				}
				if (root.type === "leaf") {
					return null;
				}
				return ensureFocused({ root, focusedPaneId: paneId });
			});
		},
		[],
	);

	const insertPane = useCallback(
		(newSessionId: string, targetPaneId: string, edge: DropEdge) => {
			setCanvas((current) => {
				if (!current) {
					return current;
				}
				const root = insertLeaf(current.root, newSessionId, targetPaneId, edge);
				if (root === current.root) {
					return current;
				}
				return { root, focusedPaneId: makeLeaf(newSessionId).paneId };
			});
		},
		[],
	);

	const focusPane = useCallback((paneId: string) => {
		setCanvas((current) => {
			if (!current || current.focusedPaneId === paneId) {
				return current;
			}
			const exists = collectLeaves(current.root).some(
				(leaf) => leaf.paneId === paneId,
			);
			return exists ? { ...current, focusedPaneId: paneId } : current;
		});
	}, []);

	const leaves = useMemo(
		() => (canvas ? collectLeaves(canvas.root) : []),
		[canvas],
	);

	return {
		canvas,
		leaves,
		splitSessionIds: leaves.map((l) => l.sessionId),
		hasSplit: canvas != null,
		focusedPaneId: canvas?.focusedPaneId ?? null,
		startSplit,
		startSplitByDrop,
		splitFocused,
		splitPane,
		closePane,
		resize,
		movePane,
		insertPane,
		focusPane,
	};
}
