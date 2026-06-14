import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { helmorQueryKeys } from "@/lib/query-client";
import { type CopilotProviderSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { effectiveCopilotEnabledIds } from "./copilot-model-defaults";
import { ModelMultiSelect } from "./model-multi-select";
import { useCopilotModelSync } from "./use-copilot-model-sync";

export type CopilotModelsHandle = {
	/** Re-probe the Copilot CLI for models (e.g. right after a login). */
	refresh: () => void;
};

export function CopilotModels({
	ref,
}: {
	ref?: React.Ref<CopilotModelsHandle>;
}) {
	const queryClient = useQueryClient();
	const { settings, updateSettings } = useSettings();
	const copilot = settings.copilotProvider;
	const { sync, isSyncing } = useCopilotModelSync();

	const persist = useCallback(
		async (patch: Partial<CopilotProviderSettings>) => {
			await Promise.resolve(
				updateSettings({ copilotProvider: { ...copilot, ...patch } }),
			);
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.agentModelSections,
			});
		},
		[copilot, queryClient, updateSettings],
	);

	useImperativeHandle(
		ref,
		() => ({
			refresh: () => {
				void sync();
			},
		}),
		[sync],
	);

	// Auto-fetch once when no catalog has been cached yet. Ref guards
	// against re-firing within a mount.
	const autoFetchedRef = useRef(false);
	useEffect(() => {
		if (
			copilot.cachedModels === null &&
			!isSyncing &&
			!autoFetchedRef.current
		) {
			autoFetchedRef.current = true;
			void sync();
		}
	}, [copilot.cachedModels, isSyncing, sync]);

	const cached = useMemo(
		() => copilot.cachedModels ?? [],
		[copilot.cachedModels],
	);
	const available = useMemo(
		() => cached.map((m) => ({ id: m.slug, label: m.label })),
		[cached],
	);
	// `null` ⟺ every cached model enabled.
	const enabledIds = useMemo(
		() => effectiveCopilotEnabledIds(copilot.enabledModelIds, cached),
		[copilot.enabledModelIds, cached],
	);
	const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);

	function toggle(id: string) {
		void persist({
			enabledModelIds: enabledSet.has(id)
				? enabledIds.filter((v) => v !== id)
				: [...enabledIds, id],
		});
	}

	return (
		<div className="flex w-full items-center gap-2">
			<ModelMultiSelect
				enabledIds={enabledIds}
				enabledSet={enabledSet}
				available={available}
				onToggle={toggle}
				onClear={() => void persist({ enabledModelIds: [] })}
				loading={isSyncing}
				triggerClassName="min-w-0 flex-1"
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						aria-label="Sync models"
						disabled={isSyncing}
						onClick={() => void sync()}
					>
						<RefreshCcw
							className={cn("size-3.5", isSyncing && "animate-spin")}
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					Sync models — re-probes the Copilot CLI's catalog
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
