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

// Folder icons are desaturated to a consistent set (no per-name color, no blue)
// and darkened toward black in light themes; in dark themes we keep them bright
// enough to stay legible against the dark tree background.
export const FOLDER_ICON_CLASS =
	"size-4 shrink-0 grayscale brightness-[0.35] dark:brightness-100";
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

export function getCachedFolderIcon(open: boolean): string {
	const key = open ? "1" : "0";
	const cached = folderIconCache.get(key);
	if (cached) return cached;
	// Always use the generic "folder" icon (empty name → no special mapping) so
	// every folder renders identically. Per-name Material icons (src/, .github/,
	// etc.) ship different base colors, which read as inconsistent once tinted.
	const icon = getMaterialFolderIcon("", open || undefined);
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
