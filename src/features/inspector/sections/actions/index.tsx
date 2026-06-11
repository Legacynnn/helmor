// The inspector's Actions tab: helper actions (review), git status rows,
// PR review rows, deployments and checks. Row building/sorting and the
// presentational row components live in `./rows`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	CommitButtonState,
	WorkspaceCommitButtonMode,
} from "@/features/commit/button";
import {
	type ChangeRequestInfo,
	type ForgeActionItem,
	getWorkspaceForgeCheckInsertText,
	loadRepoPreferences,
	type RepoPreferences,
	type SyncWorkspaceTargetResponse,
	syncWorkspaceWithTargetBranch,
} from "@/lib/api";
import { buildComposerPreviewPayload } from "@/lib/composer-insert";
import {
	helmorQueryKeys,
	workspaceForgeActionStatusQueryOptions,
	workspaceForgeQueryOptions,
	workspaceGitActionStatusQueryOptions,
} from "@/lib/query-client";
// `workspaceForgeQueryOptions` is still used here to drive `changeRequestName`
// for the review/PR rows (MR vs PR wording). Forge onboarding lives in
// `GitSectionHeader` — see the top of the Git tab.
import { resolveRepoPreferencePrompt } from "@/lib/repo-preferences-prompts";
import { requestSidebarReconcile } from "@/lib/sidebar-mutation-gate";
import {
	ActionStatusRow,
	buildGitRows,
	buildReviewRows,
	EMPTY_FORGE_ACTION_STATUS,
	EMPTY_GIT_ACTION_STATUS,
	loadingActionLabel,
	StatusIcon,
	sortActionItems,
	sortStatusRows,
} from "./rows";

type ActionsTabBodyProps = {
	workspaceId: string | null;
	workspaceState?: string | null;
	repoId?: string | null;
	workspaceRemote?: string | null;
	onCommitAction?: (mode: WorkspaceCommitButtonMode) => Promise<void>;
	onReviewAction?: () => Promise<void>;
	currentSessionId?: string | null;
	onQueuePendingPromptForSession?: (request: {
		sessionId: string;
		prompt: string;
		modelId?: string | null;
		permissionMode?: string | null;
		forceQueue?: boolean;
	}) => void;
	commitButtonMode?: WorkspaceCommitButtonMode;
	commitButtonState?: CommitButtonState;
	changeRequest: ChangeRequestInfo | null;
};

function buildSyncResolutionPrompt(
	result: SyncWorkspaceTargetResponse,
	repoPreferences: RepoPreferences | null,
	workspaceRemote?: string | null,
): string {
	const remote = workspaceRemote?.trim();
	const targetBranch = result.targetBranch.trim();
	const targetRef =
		remote &&
		(targetBranch === remote ||
			targetBranch.startsWith(`${remote}/`) ||
			targetBranch.startsWith(`refs/remotes/${remote}/`))
			? targetBranch
			: remote
				? `${remote}/${targetBranch}`
				: targetBranch;

	return resolveRepoPreferencePrompt({
		key: "resolveConflicts",
		repoPreferences,
		targetRef,
		resolveConflictsKind:
			result.outcome === "stashPopConflict"
				? "stashPopConflict"
				: "mergeConflict",
	});
}

