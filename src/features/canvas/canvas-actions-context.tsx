import { createContext, useContext } from "react";
import type { CanvasPanelType } from "@/lib/api";
import type { PanelConfig } from "./panel-config";
import type { PanelNodeData } from "./types";

/** Mutating actions over the canvas's React Flow nodes, provided by
 * `CanvasSurface`. Every action updates the in-memory node graph AND
 * debounce-persists the affected row(s); consumed by panel bodies (config
 * writes) and chrome (toolbar / rail). Edge actions live in the connections
 * store. */
export type CanvasActions = {
	/** Merge a partial data patch into a panel node and persist it. */
	patchNodeData: (nodeId: string, patch: Partial<PanelNodeData>) => void;
	/** Delete a panel node (and its edges) and persist the removal. */
	removeNode: (nodeId: string) => void;
	/** Create a panel of `type`; conversation/terminal get a bound
	 * session / PTY instance. `config` is merged over the generated config
	 * (e.g. file-manager → editor passes `{ filePath }`). Returns the new id. */
	addPanel: (
		type: CanvasPanelType,
		opts?: {
			position?: { x: number; y: number };
			config?: Partial<PanelConfig>;
		},
	) => Promise<string>;
	/** Duplicate a panel, regenerating live bindings (session / PTY). */
	duplicateNode: (nodeId: string) => Promise<void>;
	/** Z-order. */
	bringToFront: (nodeId: string) => void;
	sendToBack: (nodeId: string) => void;
	/** Lock / unlock (blocks drag + resize). */
	setLocked: (nodeId: string, locked: boolean) => void;
};

const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions(): CanvasActions {
	const ctx = useContext(CanvasActionsContext);
	if (!ctx) {
		throw new Error("useCanvasActions must be used inside a CanvasSurface");
	}
	return ctx;
}
