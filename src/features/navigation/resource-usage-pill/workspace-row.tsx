import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import { useState } from "react";
import type { ResourceWorkspaceUsage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytesShort, formatCpu } from "./format";
import { ProcessRow } from "./process-row";
import type { MetricMode } from "./types";

export function WorkspaceRow({
	workspace,
	metric,
	indent = 1,
	defaultExpanded = false,
}: {
	workspace: ResourceWorkspaceUsage;
	metric: MetricMode;
	indent?: number;
	defaultExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasProcesses = workspace.processes.length > 0;
	const branchLabel = workspace.branch ?? null;

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => hasProcesses && setExpanded((v) => !v)}
				className={cn(
					"flex items-center gap-2 py-[5px] pr-4 text-[11.5px] text-foreground/85",
					hasProcesses
						? "cursor-pointer hover:bg-foreground/[0.04]"
						: "cursor-default opacity-80",
				)}
				style={{ paddingLeft: 16 + indent * 14 }}
				disabled={!hasProcesses}
			>
				{hasProcesses ? (
					expanded ? (
						<ChevronDown
							className="size-3 shrink-0 text-muted-foreground/70"
							strokeWidth={2}
						/>
					) : (
						<ChevronRight
							className="size-3 shrink-0 text-muted-foreground/70"
							strokeWidth={2}
						/>
					)
				) : (
					<span className="size-3 shrink-0" />
				)}
				<GitBranch
					className="size-3 shrink-0 text-muted-foreground/65"
					strokeWidth={2}
				/>
				<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
					<span className="truncate">{workspace.workspaceTitle}</span>
					{branchLabel ? (
						<span className="truncate font-mono text-[10px] text-muted-foreground/55">
							{branchLabel}
						</span>
					) : null}
				</span>
				<span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground/85">
					{metric === "memory"
						? formatBytesShort(workspace.memoryBytes)
						: formatCpu(workspace.cpuPercent)}
				</span>
			</button>
			{expanded && hasProcesses ? (
				<div className="border-l border-white/5">
					{workspace.processes.map((process) => (
						<ProcessRow
							key={process.pid}
							node={process}
							metric={metric}
							indent={indent + 1}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}
