import { create } from "zustand";

/** Transient open-state for the canvas "Panels" popover. Driven by both the
 * workspace-controls button and the `canvas.panelList` (⌘/) shortcut. */
type PanelsListStore = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
};

export const usePanelsListStore = create<PanelsListStore>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
	toggle: () => set((s) => ({ open: !s.open })),
}));
