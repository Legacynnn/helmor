import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { TaskStatusIcon } from "../status-icon";
import type { TaskListItem } from "../types";
import { ItemRow } from "./item-row";

type Group = {
	key: string;
	label: string;
	status: TaskListItem["status"];
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
				status: item.status,
				items: [item],
			});
		}
	}
	return Array.from(map.values());
}

export function ItemList({
	items,
	collapsedGroups,
	onToggleCollapse,
	selectedKey,
	onSelectItem,
}: {
	items: TaskListItem[];
	collapsedGroups: string[];
	onToggleCollapse: (groupKey: string, collapsed: boolean) => void;
	selectedKey: string | null;
	onSelectItem: (item: TaskListItem) => void;
}) {
	const groups = useMemo(() => groupByStatus(items), [items]);

	if (items.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Nothing here yet.
			</div>
		);
	}

	return (
		<div className="flex flex-col overflow-auto bg-background">
			{groups.map((group) => {
				const isCollapsed = collapsedGroups.includes(group.key);
				return (
					<section key={group.key}>
						<button
							type="button"
							onClick={() => onToggleCollapse(group.key, !isCollapsed)}
							className="flex h-10 w-full cursor-pointer items-center gap-2 px-3 text-left text-xs font-medium shadow-[inset_0_-1px_0_rgb(255_255_255_/_0.04)] backdrop-blur-md transition-colors hover:brightness-110"
							style={{
								background:
									"linear-gradient(135deg, rgb(255 255 255 / 0.10) 0%, rgb(255 255 255 / 0.025) 48%, rgb(255 255 255 / 0.075) 100%), linear-gradient(135deg, rgb(0 0 0 / 0.10) 0%, rgb(0 0 0 / 0.02) 56%, rgb(0 0 0 / 0.07) 100%), var(--muted)",
							}}
						>
							{isCollapsed ? (
								<ChevronRight className="size-3" />
							) : (
								<ChevronDown className="size-3" />
							)}
							<TaskStatusIcon status={group.status} />
							<span>{group.label}</span>
							<span className="text-muted-foreground">
								{group.items.length}
							</span>
						</button>
						{isCollapsed
							? null
							: group.items.map((item) => (
									<ItemRow
										key={item.key}
										item={item}
										onSelect={onSelectItem}
										isSelected={item.key === selectedKey}
									/>
								))}
					</section>
				);
			})}
		</div>
	);
}
