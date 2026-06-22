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
	{ accent: PlanAccent; Icon: ComponentType<{ className?: string }> }
> = {
	done: { accent: "success", Icon: CircleCheckIcon },
	active: { accent: "info", Icon: CircleDotIcon },
	todo: { accent: "neutral", Icon: CircleIcon },
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
			<ol className="flex flex-col gap-3">
				{phases.map((phase) => {
					const { accent, Icon } = STATUS[phase.status];
					const styles = accentClasses(accent);
					return (
						<li key={phase.id} className="flex gap-3">
							<Icon className={cn("mt-0.5 size-4 shrink-0", styles.header)} />
							<div className="min-w-0">
								<div className="font-medium text-small">{phase.title}</div>
								<div className="text-small text-muted-foreground">
									{renderBlocks(phase.body)}
								</div>
							</div>
						</li>
					);
				})}
			</ol>
		</PlanBlockShell>
	);
}
