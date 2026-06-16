// DB-backed persistence for the browser surface's tab list. Split out of
// `use-browser-session-controller.tsx` so the controller stays focused on the
// in-memory tab state machine. Two halves:
//   1. Hydrate — load the persisted tab set for the active workspace via a
//      TanStack query (`browserTabs` key) and replay it into the controller's
//      state once per workspace.
//   2. Persist — debounce-save the current tabs whenever they change, keyed off
//      the workspace, so rapid open/close/navigate bursts collapse to one write.
// Cross-window tab sync (a second window editing the same workspace's tabs) is
// intentionally deferred — see the TODO in `use-ui-sync-bridge.ts`.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { BrowserTab } from "@/features/browser/tab-model";
import {
	type BrowserTabRow,
	browserListTabs,
	browserPersistTabs,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

const PERSIST_DEBOUNCE_MS = 400;

/** Map a persisted DB row to the in-memory tab shape. */
function rowToTab(row: BrowserTabRow): BrowserTab {
	return {
		id: row.id,
		url: row.url,
		title: row.title ?? row.url,
		loading: false,
	};
}

export type BrowserTabPersistenceDeps = {
	workspaceId: string | null;
	tabs: BrowserTab[];
	activeTabId: string | null;
	/** Replay the persisted tab set into the controller's state. */
	hydrate(tabs: BrowserTab[], activeTabId: string | null): void;
};

export function useBrowserTabPersistence({
	workspaceId,
	tabs,
	activeTabId,
	hydrate,
}: BrowserTabPersistenceDeps): void {
	const tabsQuery = useQuery({
		queryKey: workspaceId
			? helmorQueryKeys.browserTabs(workspaceId)
			: ["browserTabs", "none"],
		queryFn: () => browserListTabs(workspaceId as string),
		enabled: workspaceId !== null,
		staleTime: Infinity,
	});

	// Hydrate once per workspace: replay the persisted rows the first time the
	// query for a given workspace resolves. `hydratedWorkspaceRef` guards against
	// re-replaying on every refetch (which would clobber local edits).
	const hydratedWorkspaceRef = useRef<string | null>(null);
	const hydrateRef = useRef(hydrate);
	hydrateRef.current = hydrate;
	useEffect(() => {
		if (!workspaceId) return;
		if (hydratedWorkspaceRef.current === workspaceId) return;
		if (!tabsQuery.isSuccess) return;
		const rows = tabsQuery.data ?? [];
		hydratedWorkspaceRef.current = workspaceId;
		// An empty persisted set must not clobber tabs the user opened before the
		// load landed (e.g. the toolbar "Open browser" button mid-hydration). Only
		// replay when there is actually something to restore.
		if (rows.length === 0) return;
		const nextTabs = rows.map(rowToTab);
		const activeRow = rows.find((row) => row.active) ?? rows[0] ?? null;
		hydrateRef.current(nextTabs, activeRow?.id ?? null);
	}, [workspaceId, tabsQuery.isSuccess, tabsQuery.data]);

	// Debounced persist: collapse rapid tab mutations into one write. Skipped
	// until the workspace has hydrated so the initial empty state can't wipe the
	// persisted set before the load lands.
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (!workspaceId) return;
		if (hydratedWorkspaceRef.current !== workspaceId) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			void browserPersistTabs(
				workspaceId,
				tabs.map((tab, index) => ({
					url: tab.url,
					title: tab.title,
					position: index,
					active: tab.id === activeTabId,
				})),
			);
		}, PERSIST_DEBOUNCE_MS);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [workspaceId, tabs, activeTabId]);
}
