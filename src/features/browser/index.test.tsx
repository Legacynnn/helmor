import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { browserSendBridgeMessage } from "@/lib/api";
import { WorkspaceBrowserSurface } from "./index";

// Stub the browser IPC wrappers so ContentHost never touches a real webview.
vi.mock("@/lib/api", () => ({
	browserCreate: vi.fn(() => Promise.resolve()),
	browserNavigate: vi.fn(() => Promise.resolve()),
	browserSetBounds: vi.fn(() => Promise.resolve()),
	browserDestroy: vi.fn(() => Promise.resolve()),
	browserSendBridgeMessage: vi.fn(() => Promise.resolve()),
	browserListComments: vi.fn(() => Promise.resolve([])),
}));

const sendBridge = vi.mocked(browserSendBridgeMessage);

function renderSurface(
	props: Partial<Parameters<typeof WorkspaceBrowserSurface>[0]> = {},
) {
	const merged: Parameters<typeof WorkspaceBrowserSurface>[0] = {
		workspaceId: "ws-test",
		tabs: [
			{ id: "a", url: "http://localhost:3000", title: "Local", loading: false },
		],
		activeTabId: "a",
		onNavigate: vi.fn(),
		onSelectTab: vi.fn(),
		onCloseTab: vi.fn(),
		onOpenUrl: vi.fn(),
		onExit: vi.fn(),
		...props,
	};
	render(
		<TooltipProvider>
			<WorkspaceBrowserSurface {...merged} />
		</TooltipProvider>,
	);
	return merged;
}

describe("WorkspaceBrowserSurface", () => {
	afterEach(() => {
		cleanup();
		sendBridge.mockClear();
	});

	it("navigates the active tab on URL submit", () => {
		const onNavigate = vi.fn();
		renderSurface({ onNavigate });
		const input = screen.getByRole("textbox", { name: /address/i });
		fireEvent.change(input, { target: { value: "http://localhost:8080" } });
		fireEvent.submit(input.closest("form")!);
		expect(onNavigate).toHaveBeenCalledWith("http://localhost:8080");
	});

	it("opens a new tab from the tab strip", () => {
		const onOpenUrl = vi.fn();
		renderSurface({ onOpenUrl });
		fireEvent.click(screen.getByRole("button", { name: /new tab/i }));
		expect(onOpenUrl).toHaveBeenCalled();
	});

	it("sends a set-mode bridge message when a mode button is clicked", () => {
		renderSurface();
		fireEvent.click(screen.getByRole("button", { name: /comment/i }));
		expect(sendBridge).toHaveBeenCalledWith({
			kind: "set-mode",
			mode: "comment",
		});
	});

	it("exits the surface on Escape only while in Navigate mode", () => {
		const onExit = vi.fn();
		renderSurface({ onExit });
		// Activate an inspector mode first.
		fireEvent.click(screen.getByRole("button", { name: /comment/i }));
		sendBridge.mockClear();
		// First Escape resets the mode (ModeToolbar) — it must NOT exit.
		fireEvent.keyDown(window, { key: "Escape" });
		expect(sendBridge).toHaveBeenCalledWith({ kind: "set-mode", mode: "none" });
		expect(onExit).not.toHaveBeenCalled();
		// Second Escape (now in Navigate) exits the surface.
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onExit).toHaveBeenCalled();
	});
});
