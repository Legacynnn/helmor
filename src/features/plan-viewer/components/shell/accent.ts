/**
 * Semantic accent for a plan block. The single source of truth for plan
 * component colors — every block (and inline badge) routes its border / header
 * text / chip color through {@link accentClasses} so the whole Plan view stays
 * visually consistent. Hues intentionally match the pre-shell components:
 * info=sky, warning=amber, danger=red, success=emerald, highlight=violet.
 */
export type PlanAccent =
	| "neutral"
	| "info"
	| "warning"
	| "danger"
	| "success"
	| "highlight";

export type AccentClasses = {
	/** Border + faint background for a block container. */
	container: string;
	/** Header label / icon color. */
	header: string;
	/** Inline chip (border + text) for small badges. */
	badge: string;
};

const ACCENTS: Record<PlanAccent, AccentClasses> = {
	neutral: {
		container: "border-border/70 bg-card",
		header: "text-foreground",
		badge: "border-border/70 text-muted-foreground",
	},
	info: {
		container: "border-sky-500/40 bg-sky-500/5",
		header: "text-sky-600 dark:text-sky-400",
		badge: "border-sky-500/40 text-sky-600 dark:text-sky-400",
	},
	warning: {
		container: "border-amber-500/40 bg-amber-500/5",
		header: "text-amber-600 dark:text-amber-400",
		badge: "border-amber-500/40 text-amber-600 dark:text-amber-400",
	},
	danger: {
		// Container border is /45 (not /40 like the others) — preserved from the
		// original RiskCard high-risk styling so the visual stays unchanged.
		container: "border-red-500/45 bg-red-500/5",
		header: "text-red-600 dark:text-red-400",
		badge: "border-red-500/40 text-red-600 dark:text-red-400",
	},
	success: {
		container: "border-emerald-500/40 bg-emerald-500/5",
		header: "text-emerald-600 dark:text-emerald-400",
		badge: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
	},
	highlight: {
		container: "border-violet-500/40 bg-violet-500/5",
		header: "text-violet-600 dark:text-violet-400",
		badge: "border-violet-500/40 text-violet-600 dark:text-violet-400",
	},
};

/** Resolve Tailwind class strings for a semantic accent (defaults to neutral). */
export function accentClasses(accent: PlanAccent = "neutral"): AccentClasses {
	return ACCENTS[accent] ?? ACCENTS.neutral;
}
