import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import type { TaskListItem } from "../types";

export function useDetailKeyboard({
	items,
	selected,
	onSelect,
}: {
	items: TaskListItem[];
	selected: TaskListItem | null;
	onSelect: (item: TaskListItem | null) => void;
}) {
	useEffect(() => {
		if (!selected) return;
		const handler = (e: KeyboardEvent) => {
			if (e.defaultPrevented) return;
			const idx = items.findIndex((i) => i.key === selected.key);
			if (idx === -1) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = items[idx + 1];
				if (next) onSelect(next);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				const prev = items[idx - 1];
				if (prev) onSelect(prev);
			} else if ((e.metaKey || e.ctrlKey) && e.key === "o") {
				e.preventDefault();
				void openUrl(selected.url);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [items, selected, onSelect]);
}
