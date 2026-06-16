import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBrowserSessionController } from "./use-browser-session-controller";

describe("useBrowserSessionController", () => {
	it("opens a tab and calls enterBrowserMode", () => {
		const enterBrowserMode = vi.fn();
		const { result } = renderHook(() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode,
				exitBrowserMode: vi.fn(),
			}),
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
		const { result } = renderHook(() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode: vi.fn(),
				exitBrowserMode: vi.fn(),
			}),
		);
		act(() => result.current.actions.openUrl("http://a"));
		act(() => result.current.actions.navigate("http://b"));
		expect(result.current.state.tabs[0].url).toBe("http://b");
	});

	it("closing the last tab exits browser mode", () => {
		const exitBrowserMode = vi.fn();
		const { result } = renderHook(() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode: vi.fn(),
				exitBrowserMode,
			}),
		);
		act(() => result.current.actions.openUrl("http://a"));
		const id = result.current.state.tabs[0].id;
		act(() => result.current.actions.closeTab(id));
		expect(result.current.state.tabs).toHaveLength(0);
		expect(result.current.state.activeTabId).toBeNull();
		expect(exitBrowserMode).toHaveBeenCalled();
	});

	it("selects a tab by id", () => {
		const { result } = renderHook(() =>
			useBrowserSessionController({
				selectedWorkspaceId: "ws1",
				enterBrowserMode: vi.fn(),
				exitBrowserMode: vi.fn(),
			}),
		);
		act(() => result.current.actions.openUrl("http://a"));
		act(() => result.current.actions.openUrl("http://b"));
		const firstId = result.current.state.tabs[0].id;
		act(() => result.current.actions.selectTab(firstId));
		expect(result.current.state.activeTabId).toBe(firstId);
	});
});
