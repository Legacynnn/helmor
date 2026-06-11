// The "Remote" group: files that differ between the workspace branch and
// its target branch, with a loading state while the target branch is
// being switched.
import { ChevronRightIcon, CloudIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type ActiveEditorTarget,
	type DiffOpenOptions,
	isActiveEditorTarget,
} from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import { ChangesFlatView } from "./flat-view";
import { ViewToggleButton } from "./row-actions";
import type { ChangeRow } from "./shared";
import { ChangesTreeView } from "./tree-view";

export function BranchDiffSection({
	targetBranch,
	count,
	loading,
	open,
	onToggle,
	changes,
	treeView,
	onToggleTreeView,
	editorMode,
	activeEditor,
	onOpenEditorFile,
	onOpenExternalEditor,
	flashingPaths,
	workspaceBranch,
	workspaceRemoteUrl,
}: {
	targetBranch: string | null;
	count: number;
	loading: boolean;
	open: boolean;
	onToggle: () => void;
	changes: ChangeRow[];
	treeView: boolean;
	onToggleTreeView: () => void;
	editorMode: boolean;
	activeEditor?: ActiveEditorTarget | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	onOpenExternalEditor: (path: string) => void;
	flashingPaths: Set<string>;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
}) {
	const remoteOriginalRef = targetBranch ?? undefined;
	const remoteModifiedRef = "HEAD";
	const handleOpenFile = useCallback(
		(path: string, options?: DiffOpenOptions) => {
			onOpenEditorFile(path, {
				fileStatus: options?.fileStatus ?? "M",
				originalRef: remoteOriginalRef,
				modifiedRef: remoteModifiedRef,
			});
		},
		[onOpenEditorFile, remoteOriginalRef, remoteModifiedRef],
	);
	const activeEditorPath = isActiveEditorTarget(
		activeEditor,
		remoteOriginalRef,
		remoteModifiedRef,
	)
		? activeEditor.path
		: null;

	return (
		<div>
			<div className="group/header flex w-full items-center gap-1 py-1 pl-1 pr-2 text-mini font-semibold tracking-[-0.01em] text-muted-foreground">
				<Button
					type="button"
					variant="ghost"
					size="xs"
					onClick={onToggle}
					aria-expanded={open}
					className="h-auto min-w-0 flex-1 justify-start gap-1 rounded-none px-0 text-left hover:bg-transparent hover:text-foreground dark:hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground"
				>
					<ChevronRightIcon
						data-icon="inline-start"
						className={cn(
							"size-3 shrink-0 transition-transform",
							open && "rotate-90",
						)}
						strokeWidth={2}
					/>
					<CloudIcon
						className="size-3 shrink-0 text-muted-foreground"
						strokeWidth={2}
					/>
					<span className="truncate">Remote</span>
				</Button>
				<ViewToggleButton treeView={treeView} onToggle={onToggleTreeView} />
				<Badge
					variant="secondary"
					className="h-4 min-w-[16px] justify-center rounded-full px-1 text-nano leading-none"
				>
					{loading ? (
						<LoaderCircleIcon className="size-2.5 animate-spin" />
					) : (
						count
					)}
				</Badge>
			</div>
			{open && (
				<div
					className={cn(
						"pl-3 transition-opacity duration-150",
						loading && "pointer-events-none opacity-40",
					)}
				>
					{loading && changes.length === 0 ? (
						<div className="px-2 py-2 text-micro text-muted-foreground">
							Switching target branch…
						</div>
					) : treeView ? (
						<ChangesTreeView
							changes={changes}
							editorMode={editorMode}
							activeEditorPath={activeEditorPath}
							onOpenEditorFile={handleOpenFile}
							onOpenExternalEditor={onOpenExternalEditor}
							flashingPaths={flashingPaths}
							workspaceBranch={workspaceBranch}
							workspaceRemoteUrl={workspaceRemoteUrl}
						/>
					) : (
						<ChangesFlatView
							changes={changes}
							editorMode={editorMode}
							activeEditorPath={activeEditorPath}
							onOpenEditorFile={handleOpenFile}
							onOpenExternalEditor={onOpenExternalEditor}
							flashingPaths={flashingPaths}
							workspaceBranch={workspaceBranch}
							workspaceRemoteUrl={workspaceRemoteUrl}
						/>
					)}
				</div>
			)}
		</div>
	);
}
