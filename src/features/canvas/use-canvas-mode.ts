import { create } from "zustand";

// Per-workspace "is canvas mode active" flag. Kept out of the big AppSettings
// wiring: it's pure UI state, read synchronously from localStorage on init so
// re-entering a canvas-mode workspace never flashes the 3-column chrome first.

const STORAGE_KEY = "helmor.canvas_mode_workspaces";

function loadInitial(): Record<string, boolean> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, boolean>)
			: {};
	} catch {
		return {};
	}
}

function persist(map: Record<string, boolean>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// best-effort; ephemeral if storage is unavailable
	}
}

type CanvasModeStore = {
	byWorkspace: Record<string, boolean>;
	toggle: (workspaceId: string) => void;
	setMode: (workspaceId: string, on: boolean) => void;
};

export const useCanvasModeStore = create<CanvasModeStore>((set) => ({
	byWorkspace: loadInitial(),
	toggle: (workspaceId) =>
		set((s) => {
			const next = {
				...s.byWorkspace,
				[workspaceId]: !s.byWorkspace[workspaceId],
			};
			persist(next);
			return { byWorkspace: next };
		}),
	setMode: (workspaceId, on) =>
		set((s) => {
			if (!!s.byWorkspace[workspaceId] === on) return s;
			const next = { ...s.byWorkspace, [workspaceId]: on };
			persist(next);
			return { byWorkspace: next };
		}),
}));

/** Reactive: is the given workspace currently in canvas mode? */
export function useIsCanvasMode(workspaceId: string | null): boolean {
	return useCanvasModeStore((s) =>
		workspaceId ? !!s.byWorkspace[workspaceId] : false,
	);
}
