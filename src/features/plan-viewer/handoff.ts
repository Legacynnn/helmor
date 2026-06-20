/**
 * Build the first prompt for a fresh agent that picks up an approved plan and
 * implements it. The prompt always references the plan file by its
 * `.helmor/plans/<slug>.mdx` path and frames it as the living plan: the new
 * agent reads it first, implements it step by step, and keeps the file updated
 * as work progresses (checking off steps, recording decisions). Pairs with the
 * `helmor:create-prefilled-session` mechanism, which seeds a new session's
 * composer with this text — see {@link PlanViewContainer}.
 */
export function buildHandoffPrompt(slug: string): string {
	const path = `.helmor/plans/${slug}.mdx`;
	return [
		`Read the plan at \`${path}\` first — it is the living plan for this work.`,
		"Implement it step by step, treating the document as the source of truth for scope and sequencing.",
		"Keep the plan file updated as you go: check off completed steps and record any decisions or deviations directly in the file.",
	].join("\n");
}

/** Short intro line seeding the handoff session's composer. The full
 *  implementation guidance from {@link buildHandoffPrompt} is supplied as the
 *  prefill body below the intro. */
const HANDOFF_INTRO = "Implementing the approved plan: ";

/**
 * Window event used to create a fresh, prefilled session. Shared with the
 * inspector's "create run action" flow (and consumed by
 * `features/panel/container.tsx`), so the plan surface stays decoupled from
 * session-creation plumbing. The detail shape is
 * `{ workspaceId, intro, body }`.
 */
const CREATE_PREFILLED_SESSION_EVENT = "helmor:create-prefilled-session";

/**
 * Hand an approved plan to a fresh agent: dispatch the shared
 * `helmor:create-prefilled-session` event for `workspaceId`, seeding the new
 * session's composer with the handoff prompt for `slug`. The active workspace's
 * panel listens (matching on `workspaceId`), creates the session, prefills the
 * composer, and selects it.
 */
export function dispatchHandoffSession(
	workspaceId: string,
	slug: string,
): void {
	window.dispatchEvent(
		new CustomEvent(CREATE_PREFILLED_SESSION_EVENT, {
			detail: {
				workspaceId,
				intro: HANDOFF_INTRO,
				body: buildHandoffPrompt(slug),
			},
		}),
	);
}
