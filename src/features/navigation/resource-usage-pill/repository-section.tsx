import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import type { ResourceRepoGroup } from "@/lib/api";
import { SIDECAR_AGENTS_REPO_ID } from "@/lib/api";
import { cn } from "@/lib/utils";
import { WorkspaceAvatar } from "../avatar";
import { formatBytesShort, formatCpu } from "./format";
import type { MetricMode } from "./types";
import { WorkspaceRow } from "./workspace-row";

export function RepositorySection({
	repo,
	metric,
	expanded,
	onToggle,
}: {
	repo: ResourceRepoGroup;
	metric: MetricMode;
	expanded: boolean;
	onToggle: () => void;
}) {
	const isSidecarBucket = repo.repoId === SIDECAR_AGENTS_REPO_ID;

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex cursor-pointer items-center gap-2 px-4 py-1.5 text-[11.5px] font-medium text-foreground/90 hover:bg-foreground/[0.05]",
					expanded && "bg-foreground/[0.025]",
				)}
			>
				{expanded ? (
					<ChevronDown
						className="size-3 shrink-0 text-muted-foreground/70"
						strokeWidth={2}
					/>
				) : (
					<ChevronRight
						className="size-3 shrink-0 text-muted-foreground/70"
						strokeWidth={2}
					/>
				)}
				{isSidecarBucket ? (
					<span className="flex size-[16px] shrink-0 items-center justify-center rounded-[5px] bg-foreground/10 text-foreground/75">
						<Bot className="size-2.5" strokeWidth={2.2} />
					</span>
				) : (
					<WorkspaceAvatar
						repoIconSrc={repo.repoIconSrc}
						repoInitials={repo.repoInitials}
						repoName={repo.repoLabel}
						title={repo.repoLabel}
					/>
				)}
				<span className="flex-1 truncate">{repo.repoLabel}</span>
				<span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground/90">
					{metric === "memory"
						? formatBytesShort(repo.memoryBytes)
						: formatCpu(repo.cpuPercent)}
				</span>
			</button>
			{expanded ? (
				<div className="border-l border-white/5">
					{repo.workspaces.map((ws) => (
						<WorkspaceRow
							key={ws.workspaceId}
							workspace={ws}
							metric={metric}
							defaultExpanded={isSidecarBucket}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}
