import { useQuery } from "@tanstack/react-query";
import {
	Ban,
	CheckCircle2,
	CircleDashed,
	GitPullRequestArrow,
	LoaderCircle,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type {
	WorkspaceDiffStat,
	WorkspaceGroup,
	WorkspaceRow,
} from "@/lib/api";
import {
	activeStreamsQueryOptions,
	workspaceDiffStatsQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import {
	buildSessionRunStates,
	deriveBusyWorkspaceIds,
} from "@/lib/session-run-state";
import {
	workspaceGroupIdFromStatus,
	workspaceStatusFromGroupId,
} from "@/lib/workspace-helpers";
import { loadColumnFilter, saveColumnFilter } from "./column-filter-storage";
import {
	loadRepoFilter,
	type RepoOption,
	saveRepoFilter,
} from "./repo-filter-storage";

export type DashboardColumnId =
	| "progress"
	| "review"
	| "done"
	| "backlog"
	| "canceled";

/** Semantic tone key per column — mapped to concrete Tailwind classes in the
 *  view layer (`column-tone.ts`). Kept abstract here so the hook stays about
 *  data, not styling. */
export type DashboardColumnTone =
	| "progress"
	| "review"
	| "done"
	| "backlog"
	| "canceled";

export type DashboardColumnMeta = {
	id: DashboardColumnId;
	label: string;
	icon: LucideIcon;
	tone: DashboardColumnTone;
};

export const DASHBOARD_COLUMNS: ReadonlyArray<DashboardColumnMeta> = [
	{ id: "backlog", label: "Backlog", icon: CircleDashed, tone: "backlog" },
	{
		id: "progress",
		label: "In progress",
		icon: LoaderCircle,
		tone: "progress",
	},
	{ id: "review", label: "Review", icon: GitPullRequestArrow, tone: "review" },
	{ id: "done", label: "Done", icon: CheckCircle2, tone: "done" },
	{ id: "canceled", label: "Canceled", icon: Ban, tone: "canceled" },
];

const DASHBOARD_COLUMN_IDS = DASHBOARD_COLUMNS.map((c) => c.id);

export type DashboardColumn = DashboardColumnMeta & {
	rows: WorkspaceRow[];
};

export function buildDashboardColumns(
	groups: WorkspaceGroup[],
): DashboardColumn[] {
	const buckets: Record<DashboardColumnId, WorkspaceRow[]> = {
		progress: [],
		review: [],
		done: [],
		backlog: [],
		canceled: [],
	};
	for (const group of groups) {
		// Fall back to the group's own status when a row carries none. This
		// re-buckets rows from non-status groups (pinned/chats/ai-tasks) by the
		// status their group already implies, while explicit row statuses win.
		const groupStatus = workspaceStatusFromGroupId(group.id);
		for (const r of group.rows) {
			// Passing `pinnedAt = null` ensures this never returns "pinned", so
			// pinned/chats/ai-tasks rows are re-bucketed by their real status.
			const columnId = workspaceGroupIdFromStatus(
				r.status ?? groupStatus,
				null,
			);
			// Guard the cast: if a future group id ever falls outside the five
			// status columns, skip it rather than crash on `undefined.push`.
			if (columnId in buckets) {
				buckets[columnId as DashboardColumnId].push(r);
			}
		}
	}
	return DASHBOARD_COLUMNS.map((c) => ({ ...c, rows: buckets[c.id] }));
}

/** Distinct repos present across the board, sorted by display name. The filter
 *  list is derived from the rows themselves so it always matches what's on the
 *  board (repos with zero workspaces have nothing to show anyway). */
export function deriveRepoOptions(columns: DashboardColumn[]): RepoOption[] {
	const byId = new Map<string, RepoOption>();
	for (const column of columns) {
		for (const row of column.rows) {
			if (!row.repoId || byId.has(row.repoId)) continue;
			byId.set(row.repoId, {
				id: row.repoId,
				name: row.repoName ?? row.repoId,
				iconSrc: row.repoIconSrc ?? null,
				initials: row.repoInitials ?? null,
			});
		}
	}
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Keep only rows whose repo is selected. An empty selection means "all repos",
 *  so the board renders unchanged until the user narrows it. */
function filterColumnsByRepo(
	columns: DashboardColumn[],
	selected: ReadonlySet<string>,
): DashboardColumn[] {
	if (selected.size === 0) return columns;
	return columns.map((c) => ({
		...c,
		rows: c.rows.filter((r) => r.repoId && selected.has(r.repoId)),
	}));
}

function filterColumnsByStatus(
	columns: DashboardColumn[],
	visible: ReadonlySet<DashboardColumnId>,
): DashboardColumn[] {
	return columns.filter((c) => visible.has(c.id));
}

export function useDashboardBoard() {
	const groupsQuery = useQuery(workspaceGroupsQueryOptions());
	const streamsQuery = useQuery(activeStreamsQueryOptions());
	const diffStatsQuery = useQuery(workspaceDiffStatsQueryOptions());

	const [selectedRepoIds, setSelectedRepoIdsState] = useState<Set<string>>(() =>
		loadRepoFilter(),
	);
	const [visibleColumnIds, setVisibleColumnIdsState] = useState<
		Set<DashboardColumnId>
	>(() => loadColumnFilter(DASHBOARD_COLUMN_IDS));

	const allColumns = useMemo(
		() => buildDashboardColumns(groupsQuery.data ?? []),
		[groupsQuery.data],
	);

	const repos = useMemo(() => deriveRepoOptions(allColumns), [allColumns]);

	// Prune selections for repos that no longer exist so the persisted set can't
	// drift into stale ids that silently hide everything.
	const effectiveSelection = useMemo(() => {
		if (selectedRepoIds.size === 0) return selectedRepoIds;
		const live = new Set(repos.map((r) => r.id));
		const pruned = new Set([...selectedRepoIds].filter((id) => live.has(id)));
		return pruned.size === selectedRepoIds.size ? selectedRepoIds : pruned;
	}, [selectedRepoIds, repos]);

	const columns = useMemo(
		() =>
			filterColumnsByStatus(
				filterColumnsByRepo(allColumns, effectiveSelection),
				visibleColumnIds,
			),
		[allColumns, effectiveSelection, visibleColumnIds],
	);

	const setSelectedRepoIds = useCallback((next: Set<string>) => {
		setSelectedRepoIdsState(next);
		saveRepoFilter(next);
	}, []);

	const setVisibleColumnIds = useCallback((next: Set<DashboardColumnId>) => {
		const normalized =
			next.size > 0 ? next : new Set<DashboardColumnId>(DASHBOARD_COLUMN_IDS);
		setVisibleColumnIdsState(normalized);
		saveColumnFilter(normalized, DASHBOARD_COLUMN_IDS);
	}, []);

	const diffStats = useMemo(() => {
		const map = new Map<string, WorkspaceDiffStat>();
		for (const stat of diffStatsQuery.data ?? []) {
			map.set(stat.workspaceId, stat);
		}
		return map as ReadonlyMap<string, WorkspaceDiffStat>;
	}, [diffStatsQuery.data]);

	const runningWorkspaceIds = useMemo(
		() =>
			deriveBusyWorkspaceIds(
				buildSessionRunStates(streamsQuery.data ?? [], null),
			),
		[streamsQuery.data],
	);

	const totalRunning = useMemo(() => {
		let n = 0;
		for (const c of columns)
			for (const r of c.rows) if (runningWorkspaceIds.has(r.id)) n++;
		return n;
	}, [columns, runningWorkspaceIds]);

	return {
		columns,
		runningWorkspaceIds,
		totalRunning,
		diffStats,
		repos,
		selectedRepoIds: effectiveSelection,
		setSelectedRepoIds,
		visibleColumnIds,
		setVisibleColumnIds,
		columnOptions: DASHBOARD_COLUMNS,
	};
}
