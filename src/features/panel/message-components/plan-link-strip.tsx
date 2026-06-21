import { ClipboardList } from "lucide-react";
import { usePlanList } from "@/features/plan-viewer/use-plan";
import type { ThreadMessageLike } from "@/lib/api";
import { dispatchOpenPlan, latestMdxPlanSlug } from "@/lib/plan-review";

/**
 * Persistent, pinned link to the session's plan. Rendered at the top of the
 * chat thread (a non-scrolling sibling of the message scroll area) so the plan
 * is always one click away. Returns null when the session has no plan file.
 */
export function PlanLinkStrip({
	sessionId,
	messages,
}: {
	sessionId: string;
	messages: ThreadMessageLike[];
}) {
	const { data: plans } = usePlanList(sessionId);

	if (!plans || plans.length === 0) {
		return null;
	}

	// Prefer the plan the agent most recently produced (latest plan-review in the
	// loaded messages); fall back to the first listed plan when none is visible
	// (e.g. a reopened, paginated session).
	const latestSlug = latestMdxPlanSlug(messages);
	const featured =
		(latestSlug && plans.find((p) => p.slug === latestSlug)) || plans[0];
	if (!featured) {
		return null;
	}

	return (
		<div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 bg-background/60 px-4 py-2">
			<ClipboardList
				className="size-4 shrink-0 text-muted-foreground"
				strokeWidth={1.8}
			/>
			<span className="min-w-0 flex-1 truncate text-ui leading-5 text-foreground">
				{featured.title}
				{plans.length > 1 ? (
					<span className="ml-1.5 text-muted-foreground">
						· {plans.length} plans
					</span>
				) : null}
			</span>
			<button
				type="button"
				onClick={() => dispatchOpenPlan({ slug: featured.slug, sessionId })}
				className="shrink-0 cursor-pointer rounded-md border border-border/70 bg-background px-2.5 py-1 text-small font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
			>
				Open
			</button>
		</div>
	);
}
