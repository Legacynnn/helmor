import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai/file-tree";
import {
	FOLDER_ICON_CLASS,
	getCachedFileIcon,
	getCachedFolderIcon,
} from "@/features/inspector/panel/git/shared";
import type { WorkspaceTreeEntry } from "@/lib/api";
import { workspaceTreeQueryOptions } from "@/lib/query-client";
import { useCanvasWorkspace } from "../canvas-workspace-context";

type TreeNode = { entry: WorkspaceTreeEntry; children: TreeNode[] };

/** Nest a flat, path-sorted entry list into a directory tree. */
function buildTree(entries: WorkspaceTreeEntry[]): TreeNode[] {
	const byPath = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];
	const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
	for (const entry of sorted) {
		const node: TreeNode = { entry, children: [] };
		byPath.set(entry.path, node);
		const slash = entry.path.lastIndexOf("/");
		const parent = slash === -1 ? null : byPath.get(entry.path.slice(0, slash));
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	return roots;
}

function renderNodes(nodes: TreeNode[]) {
	const ordered = [...nodes].sort((a, b) => {
		if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1;
		return a.entry.name.localeCompare(b.entry.name);
	});
	return ordered.map((node) =>
		node.entry.isDir ? (
			<FileTreeFolder
				key={node.entry.path}
				path={node.entry.path}
				name={node.entry.name}
				icon={(open) => (
					<img
						src={getCachedFolderIcon(open)}
						alt=""
						className={FOLDER_ICON_CLASS}
					/>
				)}
			>
				{renderNodes(node.children)}
			</FileTreeFolder>
		) : (
			<FileTreeFile
				key={node.entry.path}
				path={node.entry.path}
				name={node.entry.name}
				icon={
					<img
						src={getCachedFileIcon(node.entry.name)}
						alt=""
						className="size-4 shrink-0"
					/>
				}
			/>
		),
	);
}

/** File-tree browser scoped to the workspace root. Selecting a file calls
 * `onSelect` with its workspace-relative path; folder toggles are swallowed.
 * Rendered inside the Editor panel as the right-hand pane. */
export function FileExplorer({
	selectedPath,
	onSelect,
}: {
	selectedPath?: string;
	onSelect: (filePath: string) => void;
}) {
	const { workspaceRootPath } = useCanvasWorkspace();
	const { data, isLoading } = useQuery({
		...workspaceTreeQueryOptions(workspaceRootPath ?? ""),
		enabled: !!workspaceRootPath,
	});

	const { tree, filepaths } = useMemo(() => {
		const entries = data?.entries ?? [];
		return {
			tree: buildTree(entries),
			filepaths: new Set(entries.filter((e) => !e.isDir).map((e) => e.path)),
		};
	}, [data]);

	const handleSelect = (path: string) => {
		if (filepaths.has(path)) onSelect(path); // ignore folder toggles
	};

	if (!workspaceRootPath) {
		return (
			<div className="flex size-full items-center justify-center p-4 text-center text-app-muted-foreground text-xs">
				Workspace has no working directory.
			</div>
		);
	}

	return (
		<div className="size-full overflow-auto p-1">
			{isLoading ? (
				<div className="p-3 text-app-muted-foreground text-xs">Loading…</div>
			) : tree.length === 0 ? (
				<div className="p-3 text-app-muted-foreground text-xs">No files.</div>
			) : (
				<FileTree
					className="border-0 bg-transparent"
					selectedPath={selectedPath}
					onSelect={handleSelect}
				>
					{renderNodes(tree)}
				</FileTree>
			)}
		</div>
	);
}
