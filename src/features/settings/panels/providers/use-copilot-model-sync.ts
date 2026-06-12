import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type AgentLoginStatusResult, listCopilotModels } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import {
	type CopilotCachedModel,
	type CopilotProviderSettings,
	useSettings,
} from "@/lib/settings";
import { reconcileCopilotEnabledModelIds } from "./copilot-model-defaults";

export type CopilotModelSync = {
	sync: () => Promise<void>;
	isSyncing: boolean;
};

/** Fetch the GitHub Copilot model list, reconcile the enabled set, and
 *  persist it into `app.copilot_provider` — shared by the Settings sync
 *  button and the post-login probe so the composer's picker and the
 *  Settings list always stay in lockstep. */
export function useCopilotModelSync(): CopilotModelSync {
	const queryClient = useQueryClient();
	const { settings, updateSettings } = useSettings();
	const copilot = settings.copilotProvider;

	const { mutateAsync, isPending } = useMutation({
		// Keyed so `useIsMutating` can surface a "Connecting…" state in the
		// providers panel while any sync runs.
		mutationKey: ["copilotModelSync"],
		mutationFn: async () => {
			const models = await listCopilotModels();
			const cached: CopilotCachedModel[] = models.map((m) => ({
				slug: m.id,
				label: m.label,
				...(m.effortLevels && m.effortLevels.length > 0
					? { effortLevels: m.effortLevels }
					: {}),
			}));
			const patch: Partial<CopilotProviderSettings> = {
				status: cached.length > 0 ? "ready" : "none",
				cachedModels: cached,
				enabledModelIds: reconcileCopilotEnabledModelIds(
					copilot.enabledModelIds,
					cached,
				),
			};
			await Promise.resolve(
				updateSettings({ copilotProvider: { ...copilot, ...patch } }),
			);
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.agentModelSections,
			});
			// Flip copilot's flag in the login-status cache directly so its Ready
			// badge updates the instant the sync lands — invalidating would re-run
			// the slow claude/codex CLI checks bundled in the same command.
			queryClient.setQueryData<AgentLoginStatusResult>(
				helmorQueryKeys.agentLoginStatus,
				(old) => (old ? { ...old, copilot: cached.length > 0 } : old),
			);
		},
	});

	const sync = useCallback(async () => {
		await mutateAsync();
	}, [mutateAsync]);

	return { sync, isSyncing: isPending };
}
