import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai/file-tree";
import type { WorkspaceTreeEntry } from "@/lib/api";
import { workspaceTreeQueryOptions } from "@/lib/query-client";
import { useCanvasActions } from "../canvas-actions-context";
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
			>
				{renderNodes(node.children)}
			</FileTreeFolder>
		) : (
			<FileTreeFile
				key={node.entry.path}
				path={node.entry.path}
				name={node.entry.name}
			/>
		),
	);
}

/** File-tree browser scoped to the workspace root. Clicking a file opens it in
 * a new Editor panel. */
export function FileManagerPanelBody({ nodeId }: { nodeId: string }) {
	const { addPanel } = useCanvasActions();
	const { workspaceRootPath } = useCanvasWorkspace();
	void nodeId;
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

	const openFile = (filePath: string) => {
		if (!filepaths.has(filePath)) return; // folder toggle, not a file
		void addPanel("editor", { config: { filePath } });
	};

	if (!workspaceRootPath) {
		return (
			<div className="flex size-full items-center justify-center p-4 text-center text-app-muted-foreground text-xs">
				Workspace has no working directory.
			</div>
		);
	}

	return (
		<div className="size-full overflow-auto bg-app-base p-1">
			{isLoading ? (
				<div className="p-3 text-app-muted-foreground text-xs">Loading…</div>
			) : tree.length === 0 ? (
				<div className="p-3 text-app-muted-foreground text-xs">No files.</div>
			) : (
				<FileTree className="border-0 bg-transparent" onSelect={openFile}>
					{renderNodes(tree)}
				</FileTree>
			)}
		</div>
	);
}
