import type { CopilotCachedModel } from "@/lib/settings";

/** Decide which model slugs stay enabled after a Copilot catalog refresh.
 *  - `null` means "every cached model enabled" — keep that meaning so a
 *    refresh never silently narrows the picker.
 *  - `[]` (user cleared everything) → respected, stays empty.
 *  - otherwise prune picks whose slug vanished from the catalog; if every
 *    pick went stale (e.g. a renamed catalog), fall back to `null` so the
 *    picker shows the fresh catalog instead of nothing. */
export function reconcileCopilotEnabledModelIds(
	prev: string[] | null,
	cached: CopilotCachedModel[],
): string[] | null {
	if (prev === null) return null;
	if (prev.length === 0) return prev;
	const cachedSlugs = new Set(cached.map((m) => m.slug));
	const kept = prev.filter((slug) => cachedSlugs.has(slug));
	return kept.length === 0 ? null : kept;
}

/** The effective enabled set for rendering: `null` ⟺ all cached models. */
export function effectiveCopilotEnabledIds(
	enabledModelIds: string[] | null,
	cached: CopilotCachedModel[],
): string[] {
	if (enabledModelIds === null) return cached.map((m) => m.slug);
	return enabledModelIds;
}
