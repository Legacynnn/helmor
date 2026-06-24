/**
 * Shared state for the "filter the thread to one subagent" feature.
 *
 * A module-level Zustand store (sibling to `streaming-store.ts`) keyed by
 * `sessionId` so the composer strip (which toggles the filter) and the thread
 * viewport (which applies it) — two separate subtrees — agree on the active
 * subagent without prop-drilling. Survives container remounts.
 *
 * The active entry carries the display `name` alongside its `key` so the
 * filtering banner can still label the subagent after it finishes and drops out
 * of the running list (Claude names derive from `args.description`, which a key
 * alone can't recover).
 */

import { useCallback } from "react";
import { create } from "zustand";

export type ActiveSubagentFilter = { key: string; name: string };

type SubagentFilterState = {
	/** `sessionId -> active subagent filter` (absent for "show all"). */
	activeBySession: Record<string, ActiveSubagentFilter>;
	setFilter: (sessionId: string, filter: ActiveSubagentFilter) => void;
	clearFilter: (sessionId: string) => void;
};

export const useSubagentFilterStore = create<SubagentFilterState>((set) => ({
	activeBySession: {},
	setFilter: (sessionId, filter) =>
		set((state) => {
			const current = state.activeBySession[sessionId];
			if (current && current.key === filter.key && current.name === filter.name)
				return state;
			return {
				activeBySession: { ...state.activeBySession, [sessionId]: filter },
			};
		}),
	clearFilter: (sessionId) =>
		set((state) => {
			if (!(sessionId in state.activeBySession)) return state;
			const { [sessionId]: _removed, ...rest } = state.activeBySession;
			return { activeBySession: rest };
		}),
}));

/** The active subagent filter for a session, or null when unfiltered. */
export function useActiveSubagentFilter(
	sessionId: string | null,
): ActiveSubagentFilter | null {
	return useSubagentFilterStore((state) =>
		sessionId ? (state.activeBySession[sessionId] ?? null) : null,
	);
}

/** Stable `{ active, setFilter, clearFilter }` bound to one session. */
export function useSubagentFilter(sessionId: string | null): {
	active: ActiveSubagentFilter | null;
	setFilter: (filter: ActiveSubagentFilter) => void;
	clearFilter: () => void;
} {
	const active = useActiveSubagentFilter(sessionId);
	const setFilterRaw = useSubagentFilterStore((state) => state.setFilter);
	const clearFilterRaw = useSubagentFilterStore((state) => state.clearFilter);
	const setFilter = useCallback(
		(filter: ActiveSubagentFilter) => {
			if (sessionId) setFilterRaw(sessionId, filter);
		},
		[sessionId, setFilterRaw],
	);
	const clearFilter = useCallback(() => {
		if (sessionId) clearFilterRaw(sessionId);
	}, [sessionId, clearFilterRaw]);
	return { active, setFilter, clearFilter };
}
