import { Check, ChevronDown, Columns3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
	DashboardColumnId,
	DashboardColumnMeta,
} from "../hooks/use-dashboard-board";

type Props = {
	columns: readonly DashboardColumnMeta[];
	visible: ReadonlySet<DashboardColumnId>;
	onChange: (next: Set<DashboardColumnId>) => void;
};

export function ColumnFilter({ columns, visible, onChange }: Props) {
	const allVisible = visible.size === columns.length;
	const label = allVisible ? "All columns" : `${visible.size} columns`;

	function showAll() {
		onChange(new Set(columns.map((c) => c.id)));
	}

	function toggle(id: DashboardColumnId) {
		if (visible.has(id) && visible.size === 1) return;
		const next = new Set(visible);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange(next);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Filter columns"
					className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-foreground text-xs transition-colors hover:border-border hover:bg-accent/50"
				>
					<Columns3 className="size-3.5 text-muted-foreground" />
					<span className="max-w-40 truncate font-medium">{label}</span>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 gap-0 p-1">
				<button
					type="button"
					onClick={showAll}
					className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60"
				>
					<span className="font-medium">All columns</span>
					{allVisible && <Check className="size-4 text-primary" />}
				</button>
				<div className="my-1 h-px bg-border/60" aria-hidden />
				<div className="flex flex-col">
					{columns.map((column) => {
						const checked = visible.has(column.id);
						const disabled = checked && visible.size === 1;
						const Icon = column.icon;
						return (
							<button
								key={column.id}
								type="button"
								aria-pressed={checked}
								disabled={disabled}
								onClick={() => toggle(column.id)}
								className={cn(
									"flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
								)}
							>
								<Checkbox
									checked={checked}
									disabled={disabled}
									tabIndex={-1}
									aria-hidden
								/>
								<Icon className="size-4 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate">{column.label}</span>
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
