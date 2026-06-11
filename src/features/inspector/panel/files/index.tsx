// The inspector's Files tab: a gitignore-aware tree of the whole workspace.
// Files/folders with uncommitted edits are tinted with the modified-status
// color; clicking a file opens it in the editor surface.
import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	ActiveEditorTarget,
	DiffOpenOptions,
	InspectorFileItem,
} from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import {
	DIFF_ROW_RENDER_STYLE,
	getCachedFileIcon,
	getCachedFolderIcon,
} from "../git/shared";
import { type FileTreeNode, useFileTree } from "./use-file-tree";

type FilesTabProps = {
	workspaceRootPath: string | null;
	changes: InspectorFileItem[];
	editorMode: boolean;
	activeEditor?: ActiveEditorTarget | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
};

function FilesTabImpl({
	workspaceRootPath,
	changes,
	editorMode,
	activeEditor,
	onOpenEditorFile,
}: FilesTabProps) {
	const { roots, editedPaths, truncated, isLoading } = useFileTree(
		workspaceRootPath,
		changes,
	);
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

	const handleOpenFile = useCallback(
		(relativePath: string) => {
			if (!workspaceRootPath) return;
			onOpenEditorFile(`${workspaceRootPath}/${relativePath}`);
		},
		[workspaceRootPath, onOpenEditorFile],
	);

	if (!workspaceRootPath) {
		return (
			<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
				No workspace selected.
			</div>
		);
	}

	return (
		<ScrollArea
			aria-label="Files panel body"
			className="min-h-0 flex-1 bg-muted/20 font-mono text-mini"
		>
			<div className="py-0.5" role="tree">
				<FileNodeList
					nodes={roots}
					depth={0}
					expanded={expanded}
					onToggle={toggle}
					editedPaths={editedPaths}
					editorMode={editorMode}
					activeEditorPath={activeEditor?.path ?? null}
					workspaceRootPath={workspaceRootPath}
					onOpenFile={handleOpenFile}
				/>
			</div>
			{!isLoading && roots.length === 0 && (
				<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
					No files in this workspace.
				</div>
			)}
			{truncated && (
				<div className="px-3 py-2 text-micro text-muted-foreground">
					Tree truncated — too many files to display.
				</div>
			)}
		</ScrollArea>
	);
}

function FileNodeList({
	nodes,
	depth,
	expanded,
	onToggle,
	editedPaths,
	editorMode,
	activeEditorPath,
	workspaceRootPath,
	onOpenFile,
}: {
	nodes: FileTreeNode[];
	depth: number;
	expanded: Set<string>;
	onToggle: (path: string) => void;
	editedPaths: Set<string>;
	editorMode: boolean;
	activeEditorPath: string | null;
	workspaceRootPath: string;
	onOpenFile: (relativePath: string) => void;
}) {
	return (
		<>
			{nodes.map((node) => {
				// Same yellow as the Git tab's modified-status badge.
				const isEdited = editedPaths.has(node.path);

				if (node.isDir) {
					const isOpen = expanded.has(node.path);
					return (
						<div key={node.path}>
							<div
								className={cn(
									"flex cursor-interactive items-center gap-1 py-[1.5px] pr-2 text-muted-foreground transition-colors hover:bg-accent/60",
									isEdited && "text-yellow-500",
								)}
								style={{
									...DIFF_ROW_RENDER_STYLE,
									paddingLeft: `${depth * 12 + 8}px`,
								}}
								onClick={() => onToggle(node.path)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
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
								<FileNodeList
									nodes={node.children}
									depth={depth + 1}
									expanded={expanded}
									onToggle={onToggle}
									editedPaths={editedPaths}
									editorMode={editorMode}
									activeEditorPath={activeEditorPath}
									workspaceRootPath={workspaceRootPath}
									onOpenFile={onOpenFile}
								/>
							)}
						</div>
					);
				}

				const absolutePath = `${workspaceRootPath}/${node.path}`;
				const selected = absolutePath === activeEditorPath;
				return (
					<div
						key={node.path}
						className={cn(
							"flex cursor-interactive items-center gap-1 py-[1.5px] pr-2 text-muted-foreground transition-colors hover:bg-accent/60",
							isEdited && "text-yellow-500",
							selected &&
								(editorMode
									? "bg-accent text-foreground"
									: "bg-muted/60 text-foreground"),
							selected && isEdited && "text-yellow-500",
						)}
						style={{
							...DIFF_ROW_RENDER_STYLE,
							paddingLeft: `${depth * 12 + 22}px`,
						}}
						role="treeitem"
						tabIndex={0}
						onClick={() => onOpenFile(node.path)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onOpenFile(node.path);
							}
						}}
					>
						<img
							src={getCachedFileIcon(node.name)}
							alt=""
							className="size-4 shrink-0"
						/>
						<span className="truncate">{node.name}</span>
					</div>
				);
			})}
		</>
	);
}

// memo so panel-level re-renders that don't touch Files props skip the tree.
export const FilesTab = memo(FilesTabImpl);
