import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserTab } from "../tab-model";
import { BrowserTabs } from "./browser-tabs";

const tab = (id: string, title: string): BrowserTab => ({
	id,
	url: `http://localhost/${id}`,
	title,
	loading: false,
});

describe("BrowserTabs", () => {
	afterEach(cleanup);
	const tabs = [tab("a", "Alpha"), tab("b", "Beta")];

	it("renders the tab titles", () => {
		render(
			<BrowserTabs
				tabs={tabs}
				activeTabId="a"
				onSelectTab={vi.fn()}
				onCloseTab={vi.fn()}
				onNewTab={vi.fn()}
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
	});

	it("calls onSelectTab when a tab is activated", async () => {
		const onSelectTab = vi.fn();
		render(
			<BrowserTabs
				tabs={tabs}
				activeTabId="a"
				onSelectTab={onSelectTab}
				onCloseTab={vi.fn()}
				onNewTab={vi.fn()}
			/>,
		);
		// Radix activates a Tab on pointer interaction; userEvent dispatches the
		// pointer sequence Radix's onValueChange listens for (plain fireEvent.click
		// is insufficient under jsdom).
		const trigger = screen.getByText("Beta").closest('[role="tab"]')!;
		await userEvent.click(trigger);
		expect(onSelectTab).toHaveBeenCalledWith("b");
	});

	it("calls onCloseTab(id) when the close button is clicked", () => {
		const onCloseTab = vi.fn();
		render(
			<BrowserTabs
				tabs={tabs}
				activeTabId="a"
				onSelectTab={vi.fn()}
				onCloseTab={onCloseTab}
				onNewTab={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /close alpha/i }));
		expect(onCloseTab).toHaveBeenCalledWith("a");
	});

	it("calls onNewTab when the new-tab button is clicked", () => {
		const onNewTab = vi.fn();
		render(
			<BrowserTabs
				tabs={tabs}
				activeTabId="a"
				onSelectTab={vi.fn()}
				onCloseTab={vi.fn()}
				onNewTab={onNewTab}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /new tab/i }));
		expect(onNewTab).toHaveBeenCalled();
	});
});
