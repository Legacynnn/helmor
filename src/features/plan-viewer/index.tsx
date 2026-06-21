import { useCallback } from "react";
import { setPlanStatus } from "@/lib/api";
import {
	type BlockComment,
	buildFeedbackPrompt,
	dispatchSubmitPlanFeedback,
} from "./feedback";
import { dispatchHandoffSession } from "./handoff";
import { PlanView } from "./plan-view";
import { usePlan } from "./use-plan";

/**
 * Data container for a single plan document. Reads (sessionId, slug) via
 * {@link usePlan} and renders {@link PlanView}. Request-changes builds a structured prompt from
 * the user's block-anchored comments and dispatches the
 * `helmor:submit-plan-feedback` window event — the conversation container
 * listens and routes it through the composer's submit path, staying in plan
 * mode. Handoff marks the plan `handed-off` and seeds a fresh sibling session
 * (in the same workspace) with an implementation prompt via the shared
 * `helmor:create-prefilled-session` mechanism.
 *
 * NOTE: a workspace-scoped filesystem watcher publishes `planFileChanged` on any
 * `.helmor/plans/*.mdx` change, including the agent's own in-place edits, so this
 * view live-updates during the revision turn (it also still refreshes on tab
 * re-select / refetch).
 */
export function PlanViewContainer({
	sessionId,
	workspaceId,
	slug,
}: {
	sessionId: string;
	workspaceId: string;
	slug: string;
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

	// Mark the plan handed-off (broadcasts planFileChanged → refreshes the
	// status badge), then create the fresh implementation session. Fire-and-
	// forget with error logging.
	const handleHandoff = useCallback(() => {
		void (async () => {
			try {
				await setPlanStatus(sessionId, slug, "handed-off");
				dispatchHandoffSession(workspaceId, slug);
			} catch (error) {
				console.error("[helmor] plan handoff failed", error);
			}
		})();
	}, [sessionId, workspaceId, slug]);

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
			onHandoff={handleHandoff}
		/>
	);
}
