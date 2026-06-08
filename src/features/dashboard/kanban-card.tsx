import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import type { WorkspaceRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
	row: WorkspaceRow;
	running: boolean;
	onOpen: (workspaceId: string) => void;
};

function prNumber(prUrl: string | null | undefined): string | null {
	if (!prUrl) return null;
	const m = prUrl.match(/\/(\d+)(?:$|[?#])/);
	return m ? `#${m[1]}` : null;
}

export function WorkspaceKanbanCard({ row, running, onOpen }: Props) {
	const pr =
		row.prSyncState && row.prSyncState !== "none" ? prNumber(row.prUrl) : null;
	return (
		<button
			type="button"
			aria-label={row.title}
			onClick={() => onOpen(row.id)}
			className="flex w-full cursor-pointer flex-col gap-1.5 rounded-md border border-app-border/60 bg-app-base p-2.5 text-left transition-colors hover:border-app-border hover:bg-app-accent/5"
		>
			<div className="flex items-start gap-2">
				<WorkspaceAvatar
					repoIconSrc={row.repoIconSrc}
					repoInitials={row.repoInitials ?? row.avatar ?? null}
					repoName={row.repoName}
					title={row.title}
					className="size-4 shrink-0"
				/>
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-app-foreground">
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
						className="mt-1 size-1.5 shrink-0 rounded-full bg-app-accent"
					/>
				)}
			</div>
			<div className="flex items-center gap-2 text-xs text-app-foreground/55">
				{row.branch && <span className="truncate">{row.branch}</span>}
				{pr && (
					<span
						className={cn(
							"ml-auto rounded px-1 py-0.5 text-[10px] font-medium",
							row.prSyncState === "merged"
								? "bg-purple-500/15 text-purple-400"
								: row.prSyncState === "closed"
									? "bg-red-500/15 text-red-400"
									: "bg-green-500/15 text-green-400",
						)}
					>
						{pr}
					</span>
				)}
			</div>
		</button>
	);
}
