import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listWorkspaceDir, type WorkspaceTreeEntry } from "@/lib/api";
import type { InspectorFileItem } from "@/lib/editor-session";
import { workspaceTreeQueryOptions } from "@/lib/query-client";

export type FileTreeNode = {
	name: string;
	/** Relative path, forward slashes. */
	path: string;
	isDir: boolean;
	/** True when git-ignored — rendered dimmed. */
	ignored: boolean;
	children: FileTreeNode[];
};

/** Nest the backend's flat entry list into a tree, directories first. */
export function buildFileTree(entries: WorkspaceTreeEntry[]): FileTreeNode[] {
	const nodesByPath = new Map<string, FileTreeNode>();
	const roots: FileTreeNode[] = [];

	// Sort by path so a parent directory always precedes its children — the
	// base query is already path-sorted, but lazily-loaded ignored children are
	// appended out of order, so we re-sort defensively. A path is always a
	// proper prefix of its descendants, so byte-order sorting keeps parents
	// first.
	const sorted =
		entries.length > 1
			? [...entries].sort((a, b) =>
					a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
				)
			: entries;

	for (const entry of sorted) {
		const node: FileTreeNode = {
			name: entry.name,
			path: entry.path,
			isDir: entry.isDir,
			ignored: entry.ignored,
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
	showIgnored: boolean,
) {
	const treeQuery = useQuery({
		...workspaceTreeQueryOptions(workspaceRootPath ?? ""),
		enabled: !!workspaceRootPath,
	});

	// Children of ignored directories, fetched on demand when the user expands
	// them (the base tree lists ignored dirs without descending). Keyed by the
	// directory's relative path.
	const [lazyChildren, setLazyChildren] = useState<
		Map<string, WorkspaceTreeEntry[]>
	>(() => new Map());

	// Drop all lazily-loaded children when the workspace changes — their paths
	// belong to the previous root.
	useEffect(() => {
		setLazyChildren(new Map());
	}, [workspaceRootPath]);

	const loadDir = useCallback(
		(relativePath: string) => {
			if (!workspaceRootPath) return;
			// Already loaded (or loading) → don't refetch.
			setLazyChildren((previous) => {
				if (previous.has(relativePath)) return previous;
				// Mark as loading with an empty list so repeat toggles are no-ops.
				const next = new Map(previous);
				next.set(relativePath, []);
				return next;
			});
			void listWorkspaceDir(workspaceRootPath, relativePath)
				.then((entries) => {
					setLazyChildren((previous) => {
						const next = new Map(previous);
						next.set(relativePath, entries);
						return next;
					});
				})
				.catch(() => {
					// Leave the empty placeholder so the dir simply shows no children
					// rather than retrying on every re-render.
				});
		},
		[workspaceRootPath],
	);

	const roots = useMemo(() => {
		const base = treeQuery.data?.entries ?? [];
		const lazy =
			lazyChildren.size > 0 ? Array.from(lazyChildren.values()).flat() : [];
		let entries = lazy.length > 0 ? base.concat(lazy) : base;
		if (!showIgnored) entries = entries.filter((entry) => !entry.ignored);
		return buildFileTree(entries);
	}, [treeQuery.data, lazyChildren, showIgnored]);

	const editedPaths = useMemo(() => buildEditedPaths(changes), [changes]);

	return {
		roots,
		editedPaths,
		truncated: treeQuery.data?.truncated ?? false,
		isLoading: treeQuery.isLoading,
		loadDir,
	};
}
