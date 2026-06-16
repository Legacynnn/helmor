import { describe, expect, it } from "vitest";
import { activeTab, type BrowserTab, closeTab, openTab } from "./tab-model";

const tab = (id: string, url: string): BrowserTab => ({
	id,
	url,
	title: url,
	loading: false,
});

describe("browser tab-model", () => {
	it("opens a new tab and makes it active", () => {
		const tabs = openTab([], tab("a", "http://localhost:3000"));
		expect(tabs).toHaveLength(1);
		expect(activeTab(tabs, "a")?.url).toBe("http://localhost:3000");
	});

	it("does not duplicate a tab with an existing id", () => {
		const tabs = openTab([tab("a", "u1")], tab("a", "u2"));
		expect(tabs).toHaveLength(1);
		expect(tabs[0].url).toBe("u1");
	});

	it("closing the active tab falls back to a neighbor", () => {
		const tabs = [tab("a", "u1"), tab("b", "u2")];
		const { tabs: next, nextActiveId } = closeTab(tabs, "a", "a");
		expect(next).toHaveLength(1);
		expect(nextActiveId).toBe("b");
	});

	it("closing a non-active tab keeps the active id", () => {
		const tabs = [tab("a", "u1"), tab("b", "u2")];
		const { tabs: next, nextActiveId } = closeTab(tabs, "b", "a");
		expect(next).toHaveLength(1);
		expect(nextActiveId).toBe("a");
	});

	it("closing the last tab yields a null active id", () => {
		const { tabs: next, nextActiveId } = closeTab([tab("a", "u1")], "a", "a");
		expect(next).toHaveLength(0);
		expect(nextActiveId).toBeNull();
	});
});
