// Flat (list) presentation of a change list: one row per file with its
// parent directory, line stats and status badge.
import type { DiffOpenOptions } from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import { ChangesRowsContextMenu } from "./context-menu";
import { LineStats, RowHoverActions, ShinyFlash } from "./row-actions";
import {
	type ChangeRow,
	DIFF_ROW_RENDER_STYLE,
	getCachedFileIcon,
	STATUS_COLORS,
	type StageActionKind,
} from "./shared";

export function ChangesFlatView({
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
	const hasStage = !!action && !!onStageAction;
	const hasDiscard = !!onDiscard;

	return (
		<ChangesRowsContextMenu
			changes={changes}
			workspaceBranch={workspaceBranch}
			workspaceRemoteUrl={workspaceRemoteUrl}
		>
			<div className="py-0.5">
				{changes.map((change) => {
					const canOpenExternalEditor = change.status !== "D";
					const hasHoverAction =
						canOpenExternalEditor || hasStage || hasDiscard;

					return (
						<div
							key={change.path}
							className={cn(
								"group/row flex cursor-interactive items-center gap-1.5 py-[1.5px] pl-2 pr-2 text-muted-foreground transition-colors hover:bg-accent/60",
								change.absolutePath === activeEditorPath &&
									(editorMode
										? "bg-accent text-foreground"
										: "bg-muted/60 text-foreground"),
							)}
							style={DIFF_ROW_RENDER_STYLE}
							data-change-path={change.path}
							role="button"
							tabIndex={0}
							onClick={() =>
								onOpenEditorFile(change.absolutePath, {
									fileStatus: change.status,
								})
							}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onOpenEditorFile(change.absolutePath, {
										fileStatus: change.status,
									});
								}
							}}
						>
							<img
								src={getCachedFileIcon(change.name)}
								alt=""
								className="size-4 shrink-0"
							/>
							<span className="min-w-0 max-w-[60%] truncate">
								<ShinyFlash active={flashingPaths.has(change.path)}>
									{change.name}
								</ShinyFlash>
							</span>
							<span
								className={cn(
									"min-w-0 flex-1 truncate text-right text-micro text-muted-foreground",
									hasHoverAction && "group-hover/row:hidden",
								)}
							>
								{change.path.includes("/")
									? change.path.slice(0, change.path.lastIndexOf("/"))
									: ""}
							</span>
							<span
								className={cn(
									"flex shrink-0 items-center gap-1 tabular-nums",
									hasHoverAction && "group-hover/row:hidden",
								)}
							>
								<LineStats
									insertions={change.insertions}
									deletions={change.deletions}
								/>
								<span
									className={cn(
										"inline-flex h-4 w-4 items-center justify-center text-micro font-semibold",
										STATUS_COLORS[change.status],
									)}
								>
									{change.status}
								</span>
							</span>
							{hasHoverAction && (
								<RowHoverActions
									path={change.path}
									absolutePath={change.absolutePath}
									canOpenExternalEditor={canOpenExternalEditor}
									action={hasStage ? action : undefined}
									onOpenExternalEditor={onOpenExternalEditor}
									onStageAction={hasStage ? onStageAction : undefined}
									onDiscard={hasDiscard ? onDiscard : undefined}
								/>
							)}
						</div>
					);
				})}
			</div>
		</ChangesRowsContextMenu>
	);
}
