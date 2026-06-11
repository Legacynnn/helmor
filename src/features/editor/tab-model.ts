// Pure tab-list projection for the editor surface, with VS Code-style
// preview-tab semantics: at most one preview tab exists; opening another
// file in preview mode replaces it in place, while pinned tabs accumulate.
import type { EditorSessionState } from "@/lib/editor-session";

export type EditorFileTab = {
	id: string;
	session: EditorSessionState;
	preview: boolean;
};

export function normalizeEditorPath(path: string): string {
	return path.replace(/\\/g, "/");
}

export function getEditorTabId(session: EditorSessionState): string {
	return normalizeEditorPath(session.path);
}

/**
 * Project the next tab list for an incoming session.
 *
 * Rules:
 * 1. A tab with the same id updates in place; opening it non-preview (or
 *    with a dirty buffer) pins it.
 * 2. No same-id tab + preview open + an existing preview tab → the preview
 *    tab is replaced in place (same index, new id/session).
 * 3. Otherwise the session appends as a new tab.
 */
export function openInTabs(
	tabs: EditorFileTab[],
	session: EditorSessionState,
): EditorFileTab[] {
	const id = getEditorTabId(session);
	// Dirty buffers must never sit in the disposable preview slot.
	const preview = Boolean(session.preview) && !session.dirty;

	const existingIndex = tabs.findIndex((tab) => tab.id === id);
	if (existingIndex !== -1) {
		return tabs.map((tab, index) =>
			index === existingIndex
				? { id, session, preview: tab.preview && preview }
				: tab,
		);
	}

	if (preview) {
		const previewIndex = tabs.findIndex((tab) => tab.preview);
		if (previewIndex !== -1) {
			return tabs.map((tab, index) =>
				index === previewIndex ? { id, session, preview: true } : tab,
			);
		}
	}

	return [...tabs, { id, session, preview }];
}

/** Pin a tab (double-click on its title, or Enter from the changes list). */
export function pinTab(tabs: EditorFileTab[], id: string): EditorFileTab[] {
	return tabs.map((tab) => (tab.id === id ? { ...tab, preview: false } : tab));
}
