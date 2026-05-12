import {
	CheckSquare,
	CircleDot,
	GitPullRequest,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	IssueFilters,
	LinearFilters,
	PrFilters,
	TasksTab,
} from "../types";
import {
	IssueFilterRow,
	LinearFilterRow,
	PrFilterRow,
} from "./filter-dropdowns";

const TABS: { key: TasksTab; label: string; icon: LucideIcon }[] = [
	{ key: "tasks", label: "Tasks", icon: CheckSquare },
	{ key: "prs", label: "PRs", icon: GitPullRequest },
	{ key: "issues", label: "Issues", icon: CircleDot },
];

export function TabBar({
	active,
	onChange,
	linearFilters,
	prFilters,
	issueFilters,
	onLinearFiltersChange,
	onPrFiltersChange,
	onIssueFiltersChange,
}: {
	active: TasksTab;
	onChange: (tab: TasksTab) => void;
	linearFilters: LinearFilters;
	prFilters: PrFilters;
	issueFilters: IssueFilters;
	onLinearFiltersChange: (next: LinearFilters) => void;
	onPrFiltersChange: (next: PrFilters) => void;
	onIssueFiltersChange: (next: IssueFilters) => void;
}) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
			<div className="flex shrink-0 items-center gap-1 rounded-md bg-muted/35 p-0.5">
				{TABS.map((tab) => {
					const Icon = tab.icon;
					const selected = active === tab.key;
					return (
						<button
							key={tab.key}
							type="button"
							aria-pressed={selected}
							onClick={() => onChange(tab.key)}
							className={cn(
								"inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 font-medium transition-colors",
								selected
									? "bg-background text-foreground shadow-xs ring-1 ring-border/70"
									: "text-muted-foreground hover:bg-background/65 hover:text-foreground",
							)}
						>
							<Icon className="size-3" strokeWidth={1.8} />
							{tab.label}
						</button>
					);
				})}
			</div>
			{active === "tasks" ? (
				<LinearFilterRow
					filters={linearFilters}
					onChange={onLinearFiltersChange}
				/>
			) : active === "prs" ? (
				<PrFilterRow filters={prFilters} onChange={onPrFiltersChange} />
			) : (
				<IssueFilterRow
					filters={issueFilters}
					onChange={onIssueFiltersChange}
				/>
			)}
		</div>
	);
}