export function ActionsTabBody({
	workspaceId,
	workspaceState,
	repoId,
	workspaceRemote,
	onCommitAction,
	onReviewAction,
	currentSessionId,
	onQueuePendingPromptForSession,
	commitButtonMode,
	commitButtonState,
	changeRequest,
}: ActionsTabBodyProps) {
	const queryClient = useQueryClient();
	const [syncPending, setSyncPending] = useState(false);
	const [reviewPending, setReviewPending] = useState(false);
	const forgeQuery = useQuery({
		...workspaceForgeQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null,
	});
	// Archived workspaces have no live worktree — polling git/PR status every
	// 10s would spam errors. App.tsx mirrors this guard.
	const isArchived = workspaceState === "archived";
	const gitStatusQuery = useQuery({
		...workspaceGitActionStatusQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null && !isArchived,
	});
	const forgeStatusQuery = useQuery({
		...workspaceForgeActionStatusQueryOptions(workspaceId ?? "__none__"),
		enabled: workspaceId !== null && !isArchived,
	});
	const gitStatus = gitStatusQuery.data ?? EMPTY_GIT_ACTION_STATUS;
	const forgeStatus = forgeStatusQuery.data ?? EMPTY_FORGE_ACTION_STATUS;
	// "Reviewable" = the user actually has changes of their own to review.
	// Two signals add up:
	//   - `uncommittedCount` — dirty working tree.
	//   - `aheadOfTargetCount` — commits past the target branch's remote ref.
	//
	// We deliberately do NOT use `aheadOfRemoteCount` (it reads as 0 on
	// unpublished branches, missing the local-only-commits case) or the
	// "branch unpublished" signal (a brand-new workspace branched from main
	// is unpublished too, but has no user changes — must not show Review).
	const hasReviewableChanges =
		gitStatus.uncommittedCount > 0 || gitStatus.aheadOfTargetCount > 0;
	const showReviewHelper = Boolean(onReviewAction) && hasReviewableChanges;
	// Helpers group hides entirely when no helper has anything to do. New
	// helpers should `||` into this — never render an empty group header.
	const showHelpersGroup = showReviewHelper;
	const changeRequestName = forgeQuery.data?.labels.changeRequestName ?? "PR";
	const providerName = forgeQuery.data?.labels.providerName ?? "Forge";
	// Auth-flip invalidation lives in the sync bridge — no frontend edge-detect.
	const gitRows = sortStatusRows(buildGitRows(gitStatus, workspaceRemote));
	const reviewRows = sortStatusRows(
		buildReviewRows(
			forgeStatus,
			changeRequest,
			changeRequestName,
			providerName,
		),
	);
	const sortedDeployments = sortActionItems(forgeStatus.deployments);
	const sortedChecks = sortActionItems(forgeStatus.checks);
	const actionDisabled = commitButtonState === "busy";
	const queueSyncResolutionPrompt = useCallback(
		async (result: SyncWorkspaceTargetResponse) => {
			if (!currentSessionId || !onQueuePendingPromptForSession) {
				return false;
			}
			const repoPreferences = repoId ? await loadRepoPreferences(repoId) : null;
			// `forceQueue: true` — if a turn is already streaming, the
			// prompt MUST queue (never steer), regardless of the user's
			// followUpBehavior setting. The merge task is a fresh task,
			// not a course correction for the current turn.
			onQueuePendingPromptForSession({
				sessionId: currentSessionId,
				prompt: buildSyncResolutionPrompt(
					result,
					repoPreferences,
					workspaceRemote,
				),
				forceQueue: true,
			});
			return true;
		},
		[currentSessionId, onQueuePendingPromptForSession, repoId, workspaceRemote],
	);
	const handleSync = useCallback(async () => {
		if (!workspaceId || syncPending) {
			return;
		}

		setSyncPending(true);
		try {
			const result = await syncWorkspaceWithTargetBranch(workspaceId);
			const target = result.targetBranch;
			if (result.outcome === "updated") {
				toast.success(`Pulled latest from ${target}`);
			} else if (result.outcome === "alreadyUpToDate") {
				toast(`Already up to date with ${target}`);
			} else {
				// conflict or stashPopConflict — both hand off to the agent
				// with a kind-specific narrow prompt.
				await queueSyncResolutionPrompt(result);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to pull target updates.";
			toast.error(message);
		} finally {
			requestSidebarReconcile(queryClient);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.workspaceGitActionStatus(workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.workspaceChangeRequest(workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.workspaceForgeActionStatus(workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.workspaceDetail(workspaceId),
				}),
				queryClient.invalidateQueries({ queryKey: ["workspaceChanges"] }),
			]);
			setSyncPending(false);
		}
	}, [queryClient, queueSyncResolutionPrompt, syncPending, workspaceId]);
	const handleReviewChanges = useCallback(async () => {
		if (!onReviewAction || reviewPending) {
			return;
		}
		setReviewPending(true);
		try {
			await onReviewAction();
		} finally {
			setReviewPending(false);
		}
	}, [onReviewAction, reviewPending]);
	const handleInsertCheck = useCallback(
		async (item: ForgeActionItem) => {
			if (!workspaceId) {
				return;
			}
			const submitText = await getWorkspaceForgeCheckInsertText(
				workspaceId,
				item.id,
			);
			return {
				target: { workspaceId },
				label: item.name,
				submitText,
				key: `pr-check:${item.id}`,
				preview: buildComposerPreviewPayload({
					title: item.name,
					content: submitText,
					preferredKind: "code",
				}),
			};
		},
		[workspaceId],
	);
	return (
		<div className="min-h-0 flex-1 bg-sidebar">
			<ScrollArea
				aria-label="Actions panel body"
				className="h-full min-h-0 bg-muted/18 text-mini"
			>
				{showHelpersGroup && (
					<>
						<div className="px-2.5 pb-1 pt-2">
							<span className="text-micro font-medium tracking-wide text-muted-foreground">
								Helpers
							</span>
						</div>
						{showReviewHelper && (
							<div className="flex items-center gap-1.5 px-2.5 py-[3px] text-muted-foreground transition-colors hover:bg-accent/60">
								<EyeIcon
									aria-hidden="true"
									className="size-3 shrink-0"
									strokeWidth={2}
								/>
								<span className="truncate">Review changes</span>
								<button
									type="button"
									onClick={() => void handleReviewChanges()}
									disabled={reviewPending || workspaceId === null}
									aria-busy={reviewPending ? true : undefined}
									aria-label={reviewPending ? "Reviewing" : undefined}
									className="ml-auto shrink-0 cursor-interactive text-micro text-foreground transition-colors hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
								>
									<span className="inline-flex items-center gap-1">
										{reviewPending ? (
											<LoaderCircleIcon
												aria-hidden="true"
												className="size-3 animate-spin text-current opacity-70"
												strokeWidth={2}
											/>
										) : null}
										{reviewPending ? null : "Review"}
									</span>
								</button>
							</div>
						)}
					</>
				)}
				<div className="px-2.5 pb-1 pt-2">
					<span className="text-micro font-medium tracking-wide text-muted-foreground">
						Git
					</span>
				</div>
				{gitRows.map((item) => {
					const action = item.action;
					const isCommitActionBusy =
						action?.kind === "commit" &&
						action.mode != null &&
						commitButtonMode === action.mode &&
						commitButtonState === "busy";
					const isSyncActionBusy = action?.kind === "sync" && syncPending;
					const isActionBusy = isCommitActionBusy || isSyncActionBusy;
					return (
						<div
							key={item.label}
							className="flex items-center gap-1.5 px-2.5 py-[3px] text-muted-foreground transition-colors hover:bg-accent/60"
						>
							<StatusIcon status={item.status} />
							<span className="truncate">{item.label}</span>
							{action && (
								<button
									type="button"
									onClick={() => {
										if (
											(action.kind === "commit" && actionDisabled) ||
											(action.kind === "sync" && syncPending)
										) {
											return;
										}
										if (action.kind === "sync") {
											void handleSync();
											return;
										}
										void onCommitAction?.(action.mode!);
									}}
									className="ml-auto shrink-0 cursor-interactive text-micro text-foreground transition-colors hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={
										action.kind === "commit" ? actionDisabled : syncPending
									}
									aria-busy={isActionBusy ? true : undefined}
									aria-label={
										isActionBusy ? loadingActionLabel(action.label) : undefined
									}
								>
									<span className="inline-flex items-center gap-1">
										{isActionBusy ? (
											<LoaderCircleIcon
												aria-hidden="true"
												className="size-3 animate-spin text-current opacity-70"
												strokeWidth={2}
											/>
										) : null}
										{isActionBusy ? null : action.label}
									</span>
								</button>
							)}
						</div>
					);
				})}

				{reviewRows.length > 0 && (
					<>
						<div className="px-2.5 pb-1 pt-2.5">
							<span className="text-micro font-medium tracking-wide text-muted-foreground">
								Review
							</span>
						</div>
						{reviewRows.map((item) => (
							<div
								key={item.label}
								className="flex items-center gap-1.5 px-2.5 py-[3px] text-muted-foreground transition-colors hover:bg-accent/60"
							>
								<StatusIcon status={item.status} />
								<span className="truncate">{item.label}</span>
							</div>
						))}
					</>
				)}

				{sortedDeployments.length > 0 && (
					<>
						<div className="px-2.5 pb-1 pt-2.5">
							<span className="text-micro font-medium tracking-wide text-muted-foreground">
								Deployments
							</span>
						</div>
						{sortedDeployments.map((item) => (
							<ActionStatusRow key={item.id} item={item} />
						))}
					</>
				)}

				{sortedChecks.length > 0 && (
					<>
						<div className="px-2.5 pb-1 pt-2.5">
							<span className="text-micro font-medium tracking-wide text-muted-foreground">
								Checks
							</span>
						</div>
						{sortedChecks.map((item) => (
							<ActionStatusRow
								key={item.id}
								item={item}
								onInsertToComposer={handleInsertCheck}
							/>
						))}
					</>
				)}
			</ScrollArea>
		</div>
	);
}
