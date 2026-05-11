import type { TasksTab } from "../types";

const TABS: { key: TasksTab; label: string }[] = [
	{ key: "tasks", label: "Tasks" },
	{ key: "prs", label: "PRs" },
	{ key: "issues", label: "Issues" },
];

export function TabBar({
	active,
	onChange,
}: {
	active: TasksTab;
	onChange: (tab: TasksTab) => void;
}) {
	return (
		<div className="flex items-center gap-1 text-xs">
			{TABS.map((tab) => (
				<button
					key={tab.key}
					type="button"
					onClick={() => onChange(tab.key)}
					className={
						active === tab.key
							? "cursor-pointer rounded bg-muted px-2 py-1 font-medium"
							: "cursor-pointer rounded px-2 py-1 text-muted-foreground hover:bg-muted/50"
					}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
