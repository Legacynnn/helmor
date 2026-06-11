// Keyboard navigation for the Git tab: with focus anywhere in the changes
// list, ArrowUp/Down walk the visible file rows and open each one's diff in
// the editor's single preview tab; Enter pins the current preview.
import { type KeyboardEvent, useCallback, useMemo } from "react";
import {
	type ActiveEditorTarget,
	type DiffOpenOptions,
	INDEX_REF,
} from "@/lib/editor-session";
import type { ChangeRow } from "./shared";

export type ChangesNavEntry = {
	area: "staged" | "unstaged" | "committed";
	path: string;
	absolutePath: string;
	fileStatus: ChangeRow["status"];
	originalRef?: string;
	modifiedRef?: string;
};

export function buildNavEntries({
	stagedChanges,
	unstagedChanges,
	committedChanges,
	stagedOpen,
	changesOpen,
	branchDiffOpen,
	targetBranch,
}: {
	stagedChanges: ChangeRow[];
	unstagedChanges: ChangeRow[];
	committedChanges: ChangeRow[];
	stagedOpen: boolean;
	changesOpen: boolean;
	branchDiffOpen: boolean;
	targetBranch: string | null;
}): ChangesNavEntry[] {
	const entries: ChangesNavEntry[] = [];
	if (stagedOpen) {
		for (const change of stagedChanges) {
			entries.push({
				area: "staged",
				path: change.path,
				absolutePath: change.absolutePath,
				fileStatus: change.status,
				originalRef: "HEAD",
				modifiedRef: INDEX_REF,
			});
		}
	}
	if (changesOpen) {
		for (const change of unstagedChanges) {
			entries.push({
				area: "unstaged",
				path: change.path,
				absolutePath: change.absolutePath,
				fileStatus: change.status,
				originalRef: INDEX_REF,
				modifiedRef: undefined,
			});
		}
	}
	if (branchDiffOpen) {
		for (const change of committedChanges) {
			entries.push({
				area: "committed",
				path: change.path,
				absolutePath: change.absolutePath,
				fileStatus: change.status,
				originalRef: targetBranch ?? undefined,
				modifiedRef: "HEAD",
			});
		}
	}
	return entries;
}

function findActiveIndex(
	entries: ChangesNavEntry[],
	activeEditor: ActiveEditorTarget | null | undefined,
): number {
	if (!activeEditor) return -1;
	return entries.findIndex(
		(entry) =>
			entry.absolutePath === activeEditor.path &&
			entry.originalRef === activeEditor.originalRef &&
			entry.modifiedRef === activeEditor.modifiedRef,
	);
}

function scrollEntryIntoView(entry: ChangesNavEntry) {
	const row = document.querySelector(
		`[data-nav-area="${entry.area}"] [data-change-path="${CSS.escape(entry.path)}"]`,
	);
	row?.scrollIntoView({ block: "nearest" });
}

export function useChangesNav({
	entries,
	activeEditor,
	onOpenEditorFile,
}: {
	entries: ChangesNavEntry[];
	activeEditor: ActiveEditorTarget | null | undefined;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
}) {
	const activeIndex = useMemo(
		() => findActiveIndex(entries, activeEditor),
		[entries, activeEditor],
	);

	return useCallback(
		(event: KeyboardEvent) => {
			if (entries.length === 0) return;
			// Don't hijack keys while a row action button or input has focus
			// modifiers held (e.g. Mod+ArrowDown elsewhere).
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			const openEntry = (entry: ChangesNavEntry, preview: boolean) => {
				onOpenEditorFile(entry.absolutePath, {
					fileStatus: entry.fileStatus,
					originalRef: entry.originalRef,
					modifiedRef: entry.modifiedRef,
					preview,
				});
				scrollEntryIntoView(entry);
			};

			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				const delta = event.key === "ArrowDown" ? 1 : -1;
				const next =
					activeIndex === -1
						? delta === 1
							? 0
							: entries.length - 1
						: Math.min(Math.max(activeIndex + delta, 0), entries.length - 1);
				if (next === activeIndex) return;
				openEntry(entries[next], true);
				return;
			}

			if (event.key === "Enter" && activeIndex !== -1) {
				event.preventDefault();
				event.stopPropagation();
				// Re-open non-preview — pins the preview tab.
				openEntry(entries[activeIndex], false);
			}
		},
		[entries, activeIndex, onOpenEditorFile],
	);
}
