import { useMemo } from "react";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import { useSettings } from "@/lib/settings";
import type { PanelTabId } from "./state";

/**
 * App-scoped Mod+Shift+1..4 — jump straight to a panel page from anywhere.
 */
export function usePanelShortcuts(onShowTab: (tab: PanelTabId) => void) {
	const { settings } = useSettings();
	const handlers = useMemo<ShortcutHandler[]>(
		() => [
			{ id: "panel.showFiles", callback: () => onShowTab("files") },
			{ id: "panel.showGit", callback: () => onShowTab("git") },
			{ id: "panel.showSearch", callback: () => onShowTab("search") },
			{ id: "panel.showActions", callback: () => onShowTab("actions") },
		],
		[onShowTab],
	);
	useAppShortcuts({ overrides: settings.shortcuts, handlers });
}
