import { useCallback, useEffect, useRef } from "react";
import { type TLShapeId, useEditor } from "tldraw";
import {
	type PanelConfig,
	parsePanelConfig,
	stringifyPanelConfig,
} from "./panel-config";
import type { PanelShape } from "./shapes/panel-shape";

/** Returns a debounced writer that merges a patch into a panel's `config`
 * prop. Writing through `editor.updateShape` flows into the sync engine's
 * change listener, which debounce-persists the row — so panel-body content
 * (notes text, drawing snapshot, open file) survives reload like any panel
 * geometry. */
export function usePanelConfigWriter(
	shapeId: string,
	debounceMs = 400,
): (patch: Partial<PanelConfig>) => void {
	const editor = useEditor();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
				const shape = editor.getShape(shapeId as TLShapeId) as
					| PanelShape
					| undefined;
				if (shape?.type !== "panel") return;
				const next = { ...parsePanelConfig(shape.props.config), ...patch };
				editor.updateShape<PanelShape>({
					id: shape.id,
					type: "panel",
					props: { config: stringifyPanelConfig(next) },
				});
			}, debounceMs);
		},
		[editor, shapeId, debounceMs],
	);
}
