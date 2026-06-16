import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceBrowserSurface } from "./index";

// Stub the browser IPC wrappers so ContentHost never touches a real webview.
vi.mock("@/lib/api", () => ({
	browserCreate: vi.fn(() => Promise.resolve()),
	browserNavigate: vi.fn(() => Promise.resolve()),
	browserSetBounds: vi.fn(() => Promise.resolve()),
	browserDestroy: vi.fn(() => Promise.resolve()),
}));

describe("WorkspaceBrowserSurface", () => {
	afterEach(cleanup);

	it("navigates the active tab on URL submit", () => {
		const onNavigate = vi.fn();
		render(
			<WorkspaceBrowserSurface
				tabs={[
					{
						id: "a",
						url: "http://localhost:3000",
						title: "Local",
						loading: false,
					},
				]}
				activeTabId="a"
				onNavigate={onNavigate}
				onSelectTab={vi.fn()}
				onCloseTab={vi.fn()}
				onOpenUrl={vi.fn()}
				onExit={vi.fn()}
			/>,
		);
		const input = screen.getByRole("textbox", { name: /address/i });
		fireEvent.change(input, { target: { value: "http://localhost:8080" } });
		fireEvent.submit(input.closest("form")!);
		expect(onNavigate).toHaveBeenCalledWith("http://localhost:8080");
	});

	it("opens a new tab from the tab strip", () => {
		const onOpenUrl = vi.fn();
		render(
			<WorkspaceBrowserSurface
				tabs={[
					{
						id: "a",
						url: "http://localhost:3000",
						title: "Local",
						loading: false,
					},
				]}
				activeTabId="a"
				onNavigate={vi.fn()}
				onSelectTab={vi.fn()}
				onCloseTab={vi.fn()}
				onOpenUrl={onOpenUrl}
				onExit={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /new tab/i }));
		expect(onOpenUrl).toHaveBeenCalled();
	});
});
