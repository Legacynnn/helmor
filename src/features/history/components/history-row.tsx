import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronRight, GitBranch } from "lucide-react";
import { memo } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import { DiffStatsBadge } from "@/features/navigation/diff-stats-badge";
import { humanizeBranch } from "@/features/navigation/shared";
import type { WorkspaceRow } from "@/lib/api";
import { parsePrUrl } from "@/lib/pr-url";
import { workspaceDiffStatsQueryOptions } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { rowTimestamp } from "../utils/group-by-day";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function formatDate(ms: number): string {
	if (!ms) return "";
	const date = new Date(ms);
	return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export type HistoryRowProps = {
	row: WorkspaceRow;
	onSelect: (workspaceId: string) => void;
	onArchive: (workspaceId: string) => void;
	onRestore: (workspaceId: string) => void;
	isArchiving: boolean;
	isRestoring: boolean;
};

export const HistoryRow = memo(function HistoryRow({
	row,
	onSelect,
	onArchive,
	onRestore,
	isArchiving,
	isRestoring,
}: HistoryRowProps) {
	const archived = row.state === "archived";
	const diffStatsQuery = useQuery({
		...workspaceDiffStatsQueryOptions(row.id),
		enabled: !archived,
	});
	const diffStats = diffStatsQuery.data;
	const parsedPr = parsePrUrl(row.prUrl);
	const branchLabel = row.branch ? humanizeBranch(row.branch) : "";
	const dateLabel = formatDate(rowTimestamp(row));

	const handleClick = () => {
		if (archived) return;
		onSelect(row.id);
	};

	return (
		<div
			role={archived ? undefined : "button"}
			tabIndex={archived ? -1 : 0}
			aria-label={`${row.repoName ?? "workspace"}: ${row.title}`}
			onClick={handleClick}
			onKeyDown={(event) => {
				if (archived) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(row.id);
				}
			}}
			className={cn(
				"group/history-row flex h-9 items-center gap-3 rounded-md px-4 text-[13px]",
				archived
					? "cursor-default text-muted-foreground/55 hover:bg-accent/20"
					: "cursor-pointer hover:bg-accent/50",
			)}
		>
			<span
				aria-hidden="true"
				className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/70"
			>
				{archived ? (
					<Archive className="size-3.5" strokeWidth={1.75} />
				) : (
					<span className="size-1.5 rounded-full bg-muted-foreground/40" />
				)}
			</span>

			<div className="flex w-44 shrink-0 items-center gap-2 truncate">
				<WorkspaceAvatar
					repoIconSrc={row.repoIconSrc}
					repoInitials={row.repoInitials}
					repoName={row.repoName}
					title={row.title}
				/>
				<span className="truncate font-medium text-foreground/90">
					{row.repoName ?? "—"}
				</span>
			</div>

			<ChevronRight
				className="size-3 shrink-0 text-muted-foreground/40"
				strokeWidth={2}
			/>

			<span className="min-w-0 flex-1 truncate text-foreground/90">
				{row.title}
			</span>

			{branchLabel ? (
				<span className="hidden shrink-0 items-center gap-1 text-muted-foreground/80 sm:flex">
					<span aria-hidden="true">·</span>
					<span className="max-w-[160px] truncate">{branchLabel}</span>
				</span>
			) : null}

			<div className="ml-auto flex shrink-0 items-center gap-3">
				{!archived && diffStats ? (
					<DiffStatsBadge
						additions={diffStats.additions}
						deletions={diffStats.deletions}
						className="text-[11px]"
					/>
				) : null}
				{parsedPr ? (
					<span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/80 tabular-nums">
						<GitBranch className="size-3" strokeWidth={2} />#{parsedPr.number}
					</span>
				) : null}
				<div className="relative w-14 text-right">
					<span
						className={cn(
							"block text-[11px] tabular-nums text-muted-foreground/70 transition-opacity",
							"group-hover/history-row:opacity-0 group-focus-within/history-row:opacity-0",
						)}
						aria-hidden={undefined}
					>
						{dateLabel}
					</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								disabled={archived ? isRestoring : isArchiving}
								onClick={(event) => {
									event.stopPropagation();
									if (archived) {
										onRestore(row.id);
									} else {
										onArchive(row.id);
									}
								}}
								aria-label={
									archived ? "Unarchive workspace" : "Archive workspace"
								}
								className={cn(
									"absolute inset-0 flex cursor-pointer items-center justify-end rounded-md text-muted-foreground opacity-0 transition-opacity",
									"hover:text-foreground",
									"group-hover/history-row:opacity-100 group-focus-within/history-row:opacity-100",
									"disabled:cursor-progress disabled:opacity-100",
								)}
							>
								{archived ? (
									<ArchiveRestore className="size-3.5" strokeWidth={2} />
								) : (
									<Archive className="size-3.5" strokeWidth={2} />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="left" sideOffset={6}>
							{archived
								? isRestoring
									? "Restoring…"
									: "Unarchive workspace"
								: isArchiving
									? "Archiving…"
									: "Archive workspace"}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	);
});
