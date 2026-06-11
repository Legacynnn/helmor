// Shared constants, icon caches and row types for the inspector's Git
// panel (changes groups, tree/flat views, row actions).
import {
	getMaterialFileIcon,
	getMaterialFolderIcon,
} from "file-extension-icon-js";
import type { InspectorFileItem } from "@/lib/editor-session";

export const STATUS_COLORS: Record<InspectorFileItem["status"], string> = {
	M: "text-yellow-500",
	A: "text-green-500",
	D: "text-red-500",
};

const fileIconCache = new Map<string, string>();
const folderIconCache = new Map<string, string>();
export const DIFF_ROW_RENDER_STYLE = {
	contentVisibility: "auto",
	containIntrinsicSize: "auto 20px",
} as const;

export function getCachedFileIcon(name: string): string {
	const cached = fileIconCache.get(name);
	if (cached) return cached;
	const icon = getMaterialFileIcon(name);
	fileIconCache.set(name, icon);
	return icon;
}

export function getCachedFolderIcon(name: string, open: boolean): string {
	const key = `${name}\0${open ? "1" : "0"}`;
	const cached = folderIconCache.get(key);
	if (cached) return cached;
	const icon = getMaterialFolderIcon(name, open || undefined);
	folderIconCache.set(key, icon);
	return icon;
}

/** A change item already projected into a single area's line counts.
 * `insertions`/`deletions` are derived from the corresponding area
 * (staged / unstaged / committed) — never used elsewhere. */
export type ChangeRow = InspectorFileItem & {
	insertions: number;
	deletions: number;
};

export type StageActionKind = "stage" | "unstage";
