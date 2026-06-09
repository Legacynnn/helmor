/** A repo the board can be filtered to. Derived from the workspace rows on the
 *  board, so the list always matches what's actually shown. */
export type RepoOption = {
	id: string;
	name: string;
	iconSrc: string | null;
	initials: string | null;
};

const STORAGE_KEY = "helmor.dashboard.repoFilter";

/** Read the persisted repo-filter selection. An empty set means "all repos".
 *  Defensive against malformed/absent storage — any failure yields "all". */
export function loadRepoFilter(): Set<string> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((v): v is string => typeof v === "string"));
	} catch {
		return new Set();
	}
}

/** Persist the selection. An empty set is stored as a cleared key so the next
 *  load defaults to "all repos". Storage failures are swallowed — filtering is
 *  a convenience, not a correctness requirement. */
export function saveRepoFilter(ids: ReadonlySet<string>): void {
	try {
		if (ids.size === 0) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
	} catch {
		// ignore — persistence is best-effort
	}
}
