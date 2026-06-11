import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { WorkspaceTreeEntry } from "@/lib/api";
import type { InspectorFileItem } from "@/lib/editor-session";
import { workspaceTreeQueryOptions } from "@/lib/query-client";

export type FileTreeNode = {
	name: string;
	/** Relative path, forward slashes. */
	path: string;
	isDir: boolean;
	children: FileTreeNode[];
};

/** Nest the backend's flat entry list into a tree, directories first. */
export function buildFileTree(entries: WorkspaceTreeEntry[]): FileTreeNode[] {
	const nodesByPath = new Map<string, FileTreeNode>();
	const roots: FileTreeNode[] = [];

	// Entries arrive sorted by path, so a parent directory always precedes
	// its children.
	for (const entry of entries) {
		const node: FileTreeNode = {
			name: entry.name,
			path: entry.path,
			isDir: entry.isDir,
			children: [],
		};
		nodesByPath.set(entry.path, node);
		const separatorIndex = entry.path.lastIndexOf("/");
		if (separatorIndex === -1) {
			roots.push(node);
			continue;
		}
		const parent = nodesByPath.get(entry.path.slice(0, separatorIndex));
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	const sortLevel = (nodes: FileTreeNode[]) => {
		nodes.sort((left, right) => {
			if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
			return left.name.localeCompare(right.name);
		});
		for (const node of nodes) {
			if (node.children.length > 0) sortLevel(node.children);
		}
	};
	sortLevel(roots);

	return roots;
}

/** Relative paths with uncommitted edits, expanded to every ancestor dir —
 * drives the yellow "modified" tint on files and their parent folders. */
export function buildEditedPaths(changes: InspectorFileItem[]): Set<string> {
	const edited = new Set<string>();
	for (const item of changes) {
		if (!item.stagedStatus && !item.unstagedStatus) continue;
		edited.add(item.path);
		let path = item.path;
		let separatorIndex = path.lastIndexOf("/");
		while (separatorIndex !== -1) {
			path = path.slice(0, separatorIndex);
			edited.add(path);
			separatorIndex = path.lastIndexOf("/");
		}
	}
	return edited;
}

export function useFileTree(
	workspaceRootPath: string | null,
	changes: InspectorFileItem[],
) {
	const treeQuery = useQuery({
		...workspaceTreeQueryOptions(workspaceRootPath ?? ""),
		enabled: !!workspaceRootPath,
	});

	const roots = useMemo(
		() => buildFileTree(treeQuery.data?.entries ?? []),
		[treeQuery.data],
	);
	const editedPaths = useMemo(() => buildEditedPaths(changes), [changes]);

	return {
		roots,
		editedPaths,
		truncated: treeQuery.data?.truncated ?? false,
		isLoading: treeQuery.isLoading,
	};
}
