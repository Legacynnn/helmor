const STORAGE_KEY = "helmor.dashboard.visibleColumns";

function normalize<T extends string>(
	ids: Iterable<unknown>,
	validIds: readonly T[],
): Set<T> {
	const valid = new Set<T>(validIds);
	const next = new Set<T>();
	for (const id of ids) {
		if (typeof id === "string" && valid.has(id as T)) next.add(id as T);
	}
	return next.size > 0 ? next : new Set(validIds);
}

export function loadColumnFilter<T extends string>(
	validIds: readonly T[],
): Set<T> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set(validIds);
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set(validIds);
		return normalize(parsed, validIds);
	} catch {
		return new Set(validIds);
	}
}

export function saveColumnFilter<T extends string>(
	ids: ReadonlySet<T>,
	validIds: readonly T[],
): void {
	try {
		const normalized = normalize(ids, validIds);
		if (normalized.size === validIds.length) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...normalized]));
	} catch {
		// ignore, persistence is best-effort
	}
}
