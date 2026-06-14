// Row model + presentational pieces for the Actions tab: git/review status
// rows, deployment/check rows, and their urgency sorting.
import { ArrowUpRightIcon, CheckIcon, TriangleIcon } from "lucide-react";
import {
	AppendContextButton,
	type AppendContextPayloadResult,
} from "@/components/append-context-button";
import { GithubBrandIcon, GitlabBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import type { WorkspaceCommitButtonMode } from "@/features/commit/button";
import type {
	ActionProvider,
	ActionStatusKind,
	ChangeRequestInfo,
	ForgeActionItem,
	ForgeActionStatus,
	WorkspaceGitActionStatus,
} from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { cn } from "@/lib/utils";

export interface GitStatusItem {
	label: string;
	status: ActionStatusKind;
	action?: {
		label: string;
		kind: "commit" | "sync";
		mode?: WorkspaceCommitButtonMode;
	};
}

export function loadingActionLabel(label: string): string {
	switch (label) {
		case "Push":
			return "Pushing";
		case "Pull":
			return "Pulling";
		case "Resolve":
			return "Resolving";
		case "Commit and push":
			return "Committing";
		default:
			return "Loading";
	}
}

export const EMPTY_GIT_ACTION_STATUS: WorkspaceGitActionStatus = {
	uncommittedCount: 0,
	conflictCount: 0,
	syncTargetBranch: null,
	syncStatus: "unknown",
	behindTargetCount: 0,
	remoteTrackingRef: null,
	aheadOfRemoteCount: 0,
	aheadOfTargetCount: 0,
	pushStatus: "unknown",
};

export const EMPTY_FORGE_ACTION_STATUS: ForgeActionStatus = {
	changeRequest: null,
	reviewDecision: null,
	mergeable: null,
	deployments: [],
	checks: [],
	remoteState: "unavailable",
	message: null,
};

export function ProviderIcon({ provider }: { provider: ActionProvider }) {
	if (provider === "vercel") {
		return (
			<TriangleIcon
				className="size-3 shrink-0 fill-current text-muted-foreground"
				strokeWidth={0}
			/>
		);
	}
	if (provider === "unknown") {
		return null;
	}
	if (provider === "gitlab") {
		return <GitlabBrandIcon size={12} className="text-muted-foreground" />;
	}
	return <GithubBrandIcon size={12} className="text-muted-foreground" />;
}

export function StatusIcon({ status }: { status: ActionStatusKind }) {
	if (status === "success") {
		return (
			<CheckIcon
				aria-label="Passed"
				className="size-3 shrink-0 text-chart-2"
				strokeWidth={2.2}
			/>
		);
	}

	const label =
		status === "running"
			? "Running"
			: status === "failure"
				? "Failed"
				: "Pending";
	const color =
		status === "running"
			? "rgb(245, 158, 11)"
			: status === "failure"
				? "rgb(207, 34, 46)"
				: undefined;

	return (
		<span
			aria-label={label}
			className="inline-flex size-3 shrink-0 items-center justify-center rounded-full border border-current text-muted-foreground"
			style={color ? { color } : undefined}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					status === "pending" && "bg-muted-foreground",
				)}
				style={color ? { backgroundColor: color } : undefined}
			/>
		</span>
	);
}

export function buildGitRows(
	gitStatus: WorkspaceGitActionStatus,
	workspaceRemote?: string | null,
): GitStatusItem[] {
	const uncommittedCount = gitStatus.uncommittedCount;
	const conflictCount = gitStatus.conflictCount;
	const syncTargetBranch = formatSyncTargetRef(
		workspaceRemote,
		gitStatus.syncTargetBranch,
	);

	return [
		uncommittedCount === 0
			? {
					label: "No uncommitted changes",
					status: "success",
				}
			: {
					label:
						uncommittedCount === 1
							? "1 uncommitted change"
							: `${uncommittedCount} uncommitted changes`,
					status: "pending",
					action: {
						label: "Commit and push",
						kind: "commit",
						mode: "commit-and-push",
					},
				},
		gitStatus.pushStatus === "unpublished"
			? {
					label: "Branch not published to remote",
					status: "pending",
					action: {
						label: "Push",
						kind: "commit",
						mode: "push",
					},
				}
			: (gitStatus.aheadOfRemoteCount ?? 0) > 0
				? {
						label:
							gitStatus.aheadOfRemoteCount === 1
								? `1 commit ahead of ${gitStatus.remoteTrackingRef ?? "upstream"}`
								: `${gitStatus.aheadOfRemoteCount} commits ahead of ${gitStatus.remoteTrackingRef ?? "upstream"}`,
						status: "pending",
						action: {
							label: "Push",
							kind: "commit",
							mode: "push",
						},
					}
				: {
						label: "Branch fully pushed",
						status: "success",
					},
		conflictCount > 0
			? {
					label: "Merge conflicts detected",
					status: "failure",
					action: {
						label: "Resolve",
						kind: "commit",
						mode: "resolve-conflicts",
					},
				}
			: gitStatus.syncStatus === "behind"
				? {
						label:
							gitStatus.behindTargetCount === 1
								? `1 commit behind ${syncTargetBranch}`
								: `${gitStatus.behindTargetCount} commits behind ${syncTargetBranch}`,
						status: "pending",
						action: {
							label: "Pull",
							kind: "sync",
						},
					}
				: gitStatus.syncStatus === "upToDate"
					? {
							label: `Up to date with ${syncTargetBranch}`,
							status: "success",
						}
					: {
							label: "Sync status unavailable",
							status: "pending",
						},
	];
}

