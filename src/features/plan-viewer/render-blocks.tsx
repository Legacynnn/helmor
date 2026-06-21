import { Fragment, type ReactNode } from "react";
import { UnsupportedBlock } from "./components/placeholder";
import { PlanMarkdown } from "./components/plan-markdown";
import type { PlanBlock } from "./mdx/parse";
import { PLAN_COMPONENTS } from "./mdx/registry";

/** Render a single plan block (prose, known component, or fallback). */
export function renderBlock(block: PlanBlock): ReactNode {
	if (block.kind === "prose") {
		return <PlanMarkdown>{block.markdown}</PlanMarkdown>;
	}
	const def = PLAN_COMPONENTS[block.name];
	if (!def) {
		return <UnsupportedBlock name={block.name} />;
	}
	const Cmp = def.render;
	if (def.childMode === "structured") {
		return <Cmp {...block.props} childBlocks={block.childBlocks} />;
	}
	if (def.childMode === "blocks") {
		return <Cmp {...block.props}>{renderBlocks(block.childBlocks)}</Cmp>;
	}
	return <Cmp {...block.props}>{block.rawText}</Cmp>;
}

/** Render an ordered list of plan blocks as React nodes, keyed by block id. */
export function renderBlocks(blocks: PlanBlock[]): ReactNode {
	return blocks.map((block) => (
		<Fragment key={block.id}>{renderBlock(block)}</Fragment>
	));
}
