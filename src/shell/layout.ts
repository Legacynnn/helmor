import type {
	WorkspaceGroup,
	WorkspaceRow,
	WorkspaceSessionSummary,
} from "@/lib/api";

export const SIDEBAR_WIDTH_STORAGE_KEY = "helmor.workspaceSidebarWidth";
export const INSPECTOR_WIDTH_STORAGE_KEY = "helmor.workspaceInspectorWidth";
export const PREFERRED_EDITOR_STORAGE_KEY = "helmor.preferredEditorId";
export const DEFAULT_SIDEBAR_WIDTH = 336;
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 520;
export const SIDEBAR_RESIZE_STEP = 16;
export const SIDEBAR_RESIZE_HIT_AREA = 20;

export function clampSidebarWidth(width: number) {
	return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function getInitialSidebarWidth(storageKey = SIDEBAR_WIDTH_STORAGE_KEY) {
	if (typeof window === "undefined") {
		return DEFAULT_SIDEBAR_WIDTH;
	}

	try {
		const storedWidth = window.localStorage.getItem(storageKey);

		if (!storedWidth) {
			return DEFAULT_SIDEBAR_WIDTH;
		}

		const parsedWidth = Number.parseInt(storedWidth, 10);

		return Number.isFinite(parsedWidth)
			? clampSidebarWidth(parsedWidth)
			: DEFAULT_SIDEBAR_WIDTH;
	} catch {
		return DEFAULT_SIDEBAR_WIDTH;
	}
}

export function findAdjacentSessionId(
	workspaceSessions: WorkspaceSessionSummary[],
	selectedSessionId: string | null,
	offset: -1 | 1,
) {
	if (!selectedSessionId || workspaceSessions.length < 2) {
		return null;
	}

	const currentIndex = workspaceSessions.findIndex(
		(session) => session.id === selectedSessionId,
	);

	if (currentIndex === -1) {
		return null;
	}

	const nextIndex = currentIndex + offset;

	if (nextIndex < 0 || nextIndex >= workspaceSessions.length) {
		return null;
	}

	return workspaceSessions[nextIndex]?.id ?? null;
}

/**
 * Resolve which session a Cmd+N shortcut should select, indexing the visible
 * session tab bar by position (1-based). The caller passes the same
 * `helmorQueryKeys.workspaceSessions` array the header renders as tabs, so
 * position N always equals the Nth tab the user sees.
 *
 * Cmd+1..8 select absolute positions 1..8 (no-op if absent). Cmd+9 is an
 * overflow stepper: it jumps to position 9, and pressing it again while the
 * selection already sits at position >= 9 advances one position, wrapping back
 * to position 9 after the last tab. Cmd+9 is a no-op when fewer than 9 sessions
 * exist.
 */
export function resolveSessionIdByOrdinal(
	workspaceSessions: WorkspaceSessionSummary[],
	selectedSessionId: string | null,
	ordinal: number,
): string | null {
	if (ordinal < 1 || ordinal > 9) {
		return null;
	}
	if (workspaceSessions.length === 0) {
		return null;
	}

	// Cmd+1..8 → absolute 1-based position.
	if (ordinal < 9) {
		return workspaceSessions[ordinal - 1]?.id ?? null;
	}

	// Cmd+9 → overflow stepper over positions >= 9 (zero-based index >= 8).
	const OVERFLOW_START_INDEX = 8;
	if (workspaceSessions.length <= OVERFLOW_START_INDEX) {
		return null;
	}
	const currentIndex = workspaceSessions.findIndex(
		(session) => session.id === selectedSessionId,
	);
	if (currentIndex < OVERFLOW_START_INDEX) {
		// Below the overflow region (or nothing selected) → jump to position 9.
		return workspaceSessions[OVERFLOW_START_INDEX]?.id ?? null;
	}
	// Already in the overflow region → advance one, wrapping to position 9.
	const nextIndex =
		currentIndex + 1 >= workspaceSessions.length
			? OVERFLOW_START_INDEX
			: currentIndex + 1;
	return workspaceSessions[nextIndex]?.id ?? null;
}

/**
 * Flatten sidebar groups + archived rows into the same visual order the
 * sidebar actually renders them in. Powers keyboard up/down navigation
 * and the workspace prefetch warmup, so both have to mirror what the
 * user sees on screen.
 *
 * Trust the caller-supplied `groups` order verbatim — don't re-sort by
 * `tone` or any other status-derived field. The grouping pipeline owns
 * the order, and the order is mode-dependent: status grouping sorts by
 * status, repo grouping sorts by repo bucket, and inserting a hardcoded
 * tone ranking here silently breaks repo mode (every repo bucket has
 * `tone: "pinned"`, so the old implementation dropped most of them).
 */
export function flattenWorkspaceRows(
	groups: WorkspaceGroup[],
	archivedRows: WorkspaceRow[],
) {
	return [...groups.flatMap((group) => group.rows), ...archivedRows];
}

export function findAdjacentWorkspaceId(
	groups: WorkspaceGroup[],
	archivedRows: WorkspaceRow[],
	selectedWorkspaceId: string | null,
	offset: -1 | 1,
) {
	if (!selectedWorkspaceId) {
		return null;
	}

	const rows = flattenWorkspaceRows(groups, archivedRows);

	if (rows.length < 2) {
		return null;
	}

	const currentIndex = rows.findIndex((row) => row.id === selectedWorkspaceId);

	if (currentIndex === -1) {
		return null;
	}

	const nextIndex = currentIndex + offset;

	if (nextIndex < 0 || nextIndex >= rows.length) {
		return null;
	}

	return rows[nextIndex]?.id ?? null;
}
