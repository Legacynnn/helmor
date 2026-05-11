import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskListItem } from "../types";
import { ItemRow } from "./item-row";

type Group = {
	key: string;
	label: string;
	color: string;
	items: TaskListItem[];
};

function groupByStatus(items: TaskListItem[]): Group[] {
	const map = new Map<string, Group>();
	for (const item of items) {
		const existing = map.get(item.status.key);
		if (existing) {
			existing.items.push(item);
		} else {
			map.set(item.status.key, {
				key: item.status.key,
				label: item.status.label,
				color: item.status.color,
				items: [item],
			});
		}
	}
	return Array.from(map.values());
}

export function ItemList({ items }: { items: TaskListItem[] }) {
	const groups = useMemo(() => groupByStatus(items), [items]);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	if (items.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Nothing here yet.
			</div>
		);
	}

	return (
		<div className="flex flex-col overflow-auto">
			{groups.map((group) => {
				const isCollapsed = collapsed[group.key] === true;
				return (
					<section key={group.key}>
						<button
							type="button"
							onClick={() =>
								setCollapsed((prev) => ({
									...prev,
									[group.key]: !prev[group.key],
								}))
							}
							className="flex w-full cursor-pointer items-center gap-2 bg-muted/30 px-3 py-1 text-left text-xs font-medium"
						>
							{isCollapsed ? (
								<ChevronRight className="size-3" />
							) : (
								<ChevronDown className="size-3" />
							)}
							<span
								className="size-2 rounded-full"
								style={{ background: group.color }}
								aria-hidden="true"
							/>
							<span>{group.label}</span>
							<span className="text-muted-foreground">
								{group.items.length}
							</span>
						</button>
						{isCollapsed
							? null
							: group.items.map((item) => (
									<ItemRow key={item.key} item={item} />
								))}
					</section>
				);
			})}
		</div>
	);
}
