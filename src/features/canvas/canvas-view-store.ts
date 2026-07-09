import { create } from "zustand";
import {
	type CanvasBackgroundPattern,
	type CanvasBackgroundTheme,
	type CanvasRepositoryStyle,
	type CanvasViewState,
	saveCanvasRepositoryStyle,
	saveCanvasViewState,
} from "@/lib/api";

// In-memory source of truth for the live canvas surface. It splits into two
// independently-persisted halves:
//   - camera (pan/zoom)  → `canvas_view_state`, keyed per WORKSPACE.
//   - appearance         → `canvas_repository_style`, keyed per REPOSITORY, so
//                          every workspace of the repo shares one look and
//                          editing it in one restyles them all.
// Each half debounces its own write; hydration comes from two queries (the
// per-workspace canvas state and the per-repo style).

const SAVE_DEBOUNCE_MS = 500;

export type CanvasAppearance = {
	translucency: number;
	backgroundPattern: CanvasBackgroundPattern;
	backgroundColor: string | null;
	backgroundTheme: CanvasBackgroundTheme;
	snapToGrid: boolean;
	backgroundImage: string | null;
};

type CanvasViewStore = {
	// Camera (per workspace).
	workspaceId: string;
	panX: number;
	panY: number;
	zoom: number;
	// Appearance (per repository). `repositoryId` is null for a workspace with
	// no linked repo — appearance edits then stay in-memory (nothing to key on).
	repositoryId: string | null;
	translucency: number;
	backgroundPattern: CanvasBackgroundPattern;
	backgroundColor: string | null;
	backgroundTheme: CanvasBackgroundTheme;
	snapToGrid: boolean;
	backgroundImage: string | null;

	hydrateCamera: (view: CanvasViewState) => void;
	hydrateAppearance: (
		repositoryId: string,
		style: CanvasRepositoryStyle,
	) => void;
	setCamera: (panX: number, panY: number, zoom: number) => void;
	setAppearance: (patch: Partial<CanvasAppearance>) => void;
};

let cameraTimer: ReturnType<typeof setTimeout> | null = null;
let styleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCameraSave(get: () => CanvasViewStore) {
	if (cameraTimer) clearTimeout(cameraTimer);
	cameraTimer = setTimeout(() => {
		cameraTimer = null;
		const s = get();
		void saveCanvasViewState({
			workspaceId: s.workspaceId,
			panX: s.panX,
			panY: s.panY,
			zoom: s.zoom,
			updatedAt: "",
		}).catch(() => {});
	}, SAVE_DEBOUNCE_MS);
}

function scheduleStyleSave(get: () => CanvasViewStore) {
	if (styleTimer) clearTimeout(styleTimer);
	styleTimer = setTimeout(() => {
		styleTimer = null;
		const s = get();
		// No repo → nothing to share the style against; keep it in-memory only.
		if (!s.repositoryId) return;
		void saveCanvasRepositoryStyle({
			repositoryId: s.repositoryId,
			translucency: s.translucency,
			backgroundPattern: s.backgroundPattern,
			backgroundColor: s.backgroundColor,
			backgroundTheme: s.backgroundTheme,
			snapToGrid: s.snapToGrid,
			backgroundImage: s.backgroundImage,
			updatedAt: "",
		}).catch(() => {});
	}, SAVE_DEBOUNCE_MS);
}

export const useCanvasViewStore = create<CanvasViewStore>((set, get) => ({
	workspaceId: "",
	panX: 0,
	panY: 0,
	zoom: 1,
	repositoryId: null,
	translucency: 1,
	backgroundPattern: "dots",
	backgroundColor: null,
	backgroundTheme: "system",
	snapToGrid: false,
	backgroundImage: null,

	hydrateCamera: (view) =>
		set({
			workspaceId: view.workspaceId,
			panX: view.panX,
			panY: view.panY,
			zoom: view.zoom,
		}),

	// Fold a repo's shared style into the store. Used on entry AND whenever the
	// per-repo style query refetches (e.g. a sibling workspace edited it), so the
	// surface restyles live. Never triggers a save — this mirrors persisted state.
	hydrateAppearance: (repositoryId, style) =>
		set({
			repositoryId,
			translucency: style.translucency,
			backgroundPattern: style.backgroundPattern,
			backgroundColor: style.backgroundColor ?? null,
			backgroundTheme: style.backgroundTheme,
			snapToGrid: style.snapToGrid,
			backgroundImage: style.backgroundImage ?? null,
		}),

	setCamera: (panX, panY, zoom) => {
		set({ panX, panY, zoom });
		scheduleCameraSave(get);
	},

	setAppearance: (patch) => {
		set(patch);
		scheduleStyleSave(get);
	},
}));
