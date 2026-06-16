import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	BROWSER_SPLIT_WIDTH_STORAGE_KEY,
	DEFAULT_BROWSER_SPLIT_WIDTH,
	MAX_BROWSER_SPLIT_WIDTH,
} from "@/shell/layout";
import { useBrowserSplitPanel } from "./use-browser-split-panel";

describe("useBrowserSplitPanel", () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it("seeds from the default and persists writes", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		expect(result.current.browserSplitWidth).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
		act(() => result.current.setBrowserSplitWidth(720));
		expect(result.current.browserSplitWidth).toBe(720);
		expect(window.localStorage.getItem(BROWSER_SPLIT_WIDTH_STORAGE_KEY)).toBe(
			"720",
		);
	});

	it("clamps a setter write above the max", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		act(() => result.current.setBrowserSplitWidth(9999));
		expect(result.current.browserSplitWidth).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});

	it("ArrowLeft grows the panel by one step", () => {
		const { result } = renderHook(() => useBrowserSplitPanel());
		const before = result.current.browserSplitWidth;
		act(() => {
			result.current.handleBrowserResizeKeyDown({
				key: "ArrowLeft",
				preventDefault: () => {},
			} as unknown as React.KeyboardEvent<HTMLDivElement>);
		});
		expect(result.current.browserSplitWidth).toBe(before + 16);
	});
});
