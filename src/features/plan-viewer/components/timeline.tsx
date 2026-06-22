import {
	CircleCheckIcon,
	CircleDotIcon,
	CircleIcon,
	MilestoneIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { accentClasses, type PlanAccent } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Status = "done" | "active" | "todo";

const STATUS: Record<
	Status,
	{
		accent: PlanAccent;
		Icon: ComponentType<{ className?: string }>;
		label: string;
	}
> = {
	done: { accent: "success", Icon: CircleCheckIcon, label: "Done" },
	active: { accent: "info", Icon: CircleDotIcon, label: "Active" },
	todo: { accent: "neutral", Icon: CircleIcon, label: "To do" },
};

function normalizeStatus(value?: string): Status {
	if (value === "done" || value === "active" || value === "todo") {
		return value;
	}
	return "todo";
}

type TimelinePhase = {
	id: string;
	title: string;
	status: Status;
	body: PlanBlock[];
};

function extractPhases(childBlocks: PlanBlock[]): TimelinePhase[] {
	const phases: TimelinePhase[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Phase") {
			continue;
		}
		phases.push({
			id: block.id,
			title: block.props.title?.trim() || "Phase",
			status: normalizeStatus(block.props.status),
			body: block.childBlocks,
		});
	}
	return phases;
}

/**
 * `Timeline` renders a sequenced list of milestones. Each `<Phase>` carries an
 * optional `status` (`done` | `active` | `todo`) shown via a colored marker.
 */
export function Timeline({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const phases = extractPhases(childBlocks);
	if (phases.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={MilestoneIcon} title="Timeline">
			<ol className="flex flex-col">
				{phases.map((phase, i) => {
					const { accent, Icon, label } = STATUS[phase.status];
					const styles = accentClasses(accent);
					const isLast = i === phases.length - 1;
					return (
						<li key={phase.id} className="flex gap-3">
							{/* Spine: a status node with a connector line running to the
							 * next phase. The node sits on an elevated `bg-background`
							 * disc so it reads against the grey shell. */}
							<div className="flex flex-col items-center">
								<span
									className={cn(
										"flex size-6 shrink-0 items-center justify-center rounded-full border bg-background",
										styles.badge,
									)}
								>
									<Icon className="size-3.5" />
								</span>
								{!isLast ? (
									<span className="w-px flex-1 bg-border" aria-hidden="true" />
								) : null}
							</div>
							<div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
								<div className="flex items-center gap-2">
									<span className="font-medium text-small">{phase.title}</span>
									<span
										className={cn(
											"shrink-0 rounded border px-1.5 py-0.5 text-nano uppercase tracking-wide",
											styles.badge,
										)}
									>
										{label}
									</span>
								</div>
								{phase.body.length > 0 ? (
									<div className="mt-1 text-small text-muted-foreground">
										{renderBlocks(phase.body)}
									</div>
								) : null}
							</div>
						</li>
					);
				})}
			</ol>
		</PlanBlockShell>
	);
}
