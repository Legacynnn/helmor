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
	/**
	 * True when the page blocked bridge injection (strict CSP). The surface
	 * switches to the screenshot-annotation fallback while this is set.
	 */
	injectionBlocked: boolean;
};

/** A fresh, empty bridge state. The passive default mode is `"none"`. */
export function emptyBridgeState(): BrowserBridgeState {
	return {
		mode: "none",
		comments: [],
		picks: [],
		consoleEntries: [],
		networkEntries: [],
		injectionBlocked: false,
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
		computedStyles: selection.computedStyles,
		cropPath: selection.cropPath ?? null,
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
		case "driver-result":
			// Driver results resolve a pending broker request host-side; nothing
			// to fold into the bridge store.
			return state;
	}
}

export type BrowserBridgeStore = BrowserBridgeState & {
	setMode: (mode: BridgeMode) => void;
	ingest: (message: BridgeToHostMessage) => void;
	hydrateComments: (comments: CommentPin[]) => void;
	removeComment: (id: string) => void;
	setInjectionBlocked: (blocked: boolean) => void;
	reset: () => void;
};

/** Create a fresh, isolated Zustand store for one browser surface. */
export function createBrowserBridgeStore() {
	return create<BrowserBridgeStore>((set) => ({
		...emptyBridgeState(),
		setMode: (mode) => set({ mode }),
		ingest: (message) => set((state) => ingestMessage(state, message)),
		hydrateComments: (comments) => set({ comments }),
		removeComment: (id) =>
			set((state) => ({
				comments: state.comments.filter((pin) => pin.id !== id),
			})),
		setInjectionBlocked: (injectionBlocked) => set({ injectionBlocked }),
		reset: () => set(emptyBridgeState()),
	}));
}

export type UseBrowserBridgeStore = ReturnType<typeof createBrowserBridgeStore>;

/**
 * Module-level registry mapping a workspace id to its mounted bridge store.
 *
 * The page → host bridge events arrive globally (through `UiMutationEvent` in
 * `use-ui-sync-bridge`), but each browser surface owns a per-mount store. The
 * registry bridges the two: a surface registers its store on mount, and the
 * global UI-sync handler routes inbound `BridgeToHostMessage`s to the right
 * store by workspace id. Keeping this OUT of React state avoids re-renders and
 * lets the non-component UI-sync bridge reach the store without prop drilling.
 */
const storeRegistry = new Map<string, UseBrowserBridgeStore>();

/** Register a workspace's bridge store. Returns an unregister cleanup. */
export function registerBridgeStore(
	workspaceId: string,
	store: UseBrowserBridgeStore,
): () => void {
	storeRegistry.set(workspaceId, store);
	return () => {
		if (storeRegistry.get(workspaceId) === store) {
			storeRegistry.delete(workspaceId);
		}
	};
}

/**
 * Route a single inbound bridge message to the registered store for
 * `workspaceId`. No-op when no surface is currently mounted for it (e.g. the
 * event arrived for a background workspace).
 */
export function ingestForWorkspace(
	workspaceId: string,
	message: BridgeToHostMessage,
): void {
	storeRegistry.get(workspaceId)?.getState().ingest(message);
}

/**
 * Flag the registered store for `workspaceId` as injection-blocked (or clear
 * it), driving the CSP screenshot-annotation fallback. No-op when no surface is
 * mounted for the workspace.
 */
export function setInjectionBlockedForWorkspace(
	workspaceId: string,
	blocked: boolean,
): void {
	storeRegistry.get(workspaceId)?.getState().setInjectionBlocked(blocked);
}
