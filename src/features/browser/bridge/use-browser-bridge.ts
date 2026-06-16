/**
 * React store for the inspector bridge.
 *
 * Holds the host-side view of bridge activity: the active {@link BridgeMode},
 * the comment pins and picked elements the user has annotated, and the buffered
 * console/network entries from the collectors. The Rust bridge events feed this
 * store through {@link ingestMessage} — a PURE reducer exported separately so it
 * can be unit-tested without a React tree.
 *
 * The store is created per-mount via {@link createBrowserBridgeStore} so each
 * browser surface owns its own annotation state (no cross-tab leakage).
 */

import { create } from "zustand";
import type {
	BridgeMode,
	BridgeSelection,
	BridgeToHostMessage,
	ConsoleEntry,
	NetworkEntry,
} from "./channel";
import { addComment, type CommentPin } from "./comments";

export type BrowserBridgeState = {
	mode: BridgeMode;
	comments: CommentPin[];
	picks: BridgeSelection[];
	consoleEntries: ConsoleEntry[];
	networkEntries: NetworkEntry[];
};

/** A fresh, empty bridge state. The passive default mode is `"none"`. */
export function emptyBridgeState(): BrowserBridgeState {
	return {
		mode: "none",
		comments: [],
		picks: [],
		consoleEntries: [],
		networkEntries: [],
	};
}

/** Build a {@link CommentPin} from a `comment-added` bridge message. */
function pinFromComment(
	id: string,
	text: string,
	selection: BridgeSelection,
): CommentPin {
	return {
		id,
		selector: selection.selector,
		text,
		rect: selection.rect,
		outerHTML: selection.outerHTML,
		resolved: true,
	};
}

/**
 * Pure reducer: route a single {@link BridgeToHostMessage} into the right
 * bucket and return a NEW state (the input is never mutated). `capture-result`
 * is handled out of band (it resolves a pending capture promise), so it is a
 * no-op here.
 */
export function ingestMessage(
	state: BrowserBridgeState,
	message: BridgeToHostMessage,
): BrowserBridgeState {
	switch (message.kind) {
		case "comment-added":
			return {
				...state,
				comments: addComment(
					state.comments,
					pinFromComment(message.id, message.text, message.selection),
				),
			};
		case "element-picked":
			return { ...state, picks: [...state.picks, message.selection] };
		case "console-error":
			return {
				...state,
				consoleEntries: [...state.consoleEntries, message.entry],
			};
		case "network-event":
			return {
				...state,
				networkEntries: [...state.networkEntries, message.entry],
			};
		case "capture-result":
			return state;
	}
}

export type BrowserBridgeStore = BrowserBridgeState & {
	setMode: (mode: BridgeMode) => void;
	ingest: (message: BridgeToHostMessage) => void;
	removeComment: (id: string) => void;
	reset: () => void;
};

/** Create a fresh, isolated Zustand store for one browser surface. */
export function createBrowserBridgeStore() {
	return create<BrowserBridgeStore>((set) => ({
		...emptyBridgeState(),
		setMode: (mode) => set({ mode }),
		ingest: (message) => set((state) => ingestMessage(state, message)),
		removeComment: (id) =>
			set((state) => ({
				comments: state.comments.filter((pin) => pin.id !== id),
			})),
		reset: () => set(emptyBridgeState()),
	}));
}

export type UseBrowserBridgeStore = ReturnType<typeof createBrowserBridgeStore>;
