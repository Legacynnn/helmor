import { create } from "zustand";
import type { Vec } from "./verlet-rope";

/** The single in-flight cable. Decorative for now: plugging in records the
 * target but does NOT persist a connection. */
export type ActiveCable = {
	sourcePaneId: string;
	/** Source anchor in flow coordinates (right-edge midpoint of the source). */
	anchor: Vec;
	/** Free/plug end position in flow coordinates (used while dragging/plugged). */
	plug: Vec;
	/** True while the user is dragging the plug. */
	dragging: boolean;
	/** Pane currently under the plug (highlighted as a drop target). */
	hoveredTargetId: string | null;
	/** Pane the cable is visually plugged into (decorative). */
	pluggedTargetId: string | null;
};

type CableStore = {
	active: ActiveCable | null;
	/** Start a new cable from `sourcePaneId`, anchored at `anchor`. Spawns in
	 * "following" mode (`dragging: true`) so the plug tracks the cursor right
	 * away until the user clicks a pane to plug in or cancels. */
	spawn: (sourcePaneId: string, anchor: Vec) => void;
	setDragging: (dragging: boolean) => void;
	/** Move the plug (flow coords) and set the hovered drop target. */
	updatePlug: (plug: Vec, hoveredTargetId: string | null) => void;
	/** Visually plug into `targetPaneId` at `at` (flow coords).
	 * TODO(connection-persist): when the connect feature lands, also create a
	 * real CanvasConnection here via useConnectionsStore.addConnection(). */
	plugInto: (targetPaneId: string, at: Vec) => void;
	cancel: () => void;
};

export const useCableStore = create<CableStore>((set) => ({
	active: null,

	spawn: (sourcePaneId, anchor) =>
		set({
			active: {
				sourcePaneId,
				anchor,
				plug: { x: anchor.x + 80, y: anchor.y + 40 },
				dragging: true,
				hoveredTargetId: null,
				pluggedTargetId: null,
			},
		}),

	setDragging: (dragging) =>
		set((s) => (s.active ? { active: { ...s.active, dragging } } : s)),

	updatePlug: (plug, hoveredTargetId) =>
		set((s) =>
			s.active
				? {
						active: {
							...s.active,
							plug,
							hoveredTargetId,
							pluggedTargetId: null,
						},
					}
				: s,
		),

	plugInto: (targetPaneId, at) =>
		set((s) =>
			s.active
				? {
						active: {
							...s.active,
							plug: at,
							dragging: false,
							hoveredTargetId: null,
							pluggedTargetId: targetPaneId,
						},
					}
				: s,
		),

	cancel: () => set({ active: null }),
}));
