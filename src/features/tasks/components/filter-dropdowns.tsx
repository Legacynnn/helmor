import {
	ChevronDown,
	CircleDot,
	Link2,
	type LucideIcon,
	Search,
	UserRound,
} from "lucide-react";
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
	icon: Icon,
	label,
	value,
	children,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1.5 px-2">
					<Icon className="size-3 text-muted-foreground" strokeWidth={1.8} />
					<span className="text-muted-foreground">{label}:</span>
					<span>{value}</span>
					<ChevronDown className="size-2.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">{children}</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SearchInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="relative ml-auto w-44 min-w-36 sm:w-56">
			<Search
				className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
				strokeWidth={1.8}
			/>
			<Input
				placeholder="Search"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-7 w-full pl-8"
			/>
		</div>
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
		<div className="flex min-w-0 flex-1 items-center gap-1">
			<FilterButton icon={CircleDot} label="Status" value={statusLabel}>
				{LINEAR_STATUS_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, status: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				icon={UserRound}
				label="Assignee"
				value={assigneeLabel(filters.assignee)}
			>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<SearchInput
				value={filters.search}
				onChange={(search) => onChange({ ...filters, search })}
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
		<div className="flex min-w-0 flex-1 items-center gap-1">
			<FilterButton icon={CircleDot} label="State" value={stateLabel}>
				{PR_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				icon={UserRound}
				label="Assignee"
				value={assigneeLabel(filters.assignee)}
			>
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
					<Button variant="ghost" size="sm" className="gap-1.5 px-2">
						<Link2 className="size-3 text-muted-foreground" strokeWidth={1.8} />
						<span className="text-muted-foreground">Linked:</span>
						<span>{filters.linkedToIssue ? "Yes" : "Any"}</span>
						<ChevronDown className="size-2.5" />
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
			<SearchInput
				value={filters.search}
				onChange={(search) => onChange({ ...filters, search })}
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
		<div className="flex min-w-0 flex-1 items-center gap-1">
			<FilterButton icon={CircleDot} label="State" value={stateLabel}>
				{ISSUE_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				icon={UserRound}
				label="Assignee"
				value={assigneeLabel(filters.assignee)}
			>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<SearchInput
				value={filters.search}
				onChange={(search) => onChange({ ...filters, search })}
			/>
		</div>
	);
}
