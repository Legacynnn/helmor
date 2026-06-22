import { ArrowRight, ClipboardList } from "lucide-react";
import { usePlanList } from "@/features/plan-viewer/use-plan";
import type { PlanLifecycle } from "@/lib/api";
import { dispatchOpenPlan } from "@/lib/plan-review";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<
	PlanLifecycle,
	{ label: string; className: string }
> = {
	draft: {
		label: "Draft",
		className:
			"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	},
	approved: {
		label: "Approved",
		className:
			"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	},
	"handed-off": {
		label: "Handed off",
		className: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	},
};

function PlanStatusBadge({ status }: { status: PlanLifecycle }) {
	const meta = STATUS_BADGE[status];
	if (!meta) {
		return null;
	}
	return (
		<span
			className={cn(
				"shrink-0 rounded-full border px-1.5 py-0.5 text-nano font-medium uppercase tracking-wide",
				meta.className,
			)}
		>
			{meta.label}
		</span>
	);
}

/**
 * Rich "plan ready" card shown inline in the conversation when the agent
 * finishes writing an MDX plan. With the pinned top strip removed, this is the
 * primary entry point into the Plan tab — so it surfaces the plan's title and
 * lifecycle status and reads as one inviting, clickable target.
 */
export function PlanReadyCard({
	sessionId,
	slug,
}: {
	sessionId: string | null | undefined;
	slug: string | null;
}) {
	// Resolve the plan's title + status from the session's plan list (cached).
	const { data: plans } = usePlanList(slug && sessionId ? sessionId : null);
	const summary = slug ? plans?.find((p) => p.slug === slug) : undefined;
	const title = summary?.title?.trim() || "Plan ready";
	const canOpen = Boolean(slug);

	const open = () => {
		if (slug) {
			dispatchOpenPlan({ slug, sessionId });
		}
	};

	return (
		<button
			type="button"
			onClick={open}
			disabled={!canOpen}
			className={cn(
				"group flex w-full items-center gap-3 rounded-xl border-[1.5px] border-border/70 bg-gradient-to-br from-background/70 to-muted/30 px-3.5 py-3 text-left transition-colors",
				canOpen
					? "cursor-pointer hover:border-border hover:to-muted/50"
					: "cursor-default",
			)}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<ClipboardList className="size-4" strokeWidth={1.8} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-center gap-2">
					<span className="min-w-0 truncate text-ui font-medium text-foreground">
						{title}
					</span>
					{summary ? <PlanStatusBadge status={summary.status} /> : null}
				</span>
				<span className="text-mini text-muted-foreground">
					Interactive plan — open to review and approve.
				</span>
			</span>
			{canOpen ? (
				<span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-small font-medium text-primary-foreground transition-transform group-hover:translate-x-0.5">
					Open
					<ArrowRight className="size-3.5" strokeWidth={2} />
				</span>
			) : null}
		</button>
	);
}
