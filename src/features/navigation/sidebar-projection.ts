import type {
	RepositoryCreateOption,
	WorkspaceGroup,
	WorkspaceRow,
	WorkspaceSummary,
} from "@/lib/api";
import { summaryToArchivedRow } from "@/lib/workspace-helpers";

export type PendingArchiveEntry = {
	row: WorkspaceRow;
	sourceGroupId: string;
	sourceIndex: number;
	stage: "preparing" | "running" | "confirmed";
	sortTimestamp: number;
};

export type PendingCreationEntry = {
	repoId: string;
	row: WorkspaceRow;
	stage: "creating" | "confirmed";
	resolvedWorkspaceId: string | null;
};

type ProjectedArchivedRow = {
	row: WorkspaceRow;
	sortTimestamp: number;
};

export function projectSidebarLists({
	baseGroups,
	baseArchivedSummaries,
	pendingArchives,
	pendingCreations,
}: {
	baseGroups: WorkspaceGroup[];
	baseArchivedSummaries: WorkspaceSummary[];
	pendingArchives: ReadonlyMap<string, PendingArchiveEntry>;
	pendingCreations: ReadonlyMap<string, PendingCreationEntry>;
}): {
	groups: WorkspaceGroup[];
	archivedRows: WorkspaceRow[];
} {
	const hiddenLiveIds = new Set(pendingArchives.keys());
	for (const [optimisticWorkspaceId, pendingCreation] of pendingCreations) {
		hiddenLiveIds.add(optimisticWorkspaceId);
		if (pendingCreation.resolvedWorkspaceId) {
			hiddenLiveIds.add(pendingCreation.resolvedWorkspaceId);
		}
	}
	const groups =
		hiddenLiveIds.size === 0
			? baseGroups
			: baseGroups.map((group) => ({
					...group,
					rows: group.rows.filter((row) => !hiddenLiveIds.has(row.id)),
				}));

	const liveGroups = Array.from(pendingCreations.values()).reduce(
		(currentGroups, pendingCreation) =>
			insertPendingCreationRow(currentGroups, pendingCreation.row),
		groups,
	);

	const archivedById = new Map<string, ProjectedArchivedRow>();
	for (let index = 0; index < baseArchivedSummaries.length; index += 1) {
		const summary = baseArchivedSummaries[index];
		const pending = pendingArchives.get(summary.id);
		archivedById.set(summary.id, {
			row: summaryToArchivedRow(summary),
			// While a pending entry exists, inherit its sortTimestamp so the
			// item doesn't jump when server data arrives. Once the pending
			// entry is reconciled away, fall back to stable server ordering.
			sortTimestamp: pending ? pending.sortTimestamp : -index,
		});
	}

	for (const [workspaceId, pendingArchive] of pendingArchives) {
		if (archivedById.has(workspaceId)) {
			continue;
		}

		archivedById.set(workspaceId, {
			row: {
				...pendingArchive.row,
				state: "archived",
			},
			sortTimestamp: pendingArchive.sortTimestamp,
		});
	}

	const archivedRows = Array.from(archivedById.values())
		.sort((left, right) => right.sortTimestamp - left.sortTimestamp)
		.map((entry) => entry.row);

	return {
		groups: liveGroups,
		archivedRows,
	};
}

export function shouldReconcilePendingArchive(
	workspaceId: string,
	baseGroups: WorkspaceGroup[],
	baseArchivedSummaries: WorkspaceSummary[],
): boolean {
	const stillLive = baseGroups.some((group) =>
		group.rows.some((row) => row.id === workspaceId),
	);
	if (stillLive) {
		return false;
	}

	return baseArchivedSummaries.some((summary) => summary.id === workspaceId);
}

export function shouldReconcilePendingCreation(
	pendingCreation: PendingCreationEntry,
	baseGroups: WorkspaceGroup[],
): boolean {
	const resolvedWorkspaceId = pendingCreation.resolvedWorkspaceId;
	if (pendingCreation.stage !== "confirmed" || !resolvedWorkspaceId) {
		return false;
	}

	return baseGroups.some((group) =>
		group.rows.some((row) => row.id === resolvedWorkspaceId),
	);
}

