import { describe, expect, it } from "vitest";
import type {
	BridgeSelection,
	BridgeToHostMessage,
	ConsoleEntry,
	NetworkEntry,
} from "./channel";
import {
	type BrowserBridgeState,
	createBrowserBridgeStore,
	emptyBridgeState,
	ingestForWorkspace,
	ingestMessage,
	registerBridgeStore,
} from "./use-browser-bridge";

const selection: BridgeSelection = {
	selector: "div.card",
	outerHTML: '<div class="card">hi</div>',
	rect: { x: 1, y: 2, width: 3, height: 4 },
};

function ingestInto(
	state: BrowserBridgeState,
	msg: BridgeToHostMessage,
): BrowserBridgeState {
	return ingestMessage(state, msg);
}

describe("ingestMessage reducer", () => {
	it("routes comment-added into comments", () => {
		const next = ingestInto(emptyBridgeState(), {
			kind: "comment-added",
			id: "c1",
			text: "fix this",
			selection,
		});
		expect(next.comments).toHaveLength(1);
		expect(next.comments[0]).toMatchObject({
			id: "c1",
			text: "fix this",
			selector: "div.card",
			resolved: true,
		});
		// other buckets untouched
		expect(next.picks).toHaveLength(0);
	});

	it("routes element-picked into picks", () => {
		const next = ingestInto(emptyBridgeState(), {
			kind: "element-picked",
			selection,
		});
		expect(next.picks).toEqual([selection]);
		expect(next.comments).toHaveLength(0);
	});

	it("routes console-error into consoleEntries", () => {
		const entry: ConsoleEntry = {
			level: "error",
			message: "boom",
			ts: 123,
		};
		const next = ingestInto(emptyBridgeState(), {
			kind: "console-error",
			entry,
		});
		expect(next.consoleEntries).toEqual([entry]);
	});

	it("routes network-event into networkEntries", () => {
		const entry: NetworkEntry = {
			url: "https://x.test/api",
			method: "GET",
			status: 500,
			durationMs: 12,
			failed: true,
		};
		const next = ingestInto(emptyBridgeState(), {
			kind: "network-event",
			entry,
		});
		expect(next.networkEntries).toEqual([entry]);
	});

	it("ignores capture-result (handled out of band)", () => {
		const next = ingestInto(emptyBridgeState(), {
			kind: "capture-result",
			base64: "AAAA",
		});
		expect(next).toEqual(emptyBridgeState());
	});

	it("is pure — does not mutate the input state", () => {
		const start = emptyBridgeState();
		ingestInto(start, { kind: "element-picked", selection });
		expect(start.picks).toHaveLength(0);
	});

	it("accumulates across multiple messages", () => {
		let state = emptyBridgeState();
		state = ingestInto(state, { kind: "element-picked", selection });
		state = ingestInto(state, {
			kind: "console-error",
			entry: { level: "warn", message: "w", ts: 1 },
		});
		expect(state.picks).toHaveLength(1);
		expect(state.consoleEntries).toHaveLength(1);
	});
});

describe("store registry — ingestForWorkspace", () => {
	it("routes a realistic comment-added payload into the registered store", () => {
		const store = createBrowserBridgeStore();
		const unregister = registerBridgeStore("ws-1", store);

		ingestForWorkspace("ws-1", {
			kind: "comment-added",
			id: "c1",
			text: "tighten the gutter",
			selection: {
				selector: "main > section:nth-of-type(2)",
				outerHTML: '<section class="features">…</section>',
				rect: { x: 12, y: 340, width: 800, height: 220 },
			},
		});

		const pins = store.getState().comments;
		expect(pins).toHaveLength(1);
		expect(pins[0]).toMatchObject({
			id: "c1",
			text: "tighten the gutter",
			selector: "main > section:nth-of-type(2)",
			resolved: true,
		});
		unregister();
	});

	it("is a no-op when no store is registered for the workspace", () => {
		// Must not throw for an unknown workspace (e.g. background workspace).
		expect(() =>
			ingestForWorkspace("ws-absent", {
				kind: "element-picked",
				selection,
			}),
		).not.toThrow();
	});

	it("unregister stops routing to a stale store", () => {
		const store = createBrowserBridgeStore();
		const unregister = registerBridgeStore("ws-2", store);
		unregister();
		ingestForWorkspace("ws-2", { kind: "element-picked", selection });
		expect(store.getState().picks).toHaveLength(0);
	});

	it("hydrateComments replaces the comment list wholesale", () => {
		const store = createBrowserBridgeStore();
		store.getState().hydrateComments([
			{
				id: "h1",
				selector: "#hero",
				text: "from DB",
				rect: { x: 0, y: 0, width: 10, height: 10 },
				outerHTML: "<div id='hero'></div>",
				resolved: true,
			},
		]);
		expect(store.getState().comments).toHaveLength(1);
		expect(store.getState().comments[0].id).toBe("h1");
	});
});
