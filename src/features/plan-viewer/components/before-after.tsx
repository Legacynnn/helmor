import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import type { PlanAccent } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

function childBody(childBlocks: PlanBlock[], name: string): PlanBlock[] {
	const block = childBlocks.find(
		(b) => b.kind === "component" && b.name === name,
	);
	return block && block.kind === "component" ? block.childBlocks : [];
}

type Panel = {
	key: string;
	accent: PlanAccent;
	title: string;
	body: PlanBlock[];
};

/**
 * `BeforeAfter` shows a side-by-side comparison of current vs. proposed
 * behavior, authored as `<BeforeAfter><Before>…</Before><After>…</After></BeforeAfter>`.
 * Only the sides that have content render; with one side it falls back to a
 * single full-width panel rather than showing an empty placeholder.
 */
export function BeforeAfter({
	childBlocks = [],
}: {
	childBlocks?: PlanBlock[];
}) {
	const before = childBody(childBlocks, "Before");
	const after = childBody(childBlocks, "After");
	const panels: Panel[] = [];
	if (before.length > 0) {
		panels.push({
			key: "before",
			accent: "warning",
			title: "Before",
			body: before,
		});
	}
	if (after.length > 0) {
		panels.push({
			key: "after",
			accent: "success",
			title: "After",
			body: after,
		});
	}
	if (panels.length === 0) {
		return null;
	}
	return (
		<div
			className={panels.length > 1 ? "my-4 grid gap-3 sm:grid-cols-2" : "my-4"}
		>
			{panels.map((panel) => (
				<PlanBlockShell
					key={panel.key}
					accent={panel.accent}
					title={panel.title}
					className="my-0"
				>
					{renderBlocks(panel.body)}
				</PlanBlockShell>
			))}
		</div>
	);
}
