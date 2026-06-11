export const PANEL_TAB_IDS = ["files", "git", "search", "actions"] as const;

export type PanelTabId = (typeof PANEL_TAB_IDS)[number];

export const INSPECTOR_PANEL_TAB_STORAGE_KEY =
	"helmor.workspaceInspectorPanelTab";

export function isPanelTabId(value: string | null): value is PanelTabId {
	return value !== null && (PANEL_TAB_IDS as readonly string[]).includes(value);
}

export function getInitialPanelTab(): PanelTabId {
	if (typeof window === "undefined") {
		return "git";
	}
	try {
		const stored = window.localStorage.getItem(INSPECTOR_PANEL_TAB_STORAGE_KEY);
		return isPanelTabId(stored) ? stored : "git";
	} catch {
		return "git";
	}
}
