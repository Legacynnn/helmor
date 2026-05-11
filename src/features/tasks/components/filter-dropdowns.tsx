import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
	AssigneeFilter,
	IssueFilters,
	IssueStateFilter,
	LinearFilters,
	LinearStatusFilter,
	PrFilters,
	PrStateFilter,
} from "../types";

const LINEAR_STATUS_OPTIONS: { key: LinearStatusFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "backlog", label: "Backlog" },
	{ key: "unstarted", label: "Unstarted" },
	{ key: "started", label: "In Progress" },
	{ key: "in-review", label: "In Review" },
];

const PR_STATE_OPTIONS: { key: PrStateFilter; label: string }[] = [
	{ key: "open", label: "Open" },
	{ key: "draft", label: "Draft" },
	{ key: "merged", label: "Merged" },
	{ key: "closed", label: "Closed" },
];

const ISSUE_STATE_OPTIONS: { key: IssueStateFilter; label: string }[] = [
	{ key: "open", label: "Open" },
	{ key: "closed", label: "Closed" },
];

const ASSIGNEE_OPTIONS: { key: AssigneeFilter; label: string }[] = [
	{ key: "any", label: "Anyone" },
	{ key: "me", label: "Me" },
];

function assigneeLabel(filter: AssigneeFilter): string {
	const match = ASSIGNEE_OPTIONS.find((o) => o.key === filter);
	return match ? match.label : String(filter);
}

function FilterButton({
	label,
	value,
	children,
}: {
	label: string;
	value: string;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1 px-2">
					<span className="text-muted-foreground">{label}:</span>
					<span>{value}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">{children}</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function LinearFilterRow({
	filters,
	onChange,
}: {
	filters: LinearFilters;
	onChange: (next: LinearFilters) => void;
}) {
	const statusLabel =
		LINEAR_STATUS_OPTIONS.find((o) => o.key === filters.status)?.label ?? "All";
	return (
		<div className="flex items-center gap-1">
			<FilterButton label="Status" value={statusLabel}>
				{LINEAR_STATUS_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, status: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton label="Assignee" value={assigneeLabel(filters.assignee)}>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}

export function PrFilterRow({
	filters,
	onChange,
}: {
	filters: PrFilters;
	onChange: (next: PrFilters) => void;
}) {
	const stateLabel =
		PR_STATE_OPTIONS.find((o) => o.key === filters.state)?.label ?? "Open";
	return (
		<div className="flex items-center gap-1">
			<FilterButton label="State" value={stateLabel}>
				{PR_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton label="Assignee" value={assigneeLabel(filters.assignee)}>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="gap-1 px-2">
						<span className="text-muted-foreground">Linked:</span>
						<span>{filters.linkedToIssue ? "Yes" : "Any"}</span>
						<ChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuCheckboxItem
						checked={filters.linkedToIssue}
						onCheckedChange={(checked) =>
							onChange({ ...filters, linkedToIssue: checked === true })
						}
					>
						Linked to issue
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}

export function IssueFilterRow({
	filters,
	onChange,
}: {
	filters: IssueFilters;
	onChange: (next: IssueFilters) => void;
}) {
	const stateLabel =
		ISSUE_STATE_OPTIONS.find((o) => o.key === filters.state)?.label ?? "Open";
	return (
		<div className="flex items-center gap-1">
			<FilterButton label="State" value={stateLabel}>
				{ISSUE_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton label="Assignee" value={assigneeLabel(filters.assignee)}>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}
