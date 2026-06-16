// Browser session controller: owns the in-app browser surface's tab list and
// the enter/exit-browser-mode transitions. Mirrors
// `use-editor-session-controller.tsx` — the conversation/editor/browser
// view-mode switch lives in the selection controller; this controller drives
// the actual tab state.
//
// Phase 1 keeps `navigate`/tab state purely local (no webview IPC yet); the
// content-webview wiring lands once the rendering architecture is settled.
import { useCallback, useState } from "react";
import {
	type BrowserTab,
	closeTab,
	openTab,
} from "@/features/browser/tab-model";
import { normalizeUrlInfo } from "@/features/browser/url/normalize-url";
import { useBrowserTabPersistence } from "@/shell/controllers/use-browser-tab-persistence";

export type BrowserLayoutState = "split" | "expanded";

export type BrowserSessionActions = {
	openUrl(url: string): void;
	selectTab(id: string): void;
	closeTab(id: string): void;
	navigate(url: string): void;
	/** Retry a tab over plain http after an auto-upgraded https load failed. */
	fallbackToHttp(tabId: string, httpUrl: string): void;
	/** Clear a tab's loading flag (load finished). */
	setTabLoaded(tabId: string): void;
	/** Set the companion-panel layout explicitly. */
	setLayout(layout: BrowserLayoutState): void;
	/** Flip between split and expanded layouts. */
	toggleExpand(): void;
	exit(): void;
};

export type BrowserSessionController = {
	state: {
		workspaceId: string | null;
		tabs: BrowserTab[];
		activeTabId: string | null;
		layout: BrowserLayoutState;
	};
	actions: BrowserSessionActions;
};

export type BrowserSessionControllerDeps = {
	selectedWorkspaceId: string | null;
	// Mode transitions are coordinated through the selection controller — the
	// browser controller asks AppShell to enter or exit browser mode here.
	enterBrowserMode(): void;
	exitBrowserMode(): void;
};

export function useBrowserSessionController(
	deps: BrowserSessionControllerDeps,
): BrowserSessionController {
	const [tabs, setTabs] = useState<BrowserTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const [layout, setLayout] = useState<BrowserLayoutState>("split");

	const { selectedWorkspaceId, enterBrowserMode, exitBrowserMode } = deps;

	// Hydrate from / debounce-persist to the DB for the active workspace.
	const hydrate = useCallback(
		(nextTabs: BrowserTab[], nextActiveId: string | null) => {
			setTabs(nextTabs);
			setActiveTabId(nextActiveId);
		},
		[],
	);
	useBrowserTabPersistence({
		workspaceId: selectedWorkspaceId,
		tabs,
		activeTabId,
		hydrate,
	});

	const openUrl = useCallback(
		(url: string) => {
			const info = normalizeUrlInfo(url);
			const normalized = info?.url ?? url;
			const id = crypto.randomUUID();
			setTabs((cur) =>
				openTab(cur, {
					id,
					url: normalized,
					title: normalized,
					loading: true,
					autoUpgradedHttps: info?.autoUpgradedHttps ?? false,
				}),
			);
			setActiveTabId(id);
			setLayout("split");
			enterBrowserMode();
		},
		[enterBrowserMode],
	);

	const closeTabAction = useCallback(
		(id: string) => {
			setActiveTabId((curActiveId) => {
				const { tabs: next, nextActiveId } = closeTab(
					tabs,
					id,
					curActiveId ?? "",
				);
				setTabs(next);
				if (next.length === 0) exitBrowserMode();
				return nextActiveId;
			});
		},
		[tabs, exitBrowserMode],
	);

	const navigate = useCallback((url: string) => {
		const info = normalizeUrlInfo(url);
		const normalized = info?.url ?? url;
		const autoUpgradedHttps = info?.autoUpgradedHttps ?? false;
		setActiveTabId((curActiveId) => {
			setTabs((cur) =>
				cur.map((t) =>
					t.id === curActiveId
						? { ...t, url: normalized, loading: true, autoUpgradedHttps }
						: t,
				),
			);
			return curActiveId;
		});
	}, []);

	// The https→http fallback: retry the active tab over plain http when an
	// auto-upgraded https load failed. The retry target is a plain-http URL, so
	// it is no longer eligible for another fallback (autoUpgradedHttps = false).
	const fallbackToHttp = useCallback((tabId: string, httpUrl: string) => {
		setTabs((cur) =>
			cur.map((t) =>
				t.id === tabId
					? { ...t, url: httpUrl, loading: true, autoUpgradedHttps: false }
					: t,
			),
		);
	}, []);

	// Clear a tab's loading flag (driven by the BrowserLoadFinished UI-sync event).
	const setTabLoaded = useCallback((tabId: string) => {
		setTabs((cur) =>
			cur.map((t) => (t.id === tabId ? { ...t, loading: false } : t)),
		);
	}, []);

	const toggleExpand = useCallback(() => {
		setLayout((cur) => (cur === "expanded" ? "split" : "expanded"));
	}, []);

	return {
		state: { workspaceId: selectedWorkspaceId, tabs, activeTabId, layout },
		actions: {
			openUrl,
			// D11: one live child-webview; selecting a tab only flips activeTabId.
			// The single content webview is re-navigated by `ContentHost`'s
			// url-change effect — there is never more than one live webview.
			selectTab: setActiveTabId,
			closeTab: closeTabAction,
			navigate,
			fallbackToHttp,
			setTabLoaded,
			setLayout,
			toggleExpand,
			exit: exitBrowserMode,
		},
	};
}
