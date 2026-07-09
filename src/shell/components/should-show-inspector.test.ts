import { describe, expect, it } from "vitest";
import { shouldShowInspector } from "./should-show-inspector";

const base = {
	canvasActive: false,
	activeScreen: "none" as const,
	rightSidebarAvailable: true,
	workspaceMode: "worktree" as const,
};

describe("shouldShowInspector", () => {
	it("shows the inspector in the normal world when eligible", () => {
		expect(shouldShowInspector(base)).toBe(true);
	});

	it("never mounts the inspector (or its leaking resize separator) in canvas mode", () => {
		// Regression: the absolutely-positioned separator escaped the offscreen
		// normal-world column via the sliding track's transform and floated over
		// the canvas as a ghost draggable strip that also ate pan/scroll.
		expect(shouldShowInspector({ ...base, canvasActive: true })).toBe(false);
	});

	it("hides the inspector on a non-workspace screen", () => {
		expect(shouldShowInspector({ ...base, activeScreen: "dashboard" })).toBe(
			false,
		);
	});

	it("hides the inspector when no right sidebar is available", () => {
		expect(shouldShowInspector({ ...base, rightSidebarAvailable: false })).toBe(
			false,
		);
	});

	it("hides the inspector for chat-mode workspaces", () => {
		expect(shouldShowInspector({ ...base, workspaceMode: "chat" })).toBe(false);
	});
});
