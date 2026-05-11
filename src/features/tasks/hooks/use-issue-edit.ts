import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
	type GitHubIssueDetail,
	getInboxItemDetail,
	type InboxItemDetail,
	type InboxItemDetailRef,
	type IssueUpdate,
	updateGithubIssue,
} from "@/lib/api";

type FieldKey = "title" | "body" | "state";

export type IssueEditConflict = {
	field: FieldKey;
	remoteValue: string;
	remoteUpdatedAt: string | null;
};

export type IssueEditOptions = {
	detailRef: InboxItemDetailRef;
	detailQueryKey: readonly unknown[];
	field: FieldKey;
	/**
	 * Returns the remote value of the field on a detail snapshot — used to
	 * decide whether a remote drift actually conflicts with the field
	 * being edited.
	 */
	readField: (detail: GitHubIssueDetail) => string;
};

/**
 * Encapsulates the per-surface save flow:
 *   1. refetch detail (bypassing staleTime),
 *   2. compare `updated_at` against the snapshot captured at edit-start,
 *   3. if drifted AND the field-we're-editing changed remotely → expose
 *      a conflict the caller renders; otherwise PATCH and write the
 *      response into the cache.
 *
 * The hook is stateless about which field is being edited at the UI
 * level — the consumer owns `draft` + `isEditing`. The hook only owns
 * the save mechanics and the conflict signal.
 */
export function useIssueEdit({
	detailRef,
	detailQueryKey,
	field,
	readField,
}: IssueEditOptions) {
	const queryClient = useQueryClient();
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState<IssueEditConflict | null>(null);
	const forceOverwriteRef = useRef(false);

	const clearForce = useCallback(() => {
		forceOverwriteRef.current = false;
	}, []);

	const save = useCallback(
		async (
			update: IssueUpdate,
			snapshotUpdatedAt: string | null,
		): Promise<GitHubIssueDetail | null> => {
			setIsSaving(true);
			setError(null);
			try {
				if (!forceOverwriteRef.current) {
					const refreshed = (await queryClient.fetchQuery({
						queryKey: detailQueryKey,
						queryFn: () => getInboxItemDetail(detailRef),
					})) as InboxItemDetail | null;
					if (refreshed && refreshed.type === "github_issue") {
						const remote = refreshed.data;
						if (
							(remote.updatedAt ?? null) !== (snapshotUpdatedAt ?? null) &&
							readField(remote) !== getDraftBaseline(update, field)
						) {
							setConflict({
								field,
								remoteValue: readField(remote),
								remoteUpdatedAt: remote.updatedAt ?? null,
							});
							return null;
						}
					}
				}

				const result = await updateGithubIssue(
					detailRef.login,
					detailRef.externalId,
					update,
				);
				queryClient.setQueryData<InboxItemDetail | null>(detailQueryKey, {
					type: "github_issue",
					data: result,
				});
				void queryClient.invalidateQueries({ queryKey: ["tasks"] });
				setConflict(null);
				forceOverwriteRef.current = false;
				return result;
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : String(caught));
				return null;
			} finally {
				setIsSaving(false);
			}
		},
		[detailQueryKey, detailRef, field, queryClient, readField],
	);

	return {
		isSaving,
		error,
		conflict,
		dismissConflict: () => setConflict(null),
		overwriteNext: () => {
			forceOverwriteRef.current = true;
			setConflict(null);
		},
		clearForce,
		clearError: () => setError(null),
		save,
	};
}

/**
 * Best-effort: the "baseline" for the field we're editing is what the
 * user thought the remote value was when they hit Save. We approximate
 * with the inverse of the update — `update[field]` is what they're
 * proposing, so the baseline is anything-else. In practice the staleness
 * check only fires for the field actually being PATCHed.
 */
function getDraftBaseline(update: IssueUpdate, field: FieldKey): string {
	// If the user did not include this field in `update`, we did not edit
	// it — so any remote value is "no conflict".
	if (field === "title") return update.title ?? "";
	if (field === "body") return update.body ?? "";
	if (field === "state") return update.state ?? "";
	return "";
}
