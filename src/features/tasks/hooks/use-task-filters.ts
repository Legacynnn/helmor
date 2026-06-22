import { useMemo, useState } from "react";
import type { Task } from "@/lib/api";
import type { TaskFacet } from "../filters/facets";

export type FilterSelection = Record<string, ReadonlySet<string>>;

/**
 * Generic, provider-agnostic facet filtering over the loaded task set. OR
 * within a facet, AND across facets. Operates purely on the normalized `Task`
 * shape, so the same hook drives any provider's facets.
 */
export function useTaskFilters(tasks: Task[], facets: TaskFacet[]) {
	const [selection, setSelection] = useState<FilterSelection>({});

	const filtered = useMemo(
		() =>
			tasks.filter((task) =>
				facets.every((facet) => {
					const selected = selection[facet.id];
					if (!selected || selected.size === 0) return true;
					return facet.taskKeys(task).some((key) => selected.has(key));
				}),
			),
		[tasks, facets, selection],
	);

	const activeCount = useMemo(
		() =>
			Object.values(selection).reduce((sum, set) => sum + (set?.size ?? 0), 0),
		[selection],
	);

	function toggle(facetId: string, key: string) {
		setSelection((prev) => {
			const next = new Set(prev[facetId] ?? []);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			const out = { ...prev };
			if (next.size === 0) delete out[facetId];
			else out[facetId] = next;
			return out;
		});
	}

	function clearFacet(facetId: string) {
		setSelection((prev) => {
			if (!prev[facetId]) return prev;
			const out = { ...prev };
			delete out[facetId];
			return out;
		});
	}

	function clearAll() {
		setSelection({});
	}

	return { selection, filtered, activeCount, toggle, clearFacet, clearAll };
}
