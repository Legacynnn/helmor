import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { type TaskPriority, taskPriorityToNumber } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TaskPriorityIcon } from "../task-priority-icon";

const PRIORITIES: { value: TaskPriority; label: string }[] = [
	{ value: "none", label: "No priority" },
	{ value: "urgent", label: "Urgent" },
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
];

const LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export function PrioritySelect({
	priority,
	onChange,
	disabled,
}: {
	priority: TaskPriority;
	/** Receives the numeric Linear priority (0–4). */
	onChange: (priorityNumber: number) => void;
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
					className="h-7 justify-between gap-1.5 px-2 font-normal text-muted-foreground"
				>
					<span className="flex items-center gap-1.5">
						<TaskPriorityIcon priority={priority} size={14} />
						<span className="truncate">{LABELS[priority]}</span>
					</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={4} className="w-48 p-1">
				<div role="listbox" className="flex flex-col">
					{PRIORITIES.map((option) => {
						const selected = option.value === priority;
						return (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => {
									if (option.value !== priority) {
										onChange(taskPriorityToNumber(option.value));
									}
									setOpen(false);
								}}
								className={cn(
									"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
									selected && "bg-accent/60",
								)}
							>
								<span className="flex items-center gap-1.5">
									<TaskPriorityIcon priority={option.value} size={14} />
									<span>{option.label}</span>
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
