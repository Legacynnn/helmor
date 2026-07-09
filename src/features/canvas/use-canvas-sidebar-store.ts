import { create } from "zustand";

// Open-state for the canvas's floating workspaces sidebar. Persisted to
// localStorage (read synchronously on init) so re-entering the canvas keeps the
// sidebar in the state the user last left it — defaulting to open. Toggled by
// the left-rail "Workspaces" button and the ⌘B (sidebar.left.toggle) shortcut,
// which the global handler reroutes here while the canvas world is active.

const KEY = "helmor.canvas_sidebar_open";

/** Horizontal class the canvas's left-edge chrome (top-left controls, action
 * rail, customize anchor) shifts to while the sidebar is open, so it clears the
 * floating panel instead of sitting behind it. The panel is `left-3` (12px) +
 * `w-[260px]` + a 12px gap = 284px. */
export const CANVAS_SIDEBAR_OPEN_LEFT = "left-[284px]";

function loadOpen(): boolean {
	try {
		// Anything but an explicit "false" (incl. a missing key) means open.
		return localStorage.getItem(KEY) !== "false";
	} catch {
		return true;
	}
}

function persist(open: boolean): void {
	try {
		localStorage.setItem(KEY, String(open));
	} catch {
		// best-effort; ephemeral if storage is unavailable
	}
}

type CanvasSidebarStore = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
};

export const useCanvasSidebarStore = create<CanvasSidebarStore>((set) => ({
	open: loadOpen(),
	setOpen: (open) => {
		persist(open);
		set({ open });
	},
	toggle: () =>
		set((s) => {
			const open = !s.open;
			persist(open);
			return { open };
		}),
}));
