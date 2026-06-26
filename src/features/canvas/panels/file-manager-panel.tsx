import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createShapeId, type TLShapeId, useEditor } from "tldraw";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai/file-tree";
import type { WorkspaceTreeEntry } from "@/lib/api";
import { workspaceTreeQueryOptions } from "@/lib/query-client";
import { useCanvasWorkspace } from "../canvas-workspace-context";
import { stringifyPanelConfig } from "../panel-config";
import {
	PANEL_DEFAULT_HEIGHT,
	PANEL_DEFAULT_WIDTH,
	type PanelShape,
} from "../shapes/panel-shape";

type TreeNode = {
	entry: WorkspaceTreeEntry;
	children: TreeNode[];
};

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
	// Folders first, then files, each alphabetical.
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
 * a new Editor panel placed beside this one (or reuses an Editor panel this
 * one already feeds — Phase 4 keeps it simple: always open a fresh editor). */
export function FileManagerPanelBody({ shape }: { shape: PanelShape }) {
	const editor = useEditor();
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

	const openFile = (filePath: string) => {
		if (!filepaths.has(filePath)) return; // folder toggle, not a file
		const self = editor.getShape(shape.id as TLShapeId);
		const bounds = editor.getShapePageBounds(shape.id as TLShapeId);
		const x = bounds ? bounds.x + bounds.w + 32 : (self?.x ?? 0) + 32;
		const y = bounds ? bounds.y : (self?.y ?? 0);
		const id = createShapeId();
		editor.createShape<PanelShape>({
			id,
			type: "panel",
			x,
			y,
			props: {
				w: PANEL_DEFAULT_WIDTH,
				h: PANEL_DEFAULT_HEIGHT,
				panelType: "editor",
				title: filePath.split("/").pop() ?? filePath,
				config: stringifyPanelConfig({ filePath }),
				locked: false,
			},
		});
		editor.select(id);
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
