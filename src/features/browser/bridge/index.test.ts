import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridge } from "./index";

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("createBridge passive guard", () => {
	it("installs zero listeners/observers/rAF in mode 'none'", () => {
		const docAdd = vi.spyOn(document, "addEventListener");
		const raf = vi.spyOn(window, "requestAnimationFrame");
		const ObserverSpy = vi.fn();
		vi.stubGlobal(
			"MutationObserver",
			class {
				constructor() {
					ObserverSpy();
				}
				observe() {}
				disconnect() {}
				takeRecords() {
					return [];
				}
			},
		);

		const bridge = createBridge({ mode: "none", post: vi.fn() });
		bridge.init();

		expect(docAdd).not.toHaveBeenCalled();
		expect(raf).not.toHaveBeenCalled();
		expect(ObserverSpy).not.toHaveBeenCalled();

		bridge.teardown();
		vi.unstubAllGlobals();
	});

	it("installs no listeners when mode is unset (defaults to none)", () => {
		const docAdd = vi.spyOn(document, "addEventListener");
		const bridge = createBridge({ post: vi.fn() });
		bridge.init();
		expect(docAdd).not.toHaveBeenCalled();
		bridge.teardown();
	});
});

describe("createBridge mode activation", () => {
	it("installs hover/click listeners when 'comment' mode is activated", () => {
		const targetAdd = vi.spyOn(document, "addEventListener");
		const bridge = createBridge({ mode: "none", post: vi.fn() });
		bridge.init();
		expect(targetAdd).not.toHaveBeenCalled();

		bridge.setMode("comment");
		const events = targetAdd.mock.calls.map((c) => c[0]);
		expect(events).toContain("mousemove");
		expect(events).toContain("click");

		bridge.teardown();
	});

	it("removes the listeners it installed on teardown", () => {
		const add = vi.spyOn(document, "addEventListener");
		const remove = vi.spyOn(document, "removeEventListener");
		const bridge = createBridge({ mode: "comment", post: vi.fn() });
		bridge.init();
		const addedEvents = new Set(add.mock.calls.map((c) => c[0]));
		expect(addedEvents.size).toBeGreaterThan(0);

		bridge.teardown();
		const removedEvents = new Set(remove.mock.calls.map((c) => c[0]));
		for (const ev of addedEvents) {
			expect(removedEvents.has(ev)).toBe(true);
		}
	});

	it("installs ZERO listeners while mode is none (passive Navigate)", () => {
		const doc = document.implementation.createHTMLDocument("t");
		const add = vi.spyOn(doc, "addEventListener");
		const bridge = createBridge({ mode: "none", post: vi.fn(), doc });
		bridge.init();
		expect(add).not.toHaveBeenCalled();
		bridge.teardown();
	});

	it("attaches listeners only when an interactive mode is set, removes on return to none", () => {
		const doc = document.implementation.createHTMLDocument("t");
		const add = vi.spyOn(doc, "addEventListener");
		const remove = vi.spyOn(doc, "removeEventListener");
		const bridge = createBridge({ mode: "none", post: vi.fn(), doc });
		bridge.init();
		bridge.setMode("pick");
		expect(add).toHaveBeenCalled(); // mousemove + click now live
		bridge.setMode("none");
		expect(remove).toHaveBeenCalled(); // listeners torn down again
		bridge.teardown();
	});

	it("switching back to 'none' removes active-mode listeners", () => {
		const remove = vi.spyOn(document, "removeEventListener");
		const bridge = createBridge({ mode: "comment", post: vi.fn() });
		bridge.init();
		bridge.setMode("none");
		const removed = remove.mock.calls.map((c) => c[0]);
		expect(removed).toContain("mousemove");
		expect(removed).toContain("click");
		bridge.teardown();
	});
});
