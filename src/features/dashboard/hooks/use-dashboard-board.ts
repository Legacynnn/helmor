import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import {
	activeStreamsQueryOptions,
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

export type DashboardColumnId =
	| "progress"
	| "review"
	| "done"
	| "backlog"
	| "canceled";

export const DASHBOARD_COLUMNS: ReadonlyArray<{
	id: DashboardColumnId;
	label: string;
}> = [
	{ id: "progress", label: "In progress" },
	{ id: "review", label: "Review" },
	{ id: "done", label: "Done" },
	{ id: "backlog", label: "Backlog" },
	{ id: "canceled", label: "Canceled" },
];

export type DashboardColumn = {
	id: DashboardColumnId;
	label: string;
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

export function useDashboardBoard() {
	const groupsQuery = useQuery(workspaceGroupsQueryOptions());
	const streamsQuery = useQuery(activeStreamsQueryOptions());

	const columns = useMemo(
		() => buildDashboardColumns(groupsQuery.data ?? []),
		[groupsQuery.data],
	);

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

	return { columns, runningWorkspaceIds, totalRunning };
}
