import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TaskStatusIcon } from "../task-status-icon";

export function StatusSelect({
	status,
	options,
	onChange,
	disabled,
}: {
	status: TaskStatus;
	options: TaskStatus[];
	onChange: (statusId: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					className="h-7 justify-between gap-1.5 px-2 font-normal"
				>
					<span className="flex items-center gap-1.5">
						<TaskStatusIcon kind={status.kind} color={status.color} size={14} />
						<span className="truncate">{status.name}</span>
					</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={4} className="w-56 p-1">
				<div role="listbox" className="flex max-h-72 flex-col overflow-y-auto">
					{options.map((option) => {
						const selected = option.id === status.id;
						return (
							<button
								key={option.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => {
									if (option.id !== status.id) onChange(option.id);
									setOpen(false);
								}}
								className={cn(
									"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
									selected && "bg-accent/60",
								)}
							>
								<span className="flex items-center gap-1.5">
									<TaskStatusIcon
										kind={option.kind}
										color={option.color}
										size={14}
									/>
									<span className="truncate">{option.name}</span>
								</span>
								{selected ? <Check className="size-3.5" /> : null}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
