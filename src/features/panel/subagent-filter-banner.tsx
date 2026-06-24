/**
 * Thin filter bar pinned at the top of the thread viewport whenever a subagent
 * filter is active. Shows the subagent's identity (pixel sprite + name + type)
 * and a few derived activity stats (tool uses / files / steps + running state),
 * with a "Show all" affordance. Stays even after the subagent finishes and the
 * composer strip collapses, so the filter is always clearable.
 *
 * Per-token usage isn't surfaced — it isn't carried on any rendered part, so the
 * banner reports the activity it can actually count (see `summarizeSubagent`).
 */

import { Hammer, ListTree, Pencil, X } from "lucide-react";
import type { SubagentSummary } from "@/features/composer/subagent-strip/extract-subagents";
import { SubagentPixelAvatar } from "@/features/composer/subagent-strip/pixel-avatar";
import { useSubagentFilter } from "@/features/conversation/state/subagent-filter-store";

export function SubagentFilterBanner({
	sessionId,
	summary,
}: {
	sessionId: string;
	summary: SubagentSummary | null;
}) {
	const { active, clearFilter } = useSubagentFilter(sessionId);
	if (!active) return null;
	const color = summary?.color;
	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-accent/40 px-4 py-1.5 text-small text-muted-foreground">
			{color ? (
				<SubagentPixelAvatar
					seedKey={active.key}
					color={color}
					size={16}
					className="shrink-0 rounded-[4px]"
				/>
			) : null}
			<span className="min-w-0 truncate">
				<span className="text-muted-foreground/70">Filtering by </span>
				<span className="font-medium text-foreground">{active.name}</span>
			</span>
			{summary?.agentType ? (
				<span className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-mini font-medium text-muted-foreground">
					{summary.agentType}
				</span>
			) : null}

			{summary ? (
				<div className="flex min-w-0 shrink items-center gap-3 overflow-hidden pl-1 text-mini tabular-nums text-muted-foreground/80">
					<Stat icon={<Hammer className="size-3" strokeWidth={1.8} />}>
						{summary.toolUses}{" "}
						{summary.toolUses === 1 ? "tool use" : "tool uses"}
					</Stat>
					{summary.filesTouched > 0 ? (
						<Stat icon={<Pencil className="size-3" strokeWidth={1.8} />}>
							{summary.filesTouched}{" "}
							{summary.filesTouched === 1 ? "file" : "files"}
						</Stat>
					) : null}
					<Stat icon={<ListTree className="size-3" strokeWidth={1.8} />}>
						{summary.steps} {summary.steps === 1 ? "step" : "steps"}
					</Stat>
					<span className="flex shrink-0 items-center gap-1">
						{summary.running ? (
							<span
								className="size-1.5 rounded-full"
								style={{ backgroundColor: color }}
							/>
						) : (
							<span className="size-1.5 rounded-full bg-chart-2" />
						)}
						{summary.running ? "Running" : "Done"}
					</span>
				</div>
			) : null}

			<button
				type="button"
				onClick={clearFilter}
				className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground/80 hover:bg-background/60 hover:text-foreground"
			>
				<X className="size-3" strokeWidth={2} />
				Show all
			</button>
		</div>
	);
}

function Stat({
	icon,
	children,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
			{icon}
			{children}
		</span>
	);
}
