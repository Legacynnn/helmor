import { create } from "zustand";
import type { WorkspaceSpace } from "@/lib/api";

// View-state for the workspace "space" switch. The DB `space` field is the
// source of truth for *what kind* a workspace is; this store only tracks
// *which world the user is currently looking at* and the last workspace they
// had selected in each, so flipping between Normal and Canvas restores context.
// Read synchronously from localStorage on init so re-entering Canvas never
// flashes the normal chrome first.

const ACTIVE_KEY = "helmor.active_space";
const SELECTED_KEY = "helmor.space_last_selected";

function loadActive(): WorkspaceSpace {
	try {
		return localStorage.getItem(ACTIVE_KEY) === "canvas" ? "canvas" : "normal";
	} catch {
		return "normal";
	}
}

function loadSelected(): Partial<Record<WorkspaceSpace, string>> {
	try {
		const raw = localStorage.getItem(SELECTED_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

type SpaceStore = {
	activeSpace: WorkspaceSpace;
	lastSelected: Partial<Record<WorkspaceSpace, string>>;
	/** When a create flow is opened from a specific space (e.g. "+ New canvas"
	 *  in mission control hops to the normal start surface), this carries the
	 *  intended space so the create tab's toggle defaults to it. Consumed once. */
	pendingCreateSpace: WorkspaceSpace | null;
	setActiveSpace: (space: WorkspaceSpace) => void;
	rememberSelection: (space: WorkspaceSpace, workspaceId: string) => void;
	setPendingCreateSpace: (space: WorkspaceSpace | null) => void;
};

export const useSpaceStore = create<SpaceStore>((set) => ({
	activeSpace: loadActive(),
	lastSelected: loadSelected(),
	pendingCreateSpace: null,
	setPendingCreateSpace: (space) => set({ pendingCreateSpace: space }),
	setActiveSpace: (space) =>
		set((s) => {
			if (s.activeSpace === space) return s;
			try {
				localStorage.setItem(ACTIVE_KEY, space);
			} catch {
				// best-effort; ephemeral if storage is unavailable
			}
			return { activeSpace: space };
		}),
	rememberSelection: (space, workspaceId) =>
		set((s) => {
			if (s.lastSelected[space] === workspaceId) return s;
			const next = { ...s.lastSelected, [space]: workspaceId };
			try {
				localStorage.setItem(SELECTED_KEY, JSON.stringify(next));
			} catch {
				// best-effort
			}
			return { lastSelected: next };
		}),
}));

/** Reactive: which world is currently shown. */
export function useActiveSpace(): WorkspaceSpace {
	return useSpaceStore((s) => s.activeSpace);
}
