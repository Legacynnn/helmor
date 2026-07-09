import { act, renderHook } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasPanel, CanvasState } from "@/lib/api";
import { useCanvasGraph } from "./use-canvas-graph";

vi.mock("@/lib/api", () => ({
	saveCanvasPanel: vi.fn(async () => {}),
	deleteCanvasPanel: vi.fn(async () => {}),
	createSession: vi.fn(async () => ({ sessionId: "session-1" })),
	hideSession: vi.fn(async () => {}),
}));

vi.mock("@/features/terminal/terminal-session-store", () => ({
	closeTerminal: vi.fn(),
}));

vi.mock("./connections/connections-store", () => ({
	useConnectionsStore: {
		getState: () => ({
			pruneForPanel: vi.fn(),
			hydrate: vi.fn(),
		}),
	},
}));

import { deleteCanvasPanel, saveCanvasPanel } from "@/lib/api";

const WORKSPACE = "ws-1";

function makePanel(id: string): CanvasPanel {
	return {
		id,
		workspaceId: WORKSPACE,
		panelType: "notes",
		x: 0,
		y: 0,
		width: 200,
		height: 200,
		z: 0,
		locked: false,
		title: "",
		config: "{}",
		createdAt: "",
		updatedAt: "",
	};
}

function makeState(panels: CanvasPanel[]): CanvasState {
	return {
		panels,
		connections: [],
		viewState: {
			workspaceId: WORKSPACE,
			panX: 0,
			panY: 0,
			zoom: 1,
			updatedAt: "",
		},
	};
}

function wrapper({ children }: { children: ReactNode }) {
	return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function renderGraph(initial: CanvasState) {
	const wrapperRef = createRef<HTMLDivElement>();
	return renderHook(() => useCanvasGraph(WORKSPACE, initial, wrapperRef), {
		wrapper,
	});
}

describe("useCanvasGraph deleted-panel resurrection guard", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	it("does not re-add a removed node when reconcile sees a stale snapshot containing it", async () => {
		const panel = makePanel("p1");
		const state = makeState([panel]);
		const { result } = renderGraph(state);

		expect(result.current.nodes.map((n) => n.id)).toEqual(["p1"]);

		// Remove the node via a React Flow "remove" change.
		act(() => {
			result.current.onNodesChange([{ type: "remove", id: "p1" }]);
		});
		expect(result.current.nodes).toHaveLength(0);
		// The delete is dispatched through the per-id serial write queue (a
		// microtask), so flush it before asserting.
		await act(async () => {
			await Promise.resolve();
		});
		expect(deleteCanvasPanel).toHaveBeenCalledWith(WORKSPACE, "p1");

		// A backend snapshot that STILL contains the deleted panel must not
		// resurrect it.
		act(() => {
			result.current.reconcile(makeState([panel]));
		});
		// flush reconcile's suppress-reset timer
		act(() => {
			vi.advanceTimersByTime(1);
		});

		expect(result.current.nodes).toHaveLength(0);
	});

	it("cancels a pending debounced persist when the node is removed", () => {
		const panel = makePanel("p1");
		const { result } = renderGraph(makeState([panel]));

		// Schedule a debounced persist via a settled drag.
		act(() => {
			result.current.onNodesChange([
				{
					type: "position",
					id: "p1",
					position: { x: 10, y: 10 },
					dragging: false,
				},
			]);
		});

		// Remove before the 350ms debounce fires.
		act(() => {
			result.current.onNodesChange([{ type: "remove", id: "p1" }]);
		});

		// Advancing past the debounce window must NOT trigger an upsert.
		act(() => {
			vi.advanceTimersByTime(400);
		});

		expect(saveCanvasPanel).not.toHaveBeenCalled();
	});

	it("never persists a panel again after it has been deleted", () => {
		const panel = makePanel("p1");
		const { result } = renderGraph(makeState([panel]));

		// Delete the panel.
		act(() => {
			result.current.onNodesChange([{ type: "remove", id: "p1" }]);
		});

		// A late settled-drag change for the same id (e.g. a trailing React Flow
		// event) must NOT schedule or fire a resurrecting upsert.
		act(() => {
			result.current.onNodesChange([
				{
					type: "position",
					id: "p1",
					position: { x: 50, y: 50 },
					dragging: false,
				},
			]);
		});
		act(() => {
			vi.advanceTimersByTime(400);
		});

		expect(saveCanvasPanel).not.toHaveBeenCalled();
	});
});
