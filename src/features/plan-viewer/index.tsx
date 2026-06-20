import { useCallback } from "react";
import { setPlanStatus } from "@/lib/api";
import {
	type BlockComment,
	buildFeedbackPrompt,
	dispatchSubmitPlanFeedback,
} from "./feedback";
import { PlanView } from "./plan-view";
import { usePlan } from "./use-plan";

/**
 * Data container for a single plan document. Reads (sessionId, slug) via
 * {@link usePlan} and renders {@link PlanView}, wiring Approve to the
 * `set_plan_status` mutation. Request-changes builds a structured prompt from
 * the user's block-anchored comments and dispatches the
 * `helmor:submit-plan-feedback` window event — the conversation container
 * listens and routes it through the composer's submit path, staying in plan
 * mode. Handoff is passed through for a later task.
 */
export function PlanViewContainer({
	sessionId,
	slug,
	onHandoff,
}: {
	sessionId: string;
	slug: string;
	onHandoff: () => void;
}) {
	const { data, isError } = usePlan(sessionId, slug);

	const handleRequestChanges = useCallback(
		(comments: BlockComment[]) => {
			dispatchSubmitPlanFeedback({
				sessionId,
				prompt: buildFeedbackPrompt(slug, comments),
			});
		},
		[sessionId, slug],
	);

	if (isError) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-small">
				Failed to load plan.
			</div>
		);
	}

	if (!data) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-small">
				Loading plan…
			</div>
		);
	}

	return (
		<PlanView
			content={data.content}
			status={data.summary.status}
			onRequestChanges={handleRequestChanges}
			onApprove={() => void setPlanStatus(sessionId, slug, "approved")}
			onHandoff={onHandoff}
		/>
	);
}
