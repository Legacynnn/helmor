import { createContext, useContext } from "react";

/** Effective ⌘+digit focus binding per panel id, resolved across the whole
 * panel set (see `resolvePanelBindings`). The canvas surface computes it once
 * and provides it here so each `PanelNode` can surface its own shortcut without
 * re-deriving the global assignment. */
export const PanelBindingsContext = createContext<ReadonlyMap<string, number>>(
	new Map(),
);

/** The effective focus digit for `nodeId`, or undefined when unbound (the 10th+
 * panel, which has no ⌘-digit). */
export function usePanelBindingDigit(nodeId: string): number | undefined {
	return useContext(PanelBindingsContext).get(nodeId);
}
