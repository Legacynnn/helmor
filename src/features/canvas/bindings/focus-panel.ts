import type { useReactFlow } from "@xyflow/react";
import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH } from "../types";

const MIN_FOCUS_ZOOM = 0.6;
const MAX_FOCUS_ZOOM = 1.5;

/** Select only `id` and smoothly pan/zoom the viewport to center it. */
export function focusPanel(
	rf: ReturnType<typeof useReactFlow>,
	id: string,
): void {
	const node = rf.getNode(id);
	if (!node) return;
	rf.setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
	const w = node.measured?.width ?? node.width ?? PANEL_DEFAULT_WIDTH;
	const h = node.measured?.height ?? node.height ?? PANEL_DEFAULT_HEIGHT;
	const cx = node.position.x + w / 2;
	const cy = node.position.y + h / 2;
	const zoom = Math.min(
		MAX_FOCUS_ZOOM,
		Math.max(MIN_FOCUS_ZOOM, rf.getViewport().zoom),
	);
	rf.setCenter(cx, cy, { zoom, duration: 350 });
}
