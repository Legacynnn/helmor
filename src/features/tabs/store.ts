import type { FileTab, FileTabOpener, TabId } from "./types";

type FileTabId = Extract<TabId, { kind: "file" }>;

interface OpenInput {
	absolutePath: string;
	relativePath: string;
	fileName: string;
	opener: FileTabOpener;
}

export interface WorkspaceTabsStore {
	getTabs(workspaceId: string): FileTab[];
	openFileTab(workspaceId: string, input: OpenInput): FileTabId;
	closeFileTab(workspaceId: string, id: TabId): void;
	setDirty(workspaceId: string, id: TabId, dirty: boolean): void;
	listAllDirty(): Array<{ workspaceId: string; tab: FileTab }>;
	subscribe(listener: () => void): () => void;
}

export function createWorkspaceTabsStore(): WorkspaceTabsStore {
	const tabs = new Map<string, FileTab[]>();
	const listeners = new Set<() => void>();

	const notify = () => {
		for (const fn of listeners) fn();
	};

	const get = (workspaceId: string) => tabs.get(workspaceId) ?? [];

	return {
		getTabs: (workspaceId) => get(workspaceId).slice(),

		openFileTab(workspaceId, input) {
			const list = get(workspaceId).slice();
			const idx = list.findIndex((t) => t.absolutePath === input.absolutePath);
			const id: FileTabId = {
				kind: "file",
				absolutePath: input.absolutePath,
			};
			if (idx >= 0) {
				list[idx] = { ...list[idx], opener: input.opener };
			} else {
				list.push({
					kind: "file",
					workspaceId,
					absolutePath: input.absolutePath,
					relativePath: input.relativePath,
					fileName: input.fileName,
					opener: input.opener,
					dirty: false,
				});
			}
			tabs.set(workspaceId, list);
			notify();
			return id;
		},

		closeFileTab(workspaceId, id) {
			if (id.kind !== "file") return;
			const list = get(workspaceId).filter(
				(t) => t.absolutePath !== id.absolutePath,
			);
			tabs.set(workspaceId, list);
			notify();
		},

		setDirty(workspaceId, id, dirty) {
			if (id.kind !== "file") return;
			const list = get(workspaceId).map((t) =>
				t.absolutePath === id.absolutePath ? { ...t, dirty } : t,
			);
			tabs.set(workspaceId, list);
			notify();
		},

		listAllDirty() {
			const out: Array<{ workspaceId: string; tab: FileTab }> = [];
			for (const [workspaceId, list] of tabs.entries()) {
				for (const tab of list) {
					if (tab.dirty) out.push({ workspaceId, tab });
				}
			}
			return out;
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
