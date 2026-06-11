// Tree presentation of a change list: builds a folder tree from the flat
// paths and renders it as a recursive, expandable node list.
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { DiffOpenOptions } from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import { ChangesRowsContextMenu } from "./context-menu";
import { ShinyFlash, StageActionSlot } from "./row-actions";
import {
	type ChangeRow,
	DIFF_ROW_RENDER_STYLE,
	getCachedFileIcon,
	getCachedFolderIcon,
	type StageActionKind,
} from "./shared";

type TreeNode = {
	name: string;
	path: string;
	children: Map<string, TreeNode>;
	file?: ChangeRow;
};

function buildTree(changes: ChangeRow[]): TreeNode {
	const root: TreeNode = { name: "", path: "", children: new Map() };

	for (const change of changes) {
		const parts = change.path.split("/");
		let current = root;
		let currentPath = "";
		for (let index = 0; index < parts.length - 1; index += 1) {
			const part = parts[index];
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			let child = current.children.get(part);
			if (!child) {
				child = {
					name: part,
					path: currentPath,
					children: new Map(),
				};
				current.children.set(part, child);
			}
			current = child;
		}
		current.children.set(change.name, {
			name: change.name,
			path: change.path,
			children: new Map(),
			file: change,
		});
	}

	return root;
}

export function ChangesTreeView({
	changes,
	editorMode,
	activeEditorPath,
	onOpenEditorFile,
	onOpenExternalEditor,
	flashingPaths,
	action,
	onStageAction,
	onDiscard,
	workspaceBranch,
	workspaceRemoteUrl,
}: {
	changes: ChangeRow[];
	editorMode: boolean;
	activeEditorPath?: string | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	onOpenExternalEditor: (path: string) => void;
	flashingPaths: Set<string>;
	action?: StageActionKind;
	onStageAction?: (path: string) => void;
	onDiscard?: (path: string) => void;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
}) {
	const tree = useMemo(() => buildTree(changes), [changes]);
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(collectFolderPaths(tree)),
	);

	const toggle = useCallback((path: string) => {
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}, []);

	return (
		<ChangesRowsContextMenu
			changes={changes}
			workspaceBranch={workspaceBranch}
			workspaceRemoteUrl={workspaceRemoteUrl}
		>
			<div className="py-0.5">
				<TreeNodeList
					nodes={tree.children}
					expanded={expanded}
					onToggle={toggle}
					depth={0}
					editorMode={editorMode}
					activeEditorPath={activeEditorPath}
					onOpenEditorFile={onOpenEditorFile}
					onOpenExternalEditor={onOpenExternalEditor}
					flashingPaths={flashingPaths}
					action={action}
					onStageAction={onStageAction}
					onDiscard={onDiscard}
					workspaceBranch={workspaceBranch}
					workspaceRemoteUrl={workspaceRemoteUrl}
				/>
			</div>
		</ChangesRowsContextMenu>
	);
}

function collectFolderPaths(node: TreeNode): string[] {
	const paths: string[] = [];
	for (const child of node.children.values()) {
		if (child.children.size > 0 && !child.file) {
			paths.push(child.path);
			paths.push(...collectFolderPaths(child));
		}
	}
	return paths;
}

function TreeNodeList({
	nodes,
	expanded,
	onToggle,
	depth,
	editorMode,
	activeEditorPath,
	onOpenEditorFile,
	onOpenExternalEditor,
	flashingPaths,
	action,
	onStageAction,
	onDiscard,
	workspaceBranch,
	workspaceRemoteUrl,
}: {
	nodes: Map<string, TreeNode>;
	expanded: Set<string>;
	onToggle: (path: string) => void;
	depth: number;
	editorMode: boolean;
	activeEditorPath?: string | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	onOpenExternalEditor: (path: string) => void;
	flashingPaths: Set<string>;
	action?: StageActionKind;
	onStageAction?: (path: string) => void;
	onDiscard?: (path: string) => void;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
}) {
	const sorted = useMemo(
		() =>
			[...nodes.values()].sort((left, right) => {
				const leftIsFolder = left.children.size > 0 && !left.file;
				const rightIsFolder = right.children.size > 0 && !right.file;
				if (leftIsFolder !== rightIsFolder) {
					return leftIsFolder ? -1 : 1;
				}
				return left.name.localeCompare(right.name);
			}),
		[nodes],
	);

	return (
		<>
			{sorted.map((node) => {
				const isFolder = node.children.size > 0 && !node.file;

				if (isFolder) {
					const isOpen = expanded.has(node.path);
					return (
						<div key={node.path}>
							<div
								className="flex cursor-interactive items-center gap-1 py-[1.5px] pr-2 text-muted-foreground transition-colors hover:bg-accent/60"
								style={{
									...DIFF_ROW_RENDER_STYLE,
									paddingLeft: `${depth * 12 + 8}px`,
								}}
								onClick={() => onToggle(node.path)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										onToggle(node.path);
									}
								}}
								tabIndex={0}
								role="treeitem"
								aria-expanded={isOpen}
							>
								<ChevronRightIcon
									className={cn(
										"size-3 shrink-0 transition-transform",
										isOpen && "rotate-90",
									)}
									strokeWidth={1.8}
								/>
								<img
									src={getCachedFolderIcon(node.name, isOpen)}
									alt=""
									className="size-4 shrink-0"
								/>
								<span className="truncate">{node.name}</span>
							</div>
							{isOpen && (
								<TreeNodeList
									nodes={node.children}
									expanded={expanded}
									onToggle={onToggle}
									depth={depth + 1}
									editorMode={editorMode}
									activeEditorPath={activeEditorPath}
									onOpenEditorFile={onOpenEditorFile}
									onOpenExternalEditor={onOpenExternalEditor}
									flashingPaths={flashingPaths}
									action={action}
									onStageAction={onStageAction}
									onDiscard={onDiscard}
									workspaceBranch={workspaceBranch}
									workspaceRemoteUrl={workspaceRemoteUrl}
								/>
							)}
						</div>
					);
				}

				const file = node.file;
				const selected = file?.absolutePath === activeEditorPath;
				const isFlashing = !!file && flashingPaths.has(file.path);

				return (
					<div
						key={node.path}
						className={cn(
							"group/row flex cursor-interactive items-center gap-1 py-[1.5px] pr-2 text-muted-foreground transition-colors hover:bg-accent/60",
							selected &&
								(editorMode
									? "bg-accent text-foreground"
									: "bg-muted/60 text-foreground"),
						)}
						style={{
							...DIFF_ROW_RENDER_STYLE,
							paddingLeft: `${depth * 12 + 22}px`,
						}}
						data-change-path={file?.path}
						role="treeitem"
						tabIndex={0}
						onClick={() =>
							file &&
							onOpenEditorFile(file.absolutePath, {
								fileStatus: file.status,
							})
						}
						onKeyDown={(event) => {
							if ((event.key === "Enter" || event.key === " ") && file) {
								event.preventDefault();
								onOpenEditorFile(file.absolutePath, {
									fileStatus: file.status,
								});
							}
						}}
					>
						<img
							src={getCachedFileIcon(node.name)}
							alt=""
							className="size-4 shrink-0"
						/>
						<ShinyFlash active={isFlashing}>{node.name}</ShinyFlash>
						{file && (
							<StageActionSlot
								file={file}
								action={action}
								onOpenExternalEditor={onOpenExternalEditor}
								onStageAction={onStageAction}
								onDiscard={onDiscard}
							/>
						)}
					</div>
				);
			})}
		</>
	);
}
