import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { PlanBlockShell } from "./shell/plan-block-shell";

function childBody(childBlocks: PlanBlock[], name: string): PlanBlock[] {
	const block = childBlocks.find(
		(b) => b.kind === "component" && b.name === name,
	);
	return block && block.kind === "component" ? block.childBlocks : [];
}

/**
 * `BeforeAfter` shows a side-by-side comparison of current vs. proposed
 * behavior, authored as `<BeforeAfter><Before>…</Before><After>…</After></BeforeAfter>`.
 */
export function BeforeAfter({
	childBlocks = [],
}: {
	childBlocks?: PlanBlock[];
}) {
	const before = childBody(childBlocks, "Before");
	const after = childBody(childBlocks, "After");
	if (before.length === 0 && after.length === 0) {
		return null;
	}
	return (
		<div className="my-4 grid gap-3 sm:grid-cols-2">
			<PlanBlockShell accent="warning" title="Before" className="my-0">
				{renderBlocks(before)}
			</PlanBlockShell>
			<PlanBlockShell accent="success" title="After" className="my-0">
				{renderBlocks(after)}
			</PlanBlockShell>
		</div>
	);
}
