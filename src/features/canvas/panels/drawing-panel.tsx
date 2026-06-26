import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
	type ComponentProps,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { useCanvasActions } from "../canvas-actions-context";
import { parsePanelConfig, stringifyPanelConfig } from "../panel-config";

const SAVE_DEBOUNCE_MS = 800;

/** Whiteboard panel backed by Excalidraw (MIT). The scene (elements +
 * background) is debounce-persisted into `config.drawing`; restored on mount.
 * Serialization happens on the trailing debounce edge so rapid strokes stay
 * cheap. */
export function DrawingPanelBody({
	nodeId,
	config,
}: {
	nodeId: string;
	config: string;
}) {
	const { patchNodeData } = useCanvasActions();
	// Capture initial scene once — re-reading on every render would reset the
	// board mid-edit.
	const initialData = useMemo((): ComponentProps<
		typeof Excalidraw
	>["initialData"] => {
		const raw = parsePanelConfig(config).drawing;
		if (!raw) return undefined;
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}, [config]);

	const latest = useRef<{ elements: readonly unknown[]; bg?: string } | null>(
		null,
	);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const baseConfig = useRef(config);
	baseConfig.current = config;

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const onChange = useCallback(
		(
			elements: readonly unknown[],
			appState: { viewBackgroundColor?: string },
		) => {
			latest.current = { elements, bg: appState.viewBackgroundColor };
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				const snap = latest.current;
				if (!snap) return;
				const next = {
					...parsePanelConfig(baseConfig.current),
					drawing: JSON.stringify({
						elements: snap.elements,
						appState: { viewBackgroundColor: snap.bg },
					}),
				};
				patchNodeData(nodeId, { config: stringifyPanelConfig(next) });
			}, SAVE_DEBOUNCE_MS);
		},
		[patchNodeData, nodeId],
	);

	return (
		<div className="size-full bg-app-base [&_.excalidraw]:!h-full">
			<Excalidraw
				initialData={initialData}
				onChange={onChange}
				UIOptions={{
					canvasActions: { toggleTheme: false, loadScene: false },
				}}
			/>
		</div>
	);
}
