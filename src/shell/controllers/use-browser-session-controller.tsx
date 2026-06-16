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

export type BrowserSessionActions = {
	openUrl(url: string): void;
	selectTab(id: string): void;
	closeTab(id: string): void;
	navigate(url: string): void;
	exit(): void;
};

export type BrowserSessionController = {
	state: { tabs: BrowserTab[]; activeTabId: string | null };
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

	const { enterBrowserMode, exitBrowserMode } = deps;

	const openUrl = useCallback(
		(url: string) => {
			const id = crypto.randomUUID();
			setTabs((cur) => openTab(cur, { id, url, title: url, loading: true }));
			setActiveTabId(id);
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
		setActiveTabId((curActiveId) => {
			setTabs((cur) =>
				cur.map((t) => (t.id === curActiveId ? { ...t, url } : t)),
			);
			return curActiveId;
		});
	}, []);

	return {
		state: { tabs, activeTabId },
		actions: {
			openUrl,
			selectTab: setActiveTabId,
			closeTab: closeTabAction,
			navigate,
			exit: exitBrowserMode,
		},
	};
}
