// The inspector's Files tab: a gitignore-aware tree of the whole workspace.
// Files/folders with uncommitted edits are tinted with the modified-status
// color; clicking a file opens it in the editor surface.
import { ChevronRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
	ActiveEditorTarget,
	DiffOpenOptions,
	InspectorFileItem,
} from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import {
	DIFF_ROW_RENDER_STYLE,
	FOLDER_ICON_CLASS,
	getCachedFileIcon,
	getCachedFolderIcon,
} from "../git/shared";
import { type FileTreeNode, useFileTree } from "./use-file-tree";

// Persisted preference for whether git-ignored entries appear in the Files
// tab. Stored globally (not per-workspace) so the choice follows the user.
const SHOW_IGNORED_KEY = "helmor.files.showIgnored";

function readShowIgnored(): boolean {
	try {
		// Default to showing them — matches the prior behaviour where ignored
		// entries were always listed (dimmed).
		return window.localStorage.getItem(SHOW_IGNORED_KEY) !== "0";
	} catch {
		return true;
	}
}

function writeShowIgnored(value: boolean) {
	try {
		window.localStorage.setItem(SHOW_IGNORED_KEY, value ? "1" : "0");
	} catch {
		// Private mode / storage disabled — preference just won't persist.
	}
}

type FilesTabProps = {
	workspaceRootPath: string | null;
	changes: InspectorFileItem[];
	editorMode: boolean;
	activeEditor?: ActiveEditorTarget | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	/** Plain (non-diff) open, preview-tab capable. Preferred when provided. */
	onOpenFileReference?: (
		path: string,
		line?: number,
		column?: number,
		options?: { preview?: boolean },
	) => void;
};

function FilesTabImpl({
	workspaceRootPath,
	changes,
	editorMode,
	activeEditor,
	onOpenEditorFile,
	onOpenFileReference,
}: FilesTabProps) {
	const [showIgnored, setShowIgnored] = useState(readShowIgnored);
	useEffect(() => {
		writeShowIgnored(showIgnored);
	}, [showIgnored]);

	const { roots, editedPaths, truncated, isLoading, loadDir } = useFileTree(
		workspaceRootPath,
		changes,
		showIgnored,
	);
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

	const toggle = useCallback(
		(node: FileTreeNode) => {
			setExpanded((previous) => {
				const next = new Set(previous);
				if (next.has(node.path)) {
					next.delete(node.path);
				} else {
					next.add(node.path);
					// Ignored directories aren't expanded by the base tree walk, so
					// fetch their children on first open. No-op once loaded.
					if (node.ignored && node.isDir) loadDir(node.path);
				}
				return next;
			});
		},
		[loadDir],
	);

	const handleOpenFile = useCallback(
		(relativePath: string) => {
			if (!workspaceRootPath) return;
			const absolutePath = `${workspaceRootPath}/${relativePath}`;
			// File-tree click = "look at the file", not "review a diff" — open
			// in plain editor mode as a preview tab when the action exists.
			if (onOpenFileReference) {
				onOpenFileReference(absolutePath, undefined, undefined, {
					preview: true,
				});
				return;
			}
			onOpenEditorFile(absolutePath);
		},
		[workspaceRootPath, onOpenEditorFile, onOpenFileReference],
	);

	if (!workspaceRootPath) {
		return (
			<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
				No workspace selected.
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center justify-end border-app-border/40 border-b px-2 py-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => setShowIgnored((value) => !value)}
							className="flex cursor-pointer items-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
							aria-label={
								showIgnored
									? "Hide git-ignored files"
									: "Show git-ignored files"
							}
							aria-pressed={showIgnored}
						>
							{showIgnored ? (
								<EyeIcon className="size-3.5" strokeWidth={1.8} />
							) : (
								<EyeOffIcon className="size-3.5" strokeWidth={1.8} />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="px-2 py-1 text-small">
						{showIgnored ? "Hide git-ignored files" : "Show git-ignored files"}
					</TooltipContent>
				</Tooltip>
			</div>
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
		</div>
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
	onToggle: (node: FileTreeNode) => void;
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
									node.ignored && "opacity-50",
									isEdited && "text-yellow-500",
								)}
								style={{
									...DIFF_ROW_RENDER_STYLE,
									paddingLeft: `${depth * 12 + 8}px`,
								}}
								onClick={() => onToggle(node)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onToggle(node);
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
									src={getCachedFolderIcon(isOpen)}
									alt=""
									className={FOLDER_ICON_CLASS}
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
							node.ignored && "opacity-50",
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
