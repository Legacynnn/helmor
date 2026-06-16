import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/browser", () => ({
	WorkspaceBrowserSurface: () => <div data-testid="browser-surface" />,
}));
vi.mock("./shell-workspace-conversation", () => ({
	ShellWorkspaceConversation: () => <div data-testid="chat-surface" />,
}));
vi.mock("./start-surface-pane", () => ({
	StartSurfacePane: () => <div data-testid="start-surface" />,
}));
vi.mock("@/features/editor", () => ({
	WorkspaceEditorSurface: () => <div data-testid="editor-surface" />,
}));

import { WorkspacePaneSurface } from "./workspace-pane-surface";

function makeProps(layout: "split" | "expanded") {
	const browserSession = {
		state: {
			workspaceId: "ws1",
			tabs: [{ id: "t1", url: "http://a", title: "a", loading: false }],
			activeTabId: "t1",
			layout,
		},
		actions: {
			openUrl: vi.fn(),
			selectTab: vi.fn(),
			closeTab: vi.fn(),
			navigate: vi.fn(),
			fallbackToHttp: vi.fn(),
			setTabLoaded: vi.fn(),
			setLayout: vi.fn(),
			toggleExpand: vi.fn(),
			exit: vi.fn(),
		},
	};
	// Child surfaces are mocked, but the chat branch's JSX still dereferences
	// these action bags when building its (ignored) props, so they must exist.
	const actionBag = new Proxy({}, { get: () => vi.fn() });
	return {
		workspaceViewMode: "browser" as const,
		browserSession,
		appShortcuts: {},
		selectionActions: actionBag,
		readStateActions: actionBag,
		editorSessionActions: actionBag,
		contextPanelActions: actionBag,
		pendingQueueActions: actionBag,
		startSurfaceActions: actionBag,
	} as unknown as Parameters<typeof WorkspacePaneSurface>[0];
}

describe("WorkspacePaneSurface browser layout", () => {
	afterEach(() => cleanup());

	it("renders chat alongside the browser in split layout", () => {
		render(<WorkspacePaneSurface {...makeProps("split")} />);
		expect(screen.getByTestId("browser-surface")).toBeInTheDocument();
		expect(screen.getByTestId("chat-surface")).toBeInTheDocument();
	});

	it("hides chat in expanded layout", () => {
		render(<WorkspacePaneSurface {...makeProps("expanded")} />);
		expect(screen.getByTestId("browser-surface")).toBeInTheDocument();
		// Chat is still mounted (it owns selection state) but visually hidden.
		const chat = screen.getByTestId("chat-surface");
		expect(chat.closest("[data-focus-scope='chat']")).toHaveClass("hidden");
	});
});
