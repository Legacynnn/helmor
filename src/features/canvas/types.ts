import type { Node } from "@xyflow/react";
import type { CanvasPanelType } from "@/lib/api";

/** Per-panel React Flow node payload. Geometry lives on the node itself
 * (`position`, `width`, `height`); this is the panel-specific data. `config`
 * is the opaque JSON string persisted to `canvas_panels.config`. */
export type PanelNodeData = {
	panelType: CanvasPanelType;
	title: string;
	config: string;
	locked: boolean;
};

export type PanelNode = Node<PanelNodeData, "panel">;

export const PANEL_DEFAULT_WIDTH = 480;
export const PANEL_DEFAULT_HEIGHT = 360;
export const PANEL_MIN_WIDTH = 240;
export const PANEL_MIN_HEIGHT = 160;

/** Text-heavy panels (conversation, terminal) must stay readable, so they
 * translucent more gently than other panels — their surface never drops below
 * this opacity even when the canvas Translucency slider is pulled all the way
 * down. Shared by panel-node (header floor + transparent container) and the
 * conversation/terminal bodies (which paint their own translucent surface). */
export const READABLE_PANEL_MIN_ALPHA = 0.6;

/** Drag a panel only by its header — this class marks the drag handle so the
 * interactive body doesn't move the node. */
export const PANEL_DRAG_HANDLE_CLASS = "canvas-panel-drag-handle";
