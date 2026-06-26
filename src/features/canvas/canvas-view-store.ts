import { create } from "zustand";
import {
	type CanvasBackgroundPattern,
	type CanvasBackgroundTheme,
	type CanvasViewState,
	saveCanvasViewState,
} from "@/lib/api";

// Single source of truth for a workspace's persisted canvas view state:
// camera (pan/zoom, written by the sync engine) + appearance (translucency,
// background, snap — written by the chrome). One debounced write keeps the
// `canvas_view_state` row consistent regardless of which side changed.

const SAVE_DEBOUNCE_MS = 500;

export type CanvasAppearance = {
	translucency: number;
	backgroundPattern: CanvasBackgroundPattern;
	backgroundColor: string | null;
	backgroundTheme: CanvasBackgroundTheme;
	snapToGrid: boolean;
};

type CanvasViewStore = CanvasViewState & {
	hydrate: (view: CanvasViewState) => void;
	setCamera: (panX: number, panY: number, zoom: number) => void;
	setAppearance: (patch: Partial<CanvasAppearance>) => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(get: () => CanvasViewState) {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		const s = get();
		void saveCanvasViewState({
			workspaceId: s.workspaceId,
			panX: s.panX,
			panY: s.panY,
			zoom: s.zoom,
			translucency: s.translucency,
			backgroundPattern: s.backgroundPattern,
			backgroundColor: s.backgroundColor,
			backgroundTheme: s.backgroundTheme,
			snapToGrid: s.snapToGrid,
			updatedAt: "",
		}).catch(() => {});
	}, SAVE_DEBOUNCE_MS);
}

export const useCanvasViewStore = create<CanvasViewStore>((set, get) => ({
	workspaceId: "",
	panX: 0,
	panY: 0,
	zoom: 1,
	translucency: 1,
	backgroundPattern: "dots",
	backgroundColor: null,
	backgroundTheme: "system",
	snapToGrid: false,
	updatedAt: "",

	hydrate: (view) => set({ ...view }),

	setCamera: (panX, panY, zoom) => {
		set({ panX, panY, zoom });
		scheduleSave(get);
	},

	setAppearance: (patch) => {
		set(patch);
		scheduleSave(get);
	},
}));
