// The inspector's Git panel: header (PR pill + commit button), staged /
// unstaged change groups and the remote branch-diff section. Composition
// only — group, view and row components live in the sibling modules.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LaptopIcon } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	CommitButtonState,
	WorkspaceCommitButtonMode,
} from "@/features/commit/button";
import {
	type ChangeRequestInfo,
	type DetectedEditor,
	type ForgeDetection,
	openFileInEditor,
} from "@/lib/api";
import { getMergeBlockedReason } from "@/lib/commit-button-logic";
import {
	type ActiveEditorTarget,
	type DiffOpenOptions,
	INDEX_REF,
	type InspectorFileItem,
} from "@/lib/editor-session";
import { openUrl } from "@/lib/platform-bridge";
import {
	helmorQueryKeys,
	workspaceForgeActionStatusQueryOptions,
	workspaceForgeQueryOptions,
} from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";
import { BranchDiffSection } from "./branch-diff";
import { ChangesGroup } from "./changes-group";
import { GitSectionHeader } from "./header";
import { useBranchSwitching, useChangeRowProjections } from "./use-change-rows";
import { buildNavEntries, useChangesNav } from "./use-changes-nav";
import { useChangesState } from "./use-changes-state";
import { useGitMutations } from "./use-git-mutations";

type ChangesSectionProps = {
	workspaceId: string | null;
	workspaceRootPath: string | null;
	workspaceBranch: string | null;
	workspaceRemoteUrl: string | null;
	workspaceTargetBranch: string | null;
	changes: InspectorFileItem[];
	changesLoaded: boolean;
	editorMode: boolean;
	activeEditor?: ActiveEditorTarget | null;
	preferredEditor?: DetectedEditor | null;
	onOpenEditorFile: (path: string, options?: DiffOpenOptions) => void;
	flashingPaths: Set<string>;
	onCommitAction?: (mode: WorkspaceCommitButtonMode) => Promise<void>;
	commitButtonMode?: WorkspaceCommitButtonMode;
	commitButtonState?: CommitButtonState;
	changeRequest: ChangeRequestInfo | null;
	/** Cold-fetch indicator owned by App; drives the git-header shimmer. */
	forgeIsRefreshing?: boolean;
};

