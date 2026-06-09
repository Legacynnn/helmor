import { GitBranch, GitMerge, GitPullRequest } from "lucide-react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import type { WorkspaceDiffStat, WorkspaceRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
	row: WorkspaceRow;
	running: boolean;
	diffStat?: WorkspaceDiffStat;
	onOpen: (workspaceId: string) => void;
};

function prNumber(prUrl: string | null | undefined): string | null {
	if (!prUrl) return null;
	// Grab the last numeric path segment — covers GitHub `/pull/42` and
	// GitLab `/-/merge_requests/456`, with or without a trailing slash.
	const m = prUrl.match(/\/(\d+)\/?(?:$|[?#])/);
	return m ? `#${m[1]}` : null;
}

/** Open PRs get a hollow pull-request glyph, merged ones the merge glyph, and
 *  closed ones the same pull-request glyph tinted red — so PR state is legible
 *  from the icon alone, not just the number. */
function prIcon(state: WorkspaceRow["prSyncState"]) {
	if (state === "merged")
		return { Icon: GitMerge, className: "text-purple-400" };
	if (state === "closed")
		return { Icon: GitPullRequest, className: "text-red-400" };
	return { Icon: GitPullRequest, className: "text-green-400" };
}

export function WorkspaceKanbanCard({ row, running, diffStat, onOpen }: Props) {
	const hasPr = row.prSyncState && row.prSyncState !== "none";
	const pr = hasPr ? prNumber(row.prUrl) : null;
	const { Icon: PrGlyph, className: prClass } = prIcon(row.prSyncState);
	const showDiff =
		diffStat &&
		(diffStat.insertions > 0 ||
			diffStat.deletions > 0 ||
			diffStat.filesChanged > 0);

	function open() {
		onOpen(row.id);
	}

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label={row.title}
			onClick={open}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					open();
				}
			}}
			className="flex w-full cursor-pointer flex-col gap-1.5 rounded-md border border-border/60 bg-card p-2.5 text-left shadow-sm transition-colors hover:border-border hover:bg-accent/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
		>
			<div className="flex items-start gap-2">
				<WorkspaceAvatar
					repoIconSrc={row.repoIconSrc}
					repoInitials={row.repoInitials ?? row.avatar ?? null}
					repoName={row.repoName}
					title={row.title}
					className="size-4 shrink-0"
				/>
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
					{row.title}
				</span>
				{running && (
					<span aria-label="Running" className="shrink-0">
						<HelmorLogoAnimated size={14} className="opacity-80" />
					</span>
				)}
				{row.hasUnread && !running && (
					<span
						aria-label="Unread"
						className="mt-1 size-1.5 shrink-0 rounded-full bg-primary"
					/>
				)}
			</div>

			{row.branch && (
				<div className="flex items-center gap-1 text-muted-foreground text-xs">
					<GitBranch className="size-3 shrink-0" />
					<span className="min-w-0 flex-1 truncate">{row.branch}</span>
					{hasPr && (
						<span
							aria-label={`Pull request ${pr ?? ""} (${row.prSyncState})`}
							className={cn("flex shrink-0 items-center gap-0.5", prClass)}
						>
							<PrGlyph className="size-3.5" />
							{pr && <span className="font-medium text-[10px]">{pr}</span>}
						</span>
					)}
				</div>
			)}

			{showDiff && (
				<div className="flex items-center gap-2 text-[11px]">
					{diffStat.insertions > 0 && (
						<span className="font-medium text-chart-2">
							+{diffStat.insertions}
						</span>
					)}
					{diffStat.deletions > 0 && (
						<span className="font-medium text-destructive">
							−{diffStat.deletions}
						</span>
					)}
					{diffStat.filesChanged > 0 && (
						<span className="ml-auto text-muted-foreground">
							{diffStat.filesChanged}{" "}
							{diffStat.filesChanged === 1 ? "file" : "files"}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
