// A collapsible group of working-tree changes (Staged / Changes) with a
// header row (toggle, view switch, batch stage/unstage, count badge) and
// its tree-or-flat body.
import { ChevronRightIcon, MinusIcon, PlusIcon } from "lucide-react";
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
import { RowIconButton, ViewToggleButton } from "./row-actions";
import type { ChangeRow, StageActionKind } from "./shared";
import { ChangesTreeView } from "./tree-view";

export function ChangesGroup({
	label,
	icon,
	count,
	open,
	onToggle,
	changes,
	treeView,
	onToggleTreeView,
	action,
	onStageAction,
	onBatchAction,
	onDiscard,
	editorMode,
	activeEditor,
	onOpenEditorFile,
	onOpenExternalEditor,
	flashingPaths,
	workspaceBranch,
	workspaceRemoteUrl,
	originalRef,
	modifiedRef,
}: {
	label: string;
	icon?: React.ReactNode;
	count: number;
	open: boolean;
	onToggle: () => void;
	changes: ChangeRow[];
	treeView: boolean;
	onToggleTreeView: () => void;
	action: StageActionKind;
	onStageAction: (path: string) => void;
	onBatchAction?: () => void;
	onDiscard?: (path: string) => void;
	editorMode: boolean;
	activeEditor?: ActiveEditorTarget | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	onOpenExternalEditor: (path: string) => void;
	flashingPaths: Set<string>;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
	/** Git ref for the original (left) side. Staged → "HEAD"; Unstaged → INDEX_REF. */
	originalRef?: string;
	/** Git ref for the modified (right) side. Staged → INDEX_REF; Unstaged → undefined
	 * (so the editor reads the working tree from disk). */
	modifiedRef?: string;
}) {
	const handleOpenFile = useCallback(
		(path: string, options?: DiffOpenOptions) => {
			onOpenEditorFile(path, {
				fileStatus: options?.fileStatus ?? "M",
				originalRef,
				modifiedRef,
				// Single click opens in the reusable preview tab (VS Code style);
				// Enter / a tab double-click pins it.
				preview: true,
			});
		},
		[onOpenEditorFile, originalRef, modifiedRef],
	);
	// Same file can appear in Staged AND Unstaged. The selection highlight
	// belongs to whichever area's bases match the open editor — comparing
	// path alone lights up both rows simultaneously.
	const activeEditorPath = isActiveEditorTarget(
		activeEditor,
		originalRef,
		modifiedRef,
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
					{icon}
					<span className="truncate">{label}</span>
				</Button>
				<ViewToggleButton treeView={treeView} onToggle={onToggleTreeView} />
				{onBatchAction && (
					<RowIconButton
						aria-label={
							action === "stage" ? "Stage all changes" : "Unstage all changes"
						}
						onClick={onBatchAction}
						className="text-transparent hover:bg-transparent group-hover/header:text-muted-foreground group-hover/header:hover:text-foreground"
					>
						{action === "stage" ? (
							<PlusIcon className="size-3.5" strokeWidth={2} />
						) : (
							<MinusIcon className="size-3.5" strokeWidth={2} />
						)}
					</RowIconButton>
				)}
				<Badge
					variant="secondary"
					className="h-4 min-w-[16px] justify-center rounded-full px-1 text-nano font-semibold"
				>
					{count}
				</Badge>
			</div>
			{open && (
				<div className="pl-3">
					{treeView ? (
						<ChangesTreeView
							changes={changes}
							editorMode={editorMode}
							activeEditorPath={activeEditorPath}
							onOpenEditorFile={handleOpenFile}
							onOpenExternalEditor={onOpenExternalEditor}
							flashingPaths={flashingPaths}
							action={action}
							onStageAction={onStageAction}
							onDiscard={onDiscard}
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
							action={action}
							onStageAction={onStageAction}
							onDiscard={onDiscard}
							workspaceBranch={workspaceBranch}
							workspaceRemoteUrl={workspaceRemoteUrl}
						/>
					)}
				</div>
			)}
		</div>
	);
}
