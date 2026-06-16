import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createHelmorQueryClient } from "@/lib/query-client";
import { useBrowserSessionController } from "./use-browser-session-controller";

// Persistence wrappers hit Tauri `invoke`; stub them out so the in-memory tab
// state machine can be exercised in isolation (no DB round-trip in jsdom).
vi.mock("@/lib/api", () => ({
	browserListTabs: vi.fn().mockResolvedValue([]),
	browserPersistTabs: vi.fn().mockResolvedValue(undefined),
}));

function wrapper({ children }: { children: ReactNode }) {
	const queryClient = createHelmorQueryClient();
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

describe("useBrowserSessionController", () => {
	it("opens a tab and calls enterBrowserMode", () => {
		const enterBrowserMode = vi.fn();
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode,
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.openUrl("http://localhost:3000"));
		expect(result.current.state.tabs).toHaveLength(1);
		expect(result.current.state.tabs[0].url).toBe("http://localhost:3000");
		expect(result.current.state.activeTabId).toBe(
			result.current.state.tabs[0].id,
		);
		expect(enterBrowserMode).toHaveBeenCalled();
	});

	it("navigates the active tab's url", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.openUrl("http://a"));
		act(() => result.current.actions.navigate("http://b"));
		expect(result.current.state.tabs[0].url).toBe("http://b");
	});

	it("closing the last tab exits browser mode", () => {
		const exitBrowserMode = vi.fn();
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode,
				}),
			{ wrapper },
		);
		act(() => result.current.actions.openUrl("http://a"));
		const id = result.current.state.tabs[0].id;
		act(() => result.current.actions.closeTab(id));
		expect(result.current.state.tabs).toHaveLength(0);
		expect(result.current.state.activeTabId).toBeNull();
		expect(exitBrowserMode).toHaveBeenCalled();
	});

	it("selects a tab by id", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.openUrl("http://a"));
		act(() => result.current.actions.openUrl("http://b"));
		const firstId = result.current.state.tabs[0].id;
		act(() => result.current.actions.selectTab(firstId));
		expect(result.current.state.activeTabId).toBe(firstId);
	});

	it("defaults layout to split and resets to split on openUrl", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		expect(result.current.state.layout).toBe("split");
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("expanded");
		act(() => result.current.actions.openUrl("http://a"));
		expect(result.current.state.layout).toBe("split");
	});

	it("toggleExpand flips between split and expanded", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("expanded");
		act(() => result.current.actions.toggleExpand());
		expect(result.current.state.layout).toBe("split");
	});

	it("setLayout sets an explicit layout", () => {
		const { result } = renderHook(
			() =>
				useBrowserSessionController({
					selectedWorkspaceId: "ws1",
					enterBrowserMode: vi.fn(),
					exitBrowserMode: vi.fn(),
				}),
			{ wrapper },
		);
		act(() => result.current.actions.setLayout("expanded"));
		expect(result.current.state.layout).toBe("expanded");
	});
});
