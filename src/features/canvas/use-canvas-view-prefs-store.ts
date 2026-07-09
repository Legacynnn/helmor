import { create } from "zustand";
import type { SidebarGrouping, SidebarSort } from "@/lib/settings";

// Canvas-sidebar view preferences (filter / sort / grouping). Deliberately kept
// SEPARATE from the main workspace sidebar's settings so changing the canvas
// view never disturbs the normal sidebar and vice-versa. Persisted to
// localStorage and read synchronously on init so re-entering the canvas doesn't
// flash a default view first.
//
// Note: the canvas list has no drag-reorder, so "custom" sort is not offered
// here — the default is "updatedAt" (most recent activity first).

const GROUPING_KEY = "helmor.canvas_sidebar_grouping";
const SORT_KEY = "helmor.canvas_sidebar_sort";
const FILTER_KEY = "helmor.canvas_sidebar_repo_filter";

const GROUPINGS: SidebarGrouping[] = ["status", "repo"];
const CANVAS_SORTS: SidebarSort[] = ["repoName", "updatedAt", "createdAt"];

function loadGrouping(): SidebarGrouping {
	try {
		const raw = localStorage.getItem(GROUPING_KEY);
		return raw && (GROUPINGS as string[]).includes(raw)
			? (raw as SidebarGrouping)
			: "repo";
	} catch {
		return "repo";
	}
}

function loadSort(): SidebarSort {
	try {
		const raw = localStorage.getItem(SORT_KEY);
		return raw && (CANVAS_SORTS as string[]).includes(raw)
			? (raw as SidebarSort)
			: "updatedAt";
	} catch {
		return "updatedAt";
	}
}

function loadRepoFilterIds(): string[] {
	try {
		const raw = localStorage.getItem(FILTER_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch {
		return [];
	}
}

function persist(key: string, value: unknown): void {
	try {
		localStorage.setItem(
			key,
			typeof value === "string" ? value : JSON.stringify(value),
		);
	} catch {
		// best-effort; ephemeral if storage is unavailable
	}
}

type CanvasViewPrefsStore = {
	grouping: SidebarGrouping;
	sort: SidebarSort;
	repoFilterIds: string[];
	setGrouping: (grouping: SidebarGrouping) => void;
	setSort: (sort: SidebarSort) => void;
	setRepoFilterIds: (repoIds: string[]) => void;
};

export const useCanvasViewPrefsStore = create<CanvasViewPrefsStore>((set) => ({
	grouping: loadGrouping(),
	sort: loadSort(),
	repoFilterIds: loadRepoFilterIds(),
	setGrouping: (grouping) => {
		persist(GROUPING_KEY, grouping);
		set({ grouping });
	},
	setSort: (sort) => {
		persist(SORT_KEY, sort);
		set({ sort });
	},
	setRepoFilterIds: (repoFilterIds) => {
		persist(FILTER_KEY, repoFilterIds);
		set({ repoFilterIds });
	},
}));
