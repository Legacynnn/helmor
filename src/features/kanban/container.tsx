import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useMemo } from "react";
import {
	setWorkspaceStatus,
	type WorkspaceGroup,
	type WorkspaceRow,
	type WorkspaceStatus,
} from "@/lib/api";
import { extractError } from "@/lib/errors";
import {
	helmorQueryKeys,
	repositoriesQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import { KanbanScreen } from "./index";

type WorkspaceToastVariant = "default" | "destructive";
type WorkspaceToastFn = (
	description: string,
	title?: string,
	variant?: WorkspaceToastVariant,
) => void;

export type KanbanScreenContainerProps = {
	onSelectWorkspace: (workspaceId: string) => void;
	onCreatePr: (workspaceId: string) => void;
	pushWorkspaceToast: WorkspaceToastFn;
};

export const KanbanScreenContainer = memo(function KanbanScreenContainer({
	onSelectWorkspace,
	onCreatePr,
	pushWorkspaceToast,
}: KanbanScreenContainerProps) {
	const queryClient = useQueryClient();
	const groupsQuery = useQuery(workspaceGroupsQueryOptions());
	const repositoriesQuery = useQuery(repositoriesQueryOptions());

	const rows = useMemo<WorkspaceRow[]>(() => {
		const merged = new Map<string, WorkspaceRow>();
		for (const group of groupsQuery.data ?? []) {
			for (const row of group.rows) {
				// Skip archived — they don't belong on the active board.
				if (row.state === "archived") continue;
				merged.set(row.id, row);
			}
		}
		return Array.from(merged.values());
	}, [groupsQuery.data]);

	const handleSetStatus = useCallback(
		(workspaceId: string, status: WorkspaceStatus) => {
			// Optimistic: update each group's rows in place so the card
			// jumps columns instantly. Backend invalidation refreshes the
			// authoritative list a moment later.
			const previous = queryClient.getQueryData<WorkspaceGroup[]>(
				helmorQueryKeys.workspaceGroups,
			);
			if (previous) {
				queryClient.setQueryData<WorkspaceGroup[]>(
					helmorQueryKeys.workspaceGroups,
					previous.map((group) => ({
						...group,
						rows: group.rows.map((row) =>
							row.id === workspaceId ? { ...row, status } : row,
						),
					})),
				);
			}

			void (async () => {
				try {
					await setWorkspaceStatus(workspaceId, status);
				} catch (error) {
					if (previous) {
						queryClient.setQueryData(helmorQueryKeys.workspaceGroups, previous);
					}
					const { message } = extractError(
						error,
						"Failed to update workspace status.",
					);
					pushWorkspaceToast(message, "Status update failed", "destructive");
				} finally {
					void queryClient.invalidateQueries({
						queryKey: helmorQueryKeys.workspaceGroups,
					});
				}
			})();
		},
		[pushWorkspaceToast, queryClient],
	);

	return (
		<KanbanScreen
			rows={rows}
			repositories={repositoriesQuery.data ?? []}
			loading={groupsQuery.isFetching}
			onSelectWorkspace={onSelectWorkspace}
			onSetStatus={handleSetStatus}
			onCreatePr={onCreatePr}
		/>
	);
});
