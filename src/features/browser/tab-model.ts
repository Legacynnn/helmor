// Pure tab operations for the browser surface. No React, no IPC — just data
// math, so the tab list state machine is unit-testable in isolation (mirrors
// `src/features/editor/tab-model.ts`).

export type BrowserTab = {
	id: string;
	url: string;
	title: string;
	loading: boolean;
	/** True when this tab's `url` was auto-upgraded from a scheme-less host to
	 *  `https://` (eligible for the https→http load-failure fallback). */
	autoUpgradedHttps?: boolean;
};

/** Append a tab unless one with the same id already exists (idempotent open). */
export function openTab(tabs: BrowserTab[], tab: BrowserTab): BrowserTab[] {
	if (tabs.some((t) => t.id === tab.id)) return tabs;
	return [...tabs, tab];
}

/** The tab matching `activeId`, or `null` when none is active. */
export function activeTab(
	tabs: BrowserTab[],
	activeId: string,
): BrowserTab | null {
	return tabs.find((t) => t.id === activeId) ?? null;
}

/**
 * Close `closeId`. When it was the active tab, fall back to the right neighbor
 * (then the left neighbor); when it was the last tab, the next active id is
 * `null`. Closing a non-active tab leaves the active id untouched.
 */
export function closeTab(
	tabs: BrowserTab[],
	closeId: string,
	activeId: string,
): { tabs: BrowserTab[]; nextActiveId: string | null } {
	const index = tabs.findIndex((t) => t.id === closeId);
	if (index === -1) return { tabs, nextActiveId: activeId };
	const next = tabs.filter((t) => t.id !== closeId);
	let nextActiveId: string | null = activeId;
	if (closeId === activeId) {
		const neighbor = tabs[index + 1] ?? tabs[index - 1] ?? null;
		nextActiveId = neighbor ? neighbor.id : null;
	}
	return { tabs: next, nextActiveId };
}