function ChangesSectionImpl({
	workspaceId,
	workspaceRootPath,
	workspaceBranch,
	workspaceRemoteUrl,
	workspaceTargetBranch,
	changes,
	changesLoaded,
	editorMode,
	activeEditor,
	preferredEditor = null,
	onOpenEditorFile,
	flashingPaths,
	onCommitAction,
	commitButtonMode = "create-pr",
	commitButtonState,
	changeRequest,
	forgeIsRefreshing = false,
}: ChangesSectionProps) {
	const queryClient = useQueryClient();
	const {
		changesOpen,
		stagedOpen,
		branchDiffOpen,
		changesTreeView,
		branchDiffTreeView,
		toggleChangesOpen,
		toggleStagedOpen,
		toggleBranchDiffOpen,
		toggleChangesTreeView,
		toggleBranchDiffTreeView,
	} = useChangesState();
	const forgeQuery = useQuery({
		...workspaceForgeQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null,
	});
	const forgeStatusQuery = useQuery({
		...workspaceForgeActionStatusQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null,
	});
	const cachedForgeDetection = workspaceId
		? queryClient.getQueryData<ForgeDetection>(
				helmorQueryKeys.workspaceForge(workspaceId),
			)
		: null;
	const forgeDetection = forgeQuery.data ?? cachedForgeDetection ?? null;
	const changeRequestName = forgeDetection?.labels.changeRequestName ?? "PR";

	const branchSwitching = useBranchSwitching(
		workspaceId,
		workspaceTargetBranch,
		changes,
	);

	const { stagedChanges, unstagedChanges, committedChanges } =
		useChangeRowProjections(changes);
	const hasUncommittedChanges =
		stagedChanges.length > 0 || unstagedChanges.length > 0;
	const hasChanges = hasUncommittedChanges || committedChanges.length > 0;

	const pushToast = useWorkspaceToast();
	const {
		isContinuingWorkspace,
		stageFile,
		unstageFile,
		stageAll,
		unstageAll,
		discardFile,
		continueWorkspace: handleContinueWorkspace,
	} = useGitMutations({
		workspaceId,
		workspaceRootPath,
		stagedChanges,
		unstagedChanges,
		queryClient,
		pushToast,
	});

	const handleCommitButtonClick = useCallback(async () => {
		if (!onCommitAction) {
			return;
		}
		await onCommitAction(commitButtonMode);
	}, [commitButtonMode, onCommitAction]);

	const handleOpenExternalEditor = useCallback(
		(path: string) => {
			if (!preferredEditor) {
				pushToast("Select a default editor before opening files.", "No editor");
				return;
			}
			void openFileInEditor(path, preferredEditor.id).catch((error) => {
				pushToast(
					error instanceof Error ? error.message : String(error),
					`Failed to open ${preferredEditor.name}`,
				);
			});
		},
		[preferredEditor, pushToast],
	);

	// Header shimmer is owned by App: it knows when the change-request and
	// forge-action-status queries are on their *first* cold fetch (vs. just a
	// background refresh or a placeholder render).
	const isForgeRefreshing = workspaceId !== null && forgeIsRefreshing;

	// ArrowUp/Down walk the visible rows and open diffs in the preview tab;
	// Enter pins. The handler sits on the panel root so keydown from any
	// focused row (they're all tabIndex={0}) bubbles into it.
	const navEntries = useMemo(
		() =>
			buildNavEntries({
				stagedChanges,
				unstagedChanges,
				committedChanges,
				stagedOpen,
				changesOpen,
				branchDiffOpen,
				targetBranch: workspaceTargetBranch,
			}),
		[
			stagedChanges,
			unstagedChanges,
			committedChanges,
			stagedOpen,
			changesOpen,
			branchDiffOpen,
			workspaceTargetBranch,
		],
	);
	const handleNavKeyDown = useChangesNav({
		entries: navEntries,
		activeEditor,
		onOpenEditorFile,
	});

	return (
		<div
			aria-label="Git panel"
			className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar focus:outline-none"
			tabIndex={-1}
			onKeyDown={handleNavKeyDown}
		>
			<GitSectionHeader
				commitButtonMode={commitButtonMode}
				commitButtonState={commitButtonState}
				changeRequest={changeRequest}
				mergeBlockedReason={getMergeBlockedReason(forgeStatusQuery.data)}
				changeRequestName={changeRequestName}
				forgeRemoteState={forgeStatusQuery.data?.remoteState ?? null}
				forgeDetection={forgeDetection}
				workspaceId={workspaceId}
				hasChanges={hasChanges}
				isRefreshing={isForgeRefreshing}
				isContinuingWorkspace={isContinuingWorkspace}
				onChangeRequestClick={
					changeRequest ? () => void openUrl(changeRequest.url) : undefined
				}
				onCommit={handleCommitButtonClick}
				onContinueWorkspace={handleContinueWorkspace}
			/>

			<ScrollArea
				aria-label="Changes panel body"
				className="min-h-0 flex-1 bg-muted/20 font-mono text-mini"
			>
				{hasUncommittedChanges && (
					<>
						{stagedChanges.length > 0 && (
							<div data-nav-area="staged">
								<ChangesGroup
									label="Staged Changes"
									count={stagedChanges.length}
									open={stagedOpen}
									onToggle={() => toggleStagedOpen()}
									changes={stagedChanges}
									treeView={changesTreeView}
									onToggleTreeView={() => toggleChangesTreeView()}
									action="unstage"
									onStageAction={unstageFile}
									onBatchAction={unstageAll}
									editorMode={editorMode}
									activeEditor={activeEditor}
									onOpenEditorFile={onOpenEditorFile}
									onOpenExternalEditor={handleOpenExternalEditor}
									flashingPaths={flashingPaths}
									workspaceBranch={workspaceBranch}
									workspaceRemoteUrl={workspaceRemoteUrl}
									originalRef="HEAD"
									modifiedRef={INDEX_REF}
								/>
							</div>
						)}
						{unstagedChanges.length > 0 && (
							<div data-nav-area="unstaged">
								<ChangesGroup
									label="Changes"
									icon={
										<LaptopIcon
											className="size-3 shrink-0 text-muted-foreground"
											strokeWidth={2}
										/>
									}
									count={unstagedChanges.length}
									open={changesOpen}
									onToggle={() => toggleChangesOpen()}
									changes={unstagedChanges}
									treeView={changesTreeView}
									onToggleTreeView={() => toggleChangesTreeView()}
									action="stage"
									onStageAction={stageFile}
									onBatchAction={stageAll}
									onDiscard={discardFile}
									editorMode={editorMode}
									activeEditor={activeEditor}
									onOpenEditorFile={onOpenEditorFile}
									onOpenExternalEditor={handleOpenExternalEditor}
									flashingPaths={flashingPaths}
									workspaceBranch={workspaceBranch}
									workspaceRemoteUrl={workspaceRemoteUrl}
									originalRef={INDEX_REF}
								/>
							</div>
						)}
					</>
				)}

				{(committedChanges.length > 0 || branchSwitching) && (
					<div data-nav-area="committed">
						<BranchDiffSection
							targetBranch={workspaceTargetBranch}
							count={committedChanges.length}
							loading={branchSwitching}
							open={branchDiffOpen}
							onToggle={() => toggleBranchDiffOpen()}
							changes={committedChanges}
							treeView={branchDiffTreeView}
							onToggleTreeView={() => toggleBranchDiffTreeView()}
							editorMode={editorMode}
							activeEditor={activeEditor}
							onOpenEditorFile={onOpenEditorFile}
							onOpenExternalEditor={handleOpenExternalEditor}
							flashingPaths={flashingPaths}
							workspaceBranch={workspaceBranch}
							workspaceRemoteUrl={workspaceRemoteUrl}
						/>
					</div>
				)}

				{changesLoaded && !hasChanges && !branchSwitching && (
					<div className="px-3 py-3 text-mini leading-5 text-muted-foreground">
						No changes on this branch yet.
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

// memo so root state changes that don't touch Changes props (e.g. opening
// Settings) skip this subtree entirely.
export const ChangesSection = memo(ChangesSectionImpl);