export type RepositoryGroup = {
	id: string;
	name: string;
	repoIconSrc: string | null;
	repoInitials: string | null;
	rows: WorkspaceRow[];
};

const UNKNOWN_REPO_ID = "__unknown__";

export function projectRepositoryGroups({
	repositories,
	groups,
	pendingCreations,
}: {
	repositories: RepositoryCreateOption[];
	groups: WorkspaceGroup[];
	pendingCreations: ReadonlyMap<string, PendingCreationEntry>;
}): RepositoryGroup[] {
	const rowsByRepo = new Map<string, WorkspaceRow[]>();
	const repoMeta = new Map<
		string,
		{ name: string; repoIconSrc: string | null; repoInitials: string | null }
	>();

	for (const repository of repositories) {
		rowsByRepo.set(repository.id, []);
		repoMeta.set(repository.id, {
			name: repository.name,
			repoIconSrc: repository.repoIconSrc ?? null,
			repoInitials: repository.repoInitials ?? null,
		});
	}

	const pendingByOptimisticId = new Map<string, PendingCreationEntry>();
	const pendingResolvedIds = new Set<string>();
	for (const [optimisticId, entry] of pendingCreations) {
		pendingByOptimisticId.set(optimisticId, entry);
		if (entry.resolvedWorkspaceId) {
			pendingResolvedIds.add(entry.resolvedWorkspaceId);
		}
	}

	const seenWorkspaceIds = new Set<string>();
	for (const group of groups) {
		for (const row of group.rows) {
			if (seenWorkspaceIds.has(row.id)) continue;
			seenWorkspaceIds.add(row.id);
			if (pendingByOptimisticId.has(row.id)) continue;
			if (pendingResolvedIds.has(row.id)) continue;
			pushRowIntoRepo(rowsByRepo, repoMeta, row);
		}
	}

	for (const entry of pendingCreations.values()) {
		pushRowIntoRepo(rowsByRepo, repoMeta, entry.row, entry.repoId);
	}

	const result: RepositoryGroup[] = [];
	for (const repository of repositories) {
		const rows = rowsByRepo.get(repository.id) ?? [];
		result.push({
			id: repository.id,
			name: repository.name,
			repoIconSrc: repository.repoIconSrc ?? null,
			repoInitials: repository.repoInitials ?? null,
			rows: sortRepoRows(rows),
		});
	}

	const unknownRows = rowsByRepo.get(UNKNOWN_REPO_ID);
	if (unknownRows && unknownRows.length > 0) {
		result.push({
			id: UNKNOWN_REPO_ID,
			name: "Other",
			repoIconSrc: null,
			repoInitials: null,
			rows: sortRepoRows(unknownRows),
		});
	}

	return result;
}

function pushRowIntoRepo(
	rowsByRepo: Map<string, WorkspaceRow[]>,
	_repoMeta: Map<
		string,
		{ name: string; repoIconSrc: string | null; repoInitials: string | null }
	>,
	row: WorkspaceRow,
	repoIdHint?: string,
) {
	const candidate = row.repoId ?? repoIdHint;
	const repoId =
		candidate && rowsByRepo.has(candidate) ? candidate : UNKNOWN_REPO_ID;
	const bucket = rowsByRepo.get(repoId);
	if (bucket) {
		bucket.push(row);
		return;
	}
	rowsByRepo.set(repoId, [row]);
}

function sortRepoRows(rows: WorkspaceRow[]): WorkspaceRow[] {
	return rows.slice().sort((a, b) => {
		const aPinned = a.pinnedAt ? 1 : 0;
		const bPinned = b.pinnedAt ? 1 : 0;
		if (aPinned !== bPinned) return bPinned - aPinned;
		return 0;
	});
}

function insertPendingCreationRow(
	groups: WorkspaceGroup[],
	row: WorkspaceRow,
): WorkspaceGroup[] {
	return groups.map((group) =>
		group.id === "progress"
			? {
					...group,
					rows: group.rows.some((item) => item.id === row.id)
						? group.rows
						: [row, ...group.rows],
				}
			: group,
	);
}
