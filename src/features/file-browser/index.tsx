import { useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

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

	return (
		<div className="flex h-full flex-col gap-1.5 px-2 py-1.5">
			<SearchInput value={query} onChange={setQuery} />
			<ScrollArea className="flex-1">
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
