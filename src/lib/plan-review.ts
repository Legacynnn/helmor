import type { ThreadMessageLike } from "./api";

/** Matches a Helmor MDX plan file path: `.helmor/plans/<slug>.mdx`. The slug
 *  is captured for `planSlugFromPath`. Anchored on the `.helmor/plans/` segment
 *  so absolute paths (e.g. `/repo/.helmor/plans/foo.mdx`) still match. */
const MDX_PLAN_PATH_RE = /(?:^|\/)\.helmor\/plans\/([^/]+)\.mdx$/;

/** True when `path` points at an MDX plan document (`.helmor/plans/<slug>.mdx`). */
export function isMdxPlanPath(path?: string | null): boolean {
	return planSlugFromPath(path) !== null;
}

/** Extracts the `<slug>` from a `.helmor/plans/<slug>.mdx` path, or null. */
export function planSlugFromPath(path?: string | null): string | null {
	if (!path) return null;
	const match = MDX_PLAN_PATH_RE.exec(path);
	return match ? match[1] : null;
}

/** Detail payload for the `helmor:open-plan` window event. Dispatched when a
 *  plan tab should be selected (auto-open on a fresh MDX plan-review, or the
 *  compact card's "Open plan" button). The panel container listens, refreshes
 *  the plan list, and selects the tab for its currently-displayed session.
 *  `sessionId` (when known) lets the listener ignore stale events from a
 *  different session's thread. */
export type OpenPlanEventDetail = {
	slug: string;
	sessionId?: string | null;
};

export const OPEN_PLAN_EVENT = "helmor:open-plan";

/** Fire the cross-component "select this plan tab" signal. */
export function dispatchOpenPlan(detail: OpenPlanEventDetail): void {
	window.dispatchEvent(new CustomEvent(OPEN_PLAN_EVENT, { detail }));
}

/** True when the last plan-review card has no user message after it. */
export function hasUnresolvedPlanReview(
	messages: ThreadMessageLike[],
): boolean {
	let lastPlanIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].content?.some((p) => p.type === "plan-review")) {
			lastPlanIdx = i;
			break;
		}
	}
	if (lastPlanIdx === -1) return false;
	for (let i = lastPlanIdx + 1; i < messages.length; i++) {
		if (messages[i].role === "user") return false;
	}
	return true;
}

/** Slug of the latest unresolved MDX plan-review (no user message after it),
 *  or null when the latest plan-review is absent / resolved / not an MDX plan. */
export function latestUnresolvedMdxPlanSlug(
	messages: ThreadMessageLike[],
): string | null {
	let lastPlanIdx = -1;
	let lastPlanPath: string | null = null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const planPart = messages[i].content?.find(
			(p) => p.type === "plan-review",
		) as { planFilePath?: string | null } | undefined;
		if (planPart) {
			lastPlanIdx = i;
			lastPlanPath = planPart.planFilePath ?? null;
			break;
		}
	}
	if (lastPlanIdx === -1) return null;
	for (let i = lastPlanIdx + 1; i < messages.length; i++) {
		if (messages[i].role === "user") return null;
	}
	return planSlugFromPath(lastPlanPath);
}
