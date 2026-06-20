/** A user comment anchored to a single plan block. */
export type BlockComment = {
	blockId: string;
	blockName: string;
	comment: string;
};

/** Window event payload for routing block-anchored plan feedback back to the
 *  agent. Dispatched by {@link PlanViewContainer} and consumed by the
 *  conversation container, which submits `prompt` to `sessionId`'s composer
 *  staying in plan mode. Mirrors the `helmor:open-plan` pattern in
 *  `@/lib/plan-review` so the plan surface stays decoupled from the composer. */
export type SubmitPlanFeedbackEventDetail = {
	sessionId: string;
	prompt: string;
};

export const SUBMIT_PLAN_FEEDBACK_EVENT = "helmor:submit-plan-feedback";

/** Fire the cross-component "submit this plan feedback to the agent" signal. */
export function dispatchSubmitPlanFeedback(
	detail: SubmitPlanFeedbackEventDetail,
): void {
	window.dispatchEvent(new CustomEvent(SUBMIT_PLAN_FEEDBACK_EVENT, { detail }));
}

/**
 * Build the structured prompt asking an agent to revise a plan document. The
 * prompt always references the plan file by its `.helmor/plans/<slug>.mdx`
 * path and instructs targeted edits using only the approved MDX components,
 * so unrelated sections are left untouched. Each non-empty {@link BlockComment}
 * is rendered as `- [block <id> · <name>] <comment>`. When no comments are
 * supplied a general "revise the plan" instruction is returned instead.
 */
export function buildFeedbackPrompt(
	slug: string,
	comments: BlockComment[],
): string {
	const path = `.helmor/plans/${slug}.mdx`;
	const nonEmpty = comments.filter((c) => c.comment.trim().length > 0);

	const guidance = [
		`Please revise the plan at \`${path}\`.`,
		"Make targeted edits in place using only the approved MDX plan components — do not rewrite unrelated sections, and keep the rest of the document intact.",
	];

	if (nonEmpty.length === 0) {
		return [
			...guidance,
			"",
			"Revise the plan to address the concerns discussed.",
		].join("\n");
	}

	const lines = nonEmpty.map(
		(c) => `- [block ${c.blockId} · ${c.blockName}] ${c.comment.trim()}`,
	);

	return [
		...guidance,
		"",
		"Address the following block-anchored comments:",
		...lines,
	].join("\n");
}
