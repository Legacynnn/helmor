import { useMemo, useSyncExternalStore } from "react";

import { createWorkspaceTabsStore, type WorkspaceTabsStore } from "../store";
import type { FileTab, FileTabOpener, TabId } from "../types";

let singleton: WorkspaceTabsStore | null = null;
const EMPTY_FILE_TABS: FileTab[] = [];

function getStore(): WorkspaceTabsStore {
	if (!singleton) singleton = createWorkspaceTabsStore();
	return singleton;
}

export function useWorkspaceFileTabs(workspaceId: string | null): FileTab[] {
	const store = getStore();
	return useSyncExternalStore(
		(cb) => store.subscribe(cb),
		() => (workspaceId ? store.getTabs(workspaceId) : EMPTY_FILE_TABS),
		() => EMPTY_FILE_TABS,
	);
}

export function useWorkspaceTabsActions() {
	const store = getStore();
	return useMemo(
		() => ({
			openFileTab: (
				workspaceId: string,
				input: {
					absolutePath: string;
					relativePath: string;
					fileName: string;
					opener: FileTabOpener;
				},
			) => store.openFileTab(workspaceId, input),
			closeFileTab: (workspaceId: string, id: TabId) =>
				store.closeFileTab(workspaceId, id),
			setDirty: (workspaceId: string, id: TabId, dirty: boolean) =>
				store.setDirty(workspaceId, id, dirty),
			listAllDirty: () => store.listAllDirty(),
		}),
		[store],
	);
}

// Exposed for tests only.
export function __resetTabsStoreForTests() {
	singleton = null;
}
