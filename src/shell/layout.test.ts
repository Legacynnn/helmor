import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionSummary } from "@/lib/api";
import {
	clampBrowserSplitWidth,
	DEFAULT_BROWSER_SPLIT_WIDTH,
	getInitialBrowserSplitWidth,
	MAX_BROWSER_SPLIT_WIDTH,
	MIN_BROWSER_SPLIT_WIDTH,
	resolveSessionIdByOrdinal,
} from "./layout";

describe("clampBrowserSplitWidth", () => {
	it("clamps below the min", () => {
		expect(clampBrowserSplitWidth(10)).toBe(MIN_BROWSER_SPLIT_WIDTH);
	});
	it("clamps above the max", () => {
		expect(clampBrowserSplitWidth(9999)).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});
	it("passes a value in range through", () => {
		expect(clampBrowserSplitWidth(700)).toBe(700);
	});
});

describe("getInitialBrowserSplitWidth", () => {
	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});
	it("returns the default when nothing is stored", () => {
		expect(getInitialBrowserSplitWidth()).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
	});
	it("returns the clamped stored value", () => {
		window.localStorage.setItem("helmor.workspaceBrowserSplitWidth", "9999");
		expect(getInitialBrowserSplitWidth()).toBe(MAX_BROWSER_SPLIT_WIDTH);
	});
	it("falls back to default on a non-numeric stored value", () => {
		window.localStorage.setItem("helmor.workspaceBrowserSplitWidth", "abc");
		expect(getInitialBrowserSplitWidth()).toBe(DEFAULT_BROWSER_SPLIT_WIDTH);
	});
});

function sessions(count: number): WorkspaceSessionSummary[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `s${i + 1}`,
		workspaceId: "ws-1",
		title: `Session ${i + 1}`,
		status: "idle",
		permissionMode: "default",
		unreadCount: 0,
		fastMode: false,
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		isHidden: false,
	})) as WorkspaceSessionSummary[];
}

describe("resolveSessionIdByOrdinal", () => {
	it("returns null for empty lists and out-of-range ordinals", () => {
		expect(resolveSessionIdByOrdinal([], null, 1)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), null, 0)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), null, 10)).toBeNull();
	});

	it("maps Cmd+1..8 to absolute 1-based positions", () => {
		const list = sessions(5);
		expect(resolveSessionIdByOrdinal(list, "s3", 1)).toBe("s1");
		expect(resolveSessionIdByOrdinal(list, "s3", 2)).toBe("s2");
		expect(resolveSessionIdByOrdinal(list, "s3", 5)).toBe("s5");
	});

	it("no-ops when an absolute position does not exist", () => {
		expect(resolveSessionIdByOrdinal(sessions(3), "s1", 4)).toBeNull();
		expect(resolveSessionIdByOrdinal(sessions(3), "s1", 8)).toBeNull();
	});

	it("Cmd+9 is a no-op with fewer than 9 sessions", () => {
		expect(resolveSessionIdByOrdinal(sessions(8), "s5", 9)).toBeNull();
	});

	it("Cmd+9 jumps to position 9 when the selection is below the overflow region", () => {
		const list = sessions(11);
		expect(resolveSessionIdByOrdinal(list, "s1", 9)).toBe("s9");
		expect(resolveSessionIdByOrdinal(list, "s5", 9)).toBe("s9");
		expect(resolveSessionIdByOrdinal(list, null, 9)).toBe("s9");
	});

	it("Cmd+9 advances within the overflow region and wraps after the last tab", () => {
		const list = sessions(11);
		expect(resolveSessionIdByOrdinal(list, "s9", 9)).toBe("s10");
		expect(resolveSessionIdByOrdinal(list, "s10", 9)).toBe("s11");
		expect(resolveSessionIdByOrdinal(list, "s11", 9)).toBe("s9");
	});
});
