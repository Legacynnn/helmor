import { setPlanStatus } from "@/lib/api";
import { PlanView } from "./plan-view";
import { usePlan } from "./use-plan";

/**
 * Data container for a single plan document. Reads (sessionId, slug) via
 * {@link usePlan} and renders {@link PlanView}, wiring Approve to the
 * `set_plan_status` mutation. Request-changes / handoff are passed through as
 * callbacks so later tasks can implement them at the call site.
 */
export function PlanViewContainer({
	sessionId,
	slug,
	onRequestChanges,
	onHandoff,
}: {
	sessionId: string;
	slug: string;
	onRequestChanges: () => void;
	onHandoff: () => void;
}) {
	const { data } = usePlan(sessionId, slug);

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
			onRequestChanges={onRequestChanges}
			onApprove={() => void setPlanStatus(sessionId, slug, "approved")}
			onHandoff={onHandoff}
		/>
	);
}
