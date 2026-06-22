import { Check, ChevronDown, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusKey } from "../filters/status-order";
import { TaskStatusIcon } from "./task-status-icon";

export function BoardColumnFilter({
	columns,
	visibleKeys,
	onToggle,
	onShowAll,
}: {
	columns: TaskStatus[];
	visibleKeys: ReadonlySet<string>;
	onToggle: (key: string) => void;
	onShowAll: () => void;
}) {
	const allVisible = visibleKeys.size === columns.length;
	const label = allVisible ? "All columns" : `${visibleKeys.size} columns`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 cursor-pointer gap-1.5 px-2 font-normal"
				>
					<Columns3 className="size-3.5 text-muted-foreground" />
					<span className="max-w-32 truncate">{label}</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-1">
				<button
					type="button"
					onClick={onShowAll}
					className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-ui hover:bg-accent/60"
				>
					<span className="font-medium">Show all</span>
					{allVisible ? <Check className="size-4 text-primary" /> : null}
				</button>
				<div className="my-1 h-px bg-border/50" aria-hidden />
				<div className="flex max-h-72 flex-col overflow-y-auto">
					{columns.map((column) => {
						const key = statusKey(column);
						const visible = visibleKeys.has(key);
						const isLastVisible = visible && visibleKeys.size === 1;
						return (
							<button
								key={key}
								type="button"
								disabled={isLastVisible}
								onClick={() => onToggle(key)}
								className={cn(
									"flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-ui hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
								)}
							>
								<span className="flex size-4 items-center justify-center">
									{visible ? <Check className="size-3.5 text-primary" /> : null}
								</span>
								<TaskStatusIcon
									kind={column.kind}
									color={column.color}
									title={column.name}
									size={14}
								/>
								<span className="min-w-0 flex-1 truncate text-left">
									{column.name}
								</span>
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
