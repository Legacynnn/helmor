import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, GitBranch, GitPullRequest } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffStatsBadge } from "@/features/navigation/diff-stats-badge";
import {
	GroupIcon,
	humanizeBranch,
	STATUS_OPTIONS,
} from "@/features/navigation/shared";
import type { WorkspaceRow, WorkspaceStatus } from "@/lib/api";
import { workspaceDiffStatsQueryOptions } from "@/lib/query-client";
import { cn } from "@/lib/utils";

export type KanbanCardProps = {
	row: WorkspaceRow;
	onSelect: (workspaceId: string) => void;
	onSetStatus: (workspaceId: string, status: WorkspaceStatus) => void;
	onCreatePr: (workspaceId: string) => void;
};

function KanbanCardBody({
	row,
	onSelect,
	onSetStatus,
	onCreatePr,
	dragging,
	overlay,
}: KanbanCardProps & { dragging?: boolean; overlay?: boolean }) {
	const diffStatsQuery = useQuery(workspaceDiffStatsQueryOptions(row.id));
	const diff = diffStatsQuery.data;
	const hasChanges = Boolean(
		diff && (diff.additions > 0 || diff.deletions > 0),
	);

	const branchLabel = row.branch ? humanizeBranch(row.branch) : null;
	const status = row.status ?? "backlog";
	const prState = row.prSyncState ?? "none";
	const hasPr = prState !== "none" && Boolean(row.prUrl);
	const canCreatePr = Boolean(row.branch) && hasChanges && !hasPr;
	const showBranch = Boolean(branchLabel) && (hasChanges || hasPr);

	const currentStatus =
		STATUS_OPTIONS.find((opt) => opt.value === status) ?? STATUS_OPTIONS[0];

	const projectInitials =
		row.repoInitials?.trim() || row.repoName?.slice(0, 2).toUpperCase() || "WS";

	const createdLabel = (() => {
		if (hasChanges || !row.createdAt) return null;
		const parsed = Date.parse(row.createdAt);
		if (!Number.isFinite(parsed)) return null;
		return formatDistanceToNowStrict(new Date(parsed), { addSuffix: true });
	})();

	return (
		<div
			className={cn(
				"flex flex-col gap-2 rounded-lg border bg-card p-3 text-left",
				"transition-[box-shadow,border-color,background-color] duration-150",
				hasPr
					? "border-[var(--workspace-branch-status-open)]/40 bg-[var(--workspace-branch-status-open)]/[0.04]"
					: "border-border/40",
				overlay
					? "scale-[1.02] cursor-grabbing shadow-2xl ring-1 ring-foreground/10"
					: "cursor-grab shadow-sm hover:border-border",
				dragging && !overlay && "invisible",
			)}
		>
			<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<span
					className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted text-[8px] font-semibold uppercase text-muted-foreground"
					aria-hidden="true"
					title={row.repoName ?? undefined}
				>
					{row.repoIconSrc ? (
						<img
							src={row.repoIconSrc}
							alt=""
							className="size-full object-cover"
						/>
					) : (
						projectInitials
					)}
				</span>
				{showBranch && branchLabel ? (
					<span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate font-mono">
						<GitBranch className="size-3 shrink-0" strokeWidth={2} />
						<span className="truncate">{branchLabel}</span>
					</span>
				) : (
					<span className="flex-1" />
				)}
				{hasChanges && diff ? (
					<DiffStatsBadge
						additions={diff.additions}
						deletions={diff.deletions}
						className="text-[11px]"
					/>
				) : createdLabel ? (
					<span
						className="shrink-0 text-[11px] text-muted-foreground/70"
						title={row.createdAt ?? undefined}
					>
						{createdLabel}
					</span>
				) : null}
			</div>

			<button
				type="button"
				onClick={() => onSelect(row.id)}
				onMouseDown={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
				className="cursor-pointer text-left text-[13px] font-medium leading-snug text-foreground hover:underline"
			>
				{row.title}
			</button>

			<div className="mt-1 flex items-center gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							onMouseDown={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}
							aria-label={`Status: ${currentStatus.label}`}
							title={currentStatus.label}
							className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60"
						>
							<GroupIcon tone={currentStatus.tone} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="min-w-40">
						{STATUS_OPTIONS.map((opt) => (
							<DropdownMenuItem
								key={opt.value}
								onClick={() => onSetStatus(row.id, opt.value)}
							>
								<GroupIcon tone={opt.tone} />
								<span className="flex-1">{opt.label}</span>
								{status === opt.value ? (
									<span className="ml-auto text-foreground">✓</span>
								) : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<div
					className="ml-auto"
					onMouseDown={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					{hasPr ? (
						<a
							href={row.prUrl ?? "#"}
							target="_blank"
							rel="noreferrer"
							className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--workspace-branch-status-open)]/40 bg-[var(--workspace-branch-status-open)]/10 px-1.5 py-0.5 text-[11px] text-[var(--workspace-branch-status-open)] hover:bg-[var(--workspace-branch-status-open)]/20"
						>
							<GitPullRequest className="size-3" strokeWidth={2} />
							<span>PR</span>
							<ExternalLink className="size-2.5" strokeWidth={2} />
						</a>
					) : canCreatePr ? (
						<Button
							size="sm"
							variant="ghost"
							className="h-6 gap-1 px-1.5 text-[11px]"
							onClick={() => onCreatePr(row.id)}
						>
							<GitPullRequest className="size-3" strokeWidth={2} />
							Create PR
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}

export const KanbanCard = memo(function KanbanCard(props: KanbanCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: props.row.id,
		data: { type: "card", row: props.row },
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<KanbanCardBody {...props} dragging={isDragging} />
		</div>
	);
});

export const KanbanCardOverlay = memo(function KanbanCardOverlay(
	props: KanbanCardProps,
) {
	return <KanbanCardBody {...props} overlay />;
});
