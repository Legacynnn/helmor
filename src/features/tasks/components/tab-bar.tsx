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

const TABS: { key: TasksTab; label: string }[] = [
	{ key: "tasks", label: "Tasks" },
	{ key: "prs", label: "PRs" },
	{ key: "issues", label: "Issues" },
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
		<div className="flex items-center gap-2 text-xs">
			<div className="flex items-center gap-1">
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
			<div className="h-4 w-px bg-border" />
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
