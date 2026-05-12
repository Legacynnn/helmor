import { useCallback, useEffect, useRef, useState } from "react";
import { getSettingJson, setSettingJson } from "@/lib/api";
import {
	DEFAULT_FILTERS,
	type PerTabFilters,
	type TasksLastView,
	type TasksTab,
} from "../types";

const FILTER_KEY = "tasks.filters.v1";
const COLLAPSED_KEY = "tasks.collapsedGroups.v1";
const LAST_VIEW_KEY = "tasks.lastView.v1";

const DEBOUNCE_MS = 500;

type RepoScope = string | "all";

type FiltersBlob = Partial<Record<RepoScope, PerTabFilters>>;
type CollapsedBlob = Partial<
	Record<RepoScope, Partial<Record<TasksTab, string[]>>>
>;

function mergeDefaults(partial: PerTabFilters | undefined): PerTabFilters {
	if (!partial) return DEFAULT_FILTERS;
	return {
		tasks: { ...DEFAULT_FILTERS.tasks, ...partial.tasks },
		prs: { ...DEFAULT_FILTERS.prs, ...partial.prs },
		issues: { ...DEFAULT_FILTERS.issues, ...partial.issues },
	};
}

export function useTasksFilters(scope: RepoScope | null) {
	const [blob, setBlob] = useState<FiltersBlob>({});
	const [collapsedBlob, setCollapsedBlob] = useState<CollapsedBlob>({});
	const [lastView, setLastView] = useState<TasksLastView | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const collapsedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [filters, collapsed, last] = await Promise.all([
				getSettingJson<FiltersBlob>(FILTER_KEY),
				getSettingJson<CollapsedBlob>(COLLAPSED_KEY),
				getSettingJson<TasksLastView>(LAST_VIEW_KEY),
			]);
			if (cancelled) return;
			if (filters) setBlob(filters);
			if (collapsed) setCollapsedBlob(collapsed);
			if (last) setLastView(last);
			setHydrated(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtersForScope: PerTabFilters = scope
		? mergeDefaults(blob[scope])
		: DEFAULT_FILTERS;

	const setFilters = useCallback(
		(updater: (prev: PerTabFilters) => PerTabFilters) => {
			if (!scope) return;
			setBlob((prev) => {
				const current = mergeDefaults(prev[scope]);
				const next = updater(current);
				const merged = { ...prev, [scope]: next };
				if (writeTimer.current) clearTimeout(writeTimer.current);
				writeTimer.current = setTimeout(() => {
					void setSettingJson(FILTER_KEY, merged);
				}, DEBOUNCE_MS);
				return merged;
			});
		},
		[scope],
	);

	const collapsedGroups: Partial<Record<TasksTab, string[]>> =
		(scope && collapsedBlob[scope]) || {};

	const setCollapsedGroups = useCallback(
		(tab: TasksTab, groupKey: string, collapsed: boolean) => {
			if (!scope) return;
			setCollapsedBlob((prev) => {
				const forScope = (prev[scope] ?? {}) as Partial<
					Record<TasksTab, string[]>
				>;
				const currentList = forScope[tab] ?? [];
				const nextList = collapsed
					? Array.from(new Set([...currentList, groupKey]))
					: currentList.filter((k) => k !== groupKey);
				const merged = {
					...prev,
					[scope]: { ...forScope, [tab]: nextList },
				};
				if (collapsedTimer.current) clearTimeout(collapsedTimer.current);
				collapsedTimer.current = setTimeout(() => {
					void setSettingJson(COLLAPSED_KEY, merged);
				}, DEBOUNCE_MS);
				return merged;
			});
		},
		[scope],
	);

	const saveLastView = useCallback((next: TasksLastView) => {
		setLastView(next);
		if (lastViewTimer.current) clearTimeout(lastViewTimer.current);
		lastViewTimer.current = setTimeout(() => {
			void setSettingJson(LAST_VIEW_KEY, next);
		}, DEBOUNCE_MS);
	}, []);

	return {
		filters: filtersForScope,
		setFilters,
		collapsedGroups,
		setCollapsedGroups,
		lastView,
		saveLastView,
		hydrated,
	};
}
