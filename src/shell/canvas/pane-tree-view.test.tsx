import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaneTreeView } from "./pane-tree-view";
import { makeLeaf, splitLeaf } from "./tree-model";

afterEach(cleanup);

const renderLeaf = (leaf: { sessionId: string }) => (
	<div data-testid={`body-${leaf.sessionId}`}>{leaf.sessionId}</div>
);

describe("PaneTreeView", () => {
	it("renders one body per leaf and a separator between siblings", () => {
		const tree = splitLeaf(makeLeaf("a"), "pane-a", "row", "b");
		const { container } = render(
			<PaneTreeView
				node={tree}
				focusedPaneId="pane-a"
				renderLeaf={renderLeaf}
				onFocusPane={() => {}}
				onResize={() => {}}
			/>,
		);
		expect(screen.getByTestId("body-a")).toBeTruthy();
		expect(screen.getByTestId("body-b")).toBeTruthy();
		expect(container.querySelectorAll("[data-canvas-resize]")).toHaveLength(1);
	});

	it("exposes a dropzone + pane id on each leaf", () => {
		const tree = splitLeaf(makeLeaf("a"), "pane-a", "row", "b");
		const { container } = render(
			<PaneTreeView
				node={tree}
				focusedPaneId="pane-a"
				renderLeaf={renderLeaf}
				onFocusPane={() => {}}
				onResize={() => {}}
			/>,
		);
		expect(container.querySelectorAll("[data-canvas-dropzone]")).toHaveLength(
			2,
		);
		expect(container.querySelector('[data-pane-id="pane-b"]')).not.toBeNull();
	});

	it("focuses a leaf on pointer-down", () => {
		const onFocusPane = vi.fn();
		const tree = splitLeaf(makeLeaf("a"), "pane-a", "row", "b");
		const { container } = render(
			<PaneTreeView
				node={tree}
				focusedPaneId="pane-a"
				renderLeaf={renderLeaf}
				onFocusPane={onFocusPane}
				onResize={() => {}}
			/>,
		);
		const leafB = container.querySelector('[data-pane-id="pane-b"]');
		if (!leafB) throw new Error("leaf b missing");
		fireEvent.pointerDown(leafB);
		expect(onFocusPane).toHaveBeenCalledWith("pane-b");
	});

	it("renders a nested split with the right number of separators", () => {
		let tree = splitLeaf(makeLeaf("a"), "pane-a", "row", "b");
		tree = splitLeaf(tree, "pane-b", "col", "c");
		const { container } = render(
			<PaneTreeView
				node={tree}
				focusedPaneId="pane-a"
				renderLeaf={renderLeaf}
				onFocusPane={() => {}}
				onResize={() => {}}
			/>,
		);
		// outer row (1 sep) + inner col (1 sep) = 2
		expect(container.querySelectorAll("[data-canvas-resize]")).toHaveLength(2);
		expect(screen.getByTestId("body-c")).toBeTruthy();
	});
});
