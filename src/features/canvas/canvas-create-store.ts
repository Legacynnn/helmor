import { create } from "zustand";
import type { CanvasPanelType } from "@/lib/api";

// Transient "armed to place a new panel" state for the active canvas. The
// Create rail arms a panel type (cursor → crosshair); the create overlay reads
// it to draw the placement rectangle and clears it once a panel is dropped (or
// the user presses Esc). Kept out of persisted state — it's pure interaction.

type CanvasCreateStore = {
	/** The panel type the user is about to drag-place, or null when idle. */
	pendingType: CanvasPanelType | null;
	/** Arm `type`, or disarm if it's already the armed type (toggle). */
	toggle: (type: CanvasPanelType) => void;
	/** Disarm (panel placed, or cancelled). */
	clear: () => void;
};

export const useCanvasCreateStore = create<CanvasCreateStore>((set) => ({
	pendingType: null,
	toggle: (type) =>
		set((s) => ({ pendingType: s.pendingType === type ? null : type })),
	clear: () => set({ pendingType: null }),
}));
