import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canvasStorageKey, deserializeCanvas } from "./canvas-persistence";
import { useCanvasState } from "./use-canvas-state";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("useCanvasState", () => {
	it("starts with no split", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		expect(result.current.hasSplit).toBe(false);
		expect(result.current.canvas).toBeNull();
		expect(result.current.splitSessionIds).toEqual([]);
		expect(window.localStorage.getItem(canvasStorageKey("ws"))).toBeNull();
	});

	it("startSplit creates a 2-pane split, focuses the new pane, and persists", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		expect(result.current.hasSplit).toBe(true);
		expect(result.current.splitSessionIds).toEqual(["s1", "s2"]);
		expect(result.current.focusedPaneId).toBe("pane-s2");
		const stored = deserializeCanvas(
			window.localStorage.getItem(canvasStorageKey("ws")),
		);
		expect(stored?.root.type).toBe("split");
	});

	it("startSplitByDrop honors the drop edge ordering", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplitByDrop("s1", "s2", "left"));
		// dropped on the LEFT edge of s1 → dropped session comes first
		expect(result.current.splitSessionIds).toEqual(["s2", "s1"]);
		expect(result.current.canvas?.root.type).toBe("split");
	});

	it("splitFocused and splitPane extend an existing split", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		act(() => result.current.splitFocused("col", "s3"));
		expect(result.current.splitSessionIds).toEqual(["s1", "s2", "s3"]);
		act(() => result.current.splitPane("pane-s1", "row", "s4"));
		expect(result.current.leaves).toHaveLength(4);
	});

	it("closePane dissolves the split (and clears persistence) when one remains", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		act(() => result.current.closePane("pane-s2"));
		expect(result.current.hasSplit).toBe(false);
		expect(result.current.canvas).toBeNull();
		expect(window.localStorage.getItem(canvasStorageKey("ws"))).toBeNull();
	});

	it("closePane keeps the split when more than one pane remains", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		act(() => result.current.splitFocused("col", "s3"));
		act(() => result.current.closePane("pane-s3"));
		expect(result.current.hasSplit).toBe(true);
		expect(result.current.splitSessionIds).toEqual(["s1", "s2"]);
	});

	it("PERSISTS the split across remount — navigating away never destroys it", () => {
		const first = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => first.result.current.startSplit("s1", "col", "s2"));
		first.unmount();

		// A fresh mount (e.g. returning to the split after viewing another
		// session) restores the SAME split rather than collapsing it.
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		expect(result.current.hasSplit).toBe(true);
		expect(result.current.splitSessionIds).toEqual(["s1", "s2"]);
	});

	it("inserts a dropped session as a new pane and focuses it", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		act(() => result.current.insertPane("s3", "pane-s1", "right"));
		expect(result.current.splitSessionIds).toContain("s3");
		expect(result.current.focusedPaneId).toBe("pane-s3");
	});

	it("focuses a pane on demand", () => {
		const { result } = renderHook(() => useCanvasState({ workspaceId: "ws" }));
		act(() => result.current.startSplit("s1", "row", "s2"));
		act(() => result.current.focusPane("pane-s1"));
		expect(result.current.focusedPaneId).toBe("pane-s1");
	});
});
