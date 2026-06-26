import { useCallback, useEffect, useRef } from "react";
import { useCanvasActions } from "./canvas-actions-context";
import {
	type PanelConfig,
	parsePanelConfig,
	stringifyPanelConfig,
} from "./panel-config";

/** Returns a debounced writer that merges a patch into a panel's `config`
 * (persisted in `canvas_panels.config`). Used by panel bodies to save their
 * content (notes text, drawing snapshot, open file, …) — the merge reads the
 * latest config string passed in so concurrent fields don't clobber. */
export function usePanelConfigWriter(
	nodeId: string,
	currentConfig: string,
	debounceMs = 400,
): (patch: Partial<PanelConfig>) => void {
	const { patchNodeData } = useCanvasActions();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latest = useRef(currentConfig);
	latest.current = currentConfig;

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return useCallback(
		(patch: Partial<PanelConfig>) => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				const next = { ...parsePanelConfig(latest.current), ...patch };
				const config = stringifyPanelConfig(next);
				latest.current = config;
				patchNodeData(nodeId, { config });
			}, debounceMs);
		},
		[patchNodeData, nodeId],
	);
}
