import { useMemo } from "react";
import type { ShortcutId } from "@/features/shortcuts/types";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import type { CanvasPanelType } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useCanvasCreateStore } from "./canvas-create-store";

/** Each create shortcut arms its panel type for the drag-to-place flow — exactly
 * like clicking the matching rail button (`toggle` is a toggle, so pressing the
 * same key again disarms). Active only while the `canvas` focus scope is engaged
 * (the surface sets `data-focus-scope="canvas"`), so they never fire elsewhere. */
const CREATE_SHORTCUTS: ReadonlyArray<{
	id: ShortcutId;
	type: CanvasPanelType;
}> = [
	{ id: "canvas.newConversation", type: "conversation" },
	{ id: "canvas.newTerminal", type: "terminal" },
	{ id: "canvas.newNotes", type: "notes" },
	{ id: "canvas.newDrawing", type: "drawing" },
	{ id: "canvas.newEditor", type: "editor" },
	{ id: "canvas.newFiles", type: "file-manager" },
	{ id: "canvas.newGit", type: "git" },
];

/** Wire ⌘⌥C/N/D/E/G + ⌘⇧T to arm the corresponding new-panel create flow. */
export function useCanvasCreateShortcuts(): void {
	const { settings } = useSettings();
	const handlers = useMemo<ShortcutHandler[]>(
		() =>
			CREATE_SHORTCUTS.map(({ id, type }) => ({
				id,
				callback: () => useCanvasCreateStore.getState().toggle(type),
			})),
		[],
	);
	useAppShortcuts({ overrides: settings.shortcuts, handlers });
}
