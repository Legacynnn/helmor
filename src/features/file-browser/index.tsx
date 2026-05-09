import { useMemo, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import { useSettings } from "@/lib/settings";

import { useTreeState } from "./hooks/use-tree-state";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import { Tree } from "./tree";

interface OpenFileInput {
	absolutePath: string;
	relativePath: string;
	fileName: string;
}

interface Props {
	workspaceRootPath: string | null;
	workspaceId: string | null;
	activeAbsolutePath: string | null;
	onOpenFile: (input: OpenFileInput) => void;
}

export function AllFilesPanel({
	workspaceRootPath,
	workspaceId,
	activeAbsolutePath,
	onOpenFile,
}: Props) {
	const [query, setQuery] = useState("");
	const trimmed = query.trim();
	const { settings } = useSettings();
	const { collapseAll } = useTreeState(workspaceId);
	const handlers = useMemo<ShortcutHandler[]>(
		() => [{ id: "fileBrowser.collapseAll", callback: collapseAll }],
		[collapseAll],
	);
	useAppShortcuts({ overrides: settings.shortcuts, handlers });

	return (
		<div
			className="flex h-full flex-col gap-1.5 px-2 py-1.5"
			data-focus-scope="fileBrowser"
		>
			<SearchInput value={query} onChange={setQuery} />
			<ScrollArea className="min-h-0 flex-1">
				{trimmed ? (
					<SearchResults
						workspaceRootPath={workspaceRootPath}
						query={trimmed}
						onOpenFile={onOpenFile}
					/>
				) : (
					<Tree
						workspaceRootPath={workspaceRootPath}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
						activeAbsolutePath={activeAbsolutePath}
					/>
				)}
			</ScrollArea>
		</div>
	);
}
