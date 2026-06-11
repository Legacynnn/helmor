// Derivations the Git panel feeds its groups with: per-area ChangeRow
// projections (staged / unstaged / committed) and the transient
// "switching target branch" loading flag.
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorFileItem } from "@/lib/editor-session";
import type { ChangeRow } from "./shared";

// Each area has its own insertions/deletions. Project the area's stats
// onto a flat `insertions`/`deletions` pair so downstream components
// (LineStats etc.) read the correct numbers without knowing which group
// they're in.
export function useChangeRowProjections(changes: InspectorFileItem[]): {
	stagedChanges: ChangeRow[];
	unstagedChanges: ChangeRow[];
	committedChanges: ChangeRow[];
} {
	const stagedChanges = useMemo<ChangeRow[]>(
		() =>
			changes
				.filter((change) => change.stagedStatus != null)
				.map((change) => ({
					...change,
					status: change.stagedStatus ?? change.status,
					insertions: change.stagedInsertions,
					deletions: change.stagedDeletions,
				})),
		[changes],
	);
	const unstagedChanges = useMemo<ChangeRow[]>(
		() =>
			changes
				.filter((change) => change.unstagedStatus != null)
				.map((change) => ({
					...change,
					status: change.unstagedStatus ?? change.status,
					insertions: change.unstagedInsertions,
					deletions: change.unstagedDeletions,
				})),
		[changes],
	);
	const committedChanges = useMemo<ChangeRow[]>(
		() =>
			changes
				.filter((change) => change.committedStatus != null)
				.map((change) => ({
					...change,
					status: change.committedStatus ?? change.status,
					insertions: change.committedInsertions,
					deletions: change.committedDeletions,
				})),
		[changes],
	);
	return { stagedChanges, unstagedChanges, committedChanges };
}

// Only show loading when the user switches target branch within the
// same workspace — not on workspace/repo navigation or routine polling.
export function useBranchSwitching(
	workspaceId: string | null,
	workspaceTargetBranch: string | null,
	changes: InspectorFileItem[],
): boolean {
	const [branchSwitching, setBranchSwitching] = useState(false);
	const prevTargetRef = useRef(workspaceTargetBranch);
	const prevWorkspaceRef = useRef(workspaceId);
	const switchChangesRef = useRef(changes);
	useEffect(() => {
		const sameWorkspace = prevWorkspaceRef.current === workspaceId;
		prevWorkspaceRef.current = workspaceId;
		const targetChanged = prevTargetRef.current !== workspaceTargetBranch;
		prevTargetRef.current = workspaceTargetBranch;
		if (targetChanged && sameWorkspace) {
			switchChangesRef.current = changes;
			setBranchSwitching(true);
		}
	}, [workspaceId, workspaceTargetBranch, changes]);
	useEffect(() => {
		if (!branchSwitching) return;
		// Clear once fresh data arrives (array identity changes).
		if (changes !== switchChangesRef.current) {
			setBranchSwitching(false);
			return;
		}
		// Safety timeout so loading never gets stuck.
		const id = window.setTimeout(() => setBranchSwitching(false), 5000);
		return () => window.clearTimeout(id);
	}, [branchSwitching, changes]);
	return branchSwitching;
}
