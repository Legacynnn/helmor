import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useMemo, useState } from "react";
import {
	prepareArchiveWorkspace,
	restoreWorkspace,
	startArchiveWorkspace,
	validateRestoreWorkspace,
	type WorkspaceRow,
} from "@/lib/api";
import { extractError } from "@/lib/errors";
import {
	archivedWorkspacesQueryOptions,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import { summaryToArchivedRow } from "@/lib/workspace-helpers";
import { HistoryScreen } from "./index";

type WorkspaceToastVariant = "default" | "destructive";
type WorkspaceToastFn = (
	description: string,
	title?: string,
	variant?: WorkspaceToastVariant,
	opts?: {
		action?: { label: string; onClick: () => void; destructive?: boolean };
		persistent?: boolean;
	},
) => void;

export type HistoryScreenContainerProps = {
	onSelectWorkspace: (workspaceId: string) => void;
	pushWorkspaceToast: WorkspaceToastFn;
};

export const HistoryScreenContainer = memo(function HistoryScreenContainer({
	onSelectWorkspace,
	pushWorkspaceToast,
}: HistoryScreenContainerProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [archivingIds, setArchivingIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [restoringId, setRestoringId] = useState<string | null>(null);

	const liveQuery = useQuery(workspaceGroupsQueryOptions());
	const archivedQuery = useQuery(archivedWorkspacesQueryOptions());

	const rows = useMemo<WorkspaceRow[]>(() => {
		const merged = new Map<string, WorkspaceRow>();
		for (const group of liveQuery.data ?? []) {
			for (const row of group.rows) {
				merged.set(row.id, row);
			}
		}
		for (const summary of archivedQuery.data ?? []) {
			if (merged.has(summary.id)) continue;
			merged.set(summary.id, summaryToArchivedRow(summary));
		}
		return Array.from(merged.values());
	}, [liveQuery.data, archivedQuery.data]);

	const handleArchive = useCallback(
		(workspaceId: string) => {
			setArchivingIds((prev) => {
				if (prev.has(workspaceId)) return prev;
				const next = new Set(prev);
				next.add(workspaceId);
				return next;
			});
			void (async () => {
				try {
					const prep = await prepareArchiveWorkspace(workspaceId);
					await startArchiveWorkspace(prep.workspaceId);
				} catch (error) {
					const { message } = extractError(
						error,
						"Failed to archive workspace",
					);
					pushWorkspaceToast(message, "Archive failed", "destructive");
				} finally {
					setArchivingIds((prev) => {
						if (!prev.has(workspaceId)) return prev;
						const next = new Set(prev);
						next.delete(workspaceId);
						return next;
					});
					void liveQuery.refetch();
					void archivedQuery.refetch();
				}
			})();
		},
		[archivedQuery, liveQuery, pushWorkspaceToast],
	);

	const handleRestore = useCallback(
		(workspaceId: string) => {
			if (restoringId === workspaceId) return;
			setRestoringId(workspaceId);
			void (async () => {
				try {
					const validation = await validateRestoreWorkspace(workspaceId);
					const branchOverride = validation.targetBranchConflict
						? validation.targetBranchConflict.suggestedBranch
						: null;
					if (validation.targetBranchConflict) {
						const { currentBranch, suggestedBranch, remote } =
							validation.targetBranchConflict;
						pushWorkspaceToast(
							`Branch "${currentBranch}" no longer exists on ${remote}. Restored on "${suggestedBranch}".`,
							"Target branch changed",
						);
					}
					await restoreWorkspace(workspaceId, branchOverride ?? undefined);
				} catch (error) {
					const { message } = extractError(
						error,
						"Failed to restore workspace",
					);
					pushWorkspaceToast(message, "Restore failed", "destructive");
				} finally {
					setRestoringId((prev) => (prev === workspaceId ? null : prev));
					void liveQuery.refetch();
					void archivedQuery.refetch();
				}
			})();
		},
		[archivedQuery, liveQuery, pushWorkspaceToast, restoringId],
	);

	const loading = liveQuery.isFetching || archivedQuery.isFetching;

	return (
		<HistoryScreen
			rows={rows}
			searchQuery={searchQuery}
			onSearchQueryChange={setSearchQuery}
			loading={loading}
			onSelectWorkspace={onSelectWorkspace}
			onArchiveWorkspace={handleArchive}
			onRestoreWorkspace={handleRestore}
			archivingWorkspaceIds={archivingIds}
			restoringWorkspaceId={restoringId}
		/>
	);
});