export function formatSyncTargetRef(
	workspaceRemote?: string | null,
	syncTargetBranch?: string | null,
): string {
	const branch = syncTargetBranch?.trim();
	if (!branch) {
		return "target branch";
	}
	if (branch.includes("/")) {
		return branch;
	}
	const remote = workspaceRemote?.trim() || "origin";
	return `${remote}/${branch}`;
}

export function buildReviewRows(
	forgeStatus: ForgeActionStatus,
	changeRequest: ChangeRequestInfo | null,
	changeRequestName = "PR",
	providerName = "Forge",
): GitStatusItem[] {
	const currentChangeRequest = forgeStatus.changeRequest ?? changeRequest;
	const isMerged = currentChangeRequest?.isMerged ?? false;
	const hasMergeConflict = forgeStatus.mergeable === "CONFLICTING";

	const rows: GitStatusItem[] = [];

	if (forgeStatus.remoteState === "unauthenticated") {
		rows.push({
			label: `${providerName} CLI authentication required`,
			status: "pending",
		});
	} else if (isMerged || forgeStatus.reviewDecision === "APPROVED") {
		rows.push({ label: "Review approved", status: "success" });
	} else if (currentChangeRequest?.state === "CLOSED") {
		rows.push({ label: `${changeRequestName} closed`, status: "failure" });
	} else if (forgeStatus.reviewDecision === "CHANGES_REQUESTED") {
		rows.push({ label: "Changes requested", status: "failure" });
	} else if (forgeStatus.remoteState !== "noPr") {
		rows.push({
			label: `Waiting for ${changeRequestName} review`,
			status: "pending",
		});
	}

	if (hasMergeConflict) {
		rows.push({
			label: "Merge conflicts detected",
			status: "failure",
		});
	}

	return rows;
}

export function ActionStatusRow({
	item,
	onInsertToComposer,
}: {
	item: ForgeActionItem;
	onInsertToComposer?: (
		item: ForgeActionItem,
	) => AppendContextPayloadResult | Promise<AppendContextPayloadResult>;
}) {
	const actionButtonClassName =
		"size-5 rounded-sm text-muted-foreground opacity-55 transition-[opacity,color,background-color] hover:bg-accent/60 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5";
	const appendActionButtonClassName =
		"size-4 rounded-sm text-muted-foreground opacity-0 pointer-events-none group-hover/check-row:opacity-55 group-hover/check-row:pointer-events-auto group-focus-within/check-row:opacity-55 group-focus-within/check-row:pointer-events-auto hover:bg-accent/60 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3";

	return (
		<div className="group/check-row flex items-center justify-between gap-3 px-2.5 py-[3px] text-muted-foreground transition-colors hover:bg-accent/60">
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<StatusIcon status={item.status} />
				<ProviderIcon provider={item.provider} />
				<span
					className="min-w-0 truncate whitespace-nowrap text-foreground"
					title={item.name}
				>
					{item.name}
				</span>
				{item.duration && (
					<span className="shrink-0 text-micro text-muted-foreground">
						{item.duration}
					</span>
				)}
			</div>
			<div className="flex shrink-0 items-center justify-end gap-0">
				{onInsertToComposer && (
					<AppendContextButton
						subjectLabel={item.name}
						getPayload={() => onInsertToComposer(item)}
						errorTitle="Couldn't insert check"
						className={appendActionButtonClassName}
					/>
				)}
				{item.url && (
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={`Open ${item.name}`}
						onClick={() => {
							if (!item.url) {
								return;
							}
							void openUrl(item.url);
						}}
						className={cn("shrink-0", actionButtonClassName)}
					>
						<ArrowUpRightIcon strokeWidth={1.8} />
					</Button>
				)}
			</div>
		</div>
	);
}

export function sortActionItems(items: ForgeActionItem[]): ForgeActionItem[] {
	return [...items].sort((left, right) => {
		const statusDelta =
			actionPriority(left.status) - actionPriority(right.status);
		if (statusDelta !== 0) {
			return statusDelta;
		}

		const providerDelta = left.provider.localeCompare(right.provider);
		if (providerDelta !== 0) {
			return providerDelta;
		}

		return left.name.localeCompare(right.name);
	});
}

export function sortStatusRows(items: GitStatusItem[]): GitStatusItem[] {
	return [...items].sort((left, right) => {
		const leftRank = statusRowPriority(left);
		const rightRank = statusRowPriority(right);
		if (leftRank !== rightRank) {
			return leftRank - rightRank;
		}

		const statusDelta =
			actionPriority(left.status) - actionPriority(right.status);
		if (statusDelta !== 0) {
			return statusDelta;
		}

		return left.label.localeCompare(right.label);
	});
}

function statusRowPriority(item: GitStatusItem): number {
	if (item.action) {
		return 0;
	}
	if (item.status !== "success") {
		return 1;
	}
	return 2;
}

function actionPriority(status: ActionStatusKind): number {
	switch (status) {
		case "failure":
			return 0;
		case "running":
			return 1;
		case "pending":
			return 2;
		case "success":
			return 3;
		default:
			return 4;
	}
}
