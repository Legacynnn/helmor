import { create } from "zustand";

// Transient "select / move" interaction mode for the active canvas. When on, the
// left-drag on the empty pane draws a marquee selection box (instead of panning);
// middle/right mouse still pans. Selected panels move together and can be deleted
// as a group. Kept out of persisted state — it's pure interaction.

type CanvasInteractionStore = {
	/** When true, left-drag marquee-selects instead of panning. */
	selectMode: boolean;
	/** Set select mode explicitly. */
	setSelectMode: (v: boolean) => void;
	/** Flip select mode on/off. */
	toggleSelect: () => void;
};

export const useCanvasInteractionStore = create<CanvasInteractionStore>(
	(set) => ({
		selectMode: false,
		setSelectMode: (v) => set({ selectMode: v }),
		toggleSelect: () => set((s) => ({ selectMode: !s.selectMode })),
	}),
);
