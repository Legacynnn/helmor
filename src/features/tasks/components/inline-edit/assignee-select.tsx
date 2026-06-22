import { Check, UserCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskAssignee } from "@/lib/api";
import { cn } from "@/lib/utils";

function Face({ user, className }: { user: TaskAssignee; className?: string }) {
	return (
		<Avatar className={cn("size-4", className)}>
			{user.avatarUrl ? (
				<AvatarImage src={user.avatarUrl} alt={user.name} />
			) : null}
			<AvatarFallback className="text-[9px]">
				{user.name.slice(0, 2).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}

export function AssigneeSelect({
	assignee,
	options,
	onChange,
	disabled,
}: {
	assignee: TaskAssignee | null;
	options: TaskAssignee[];
	/** Empty string clears the assignee. */
	onChange: (assigneeId: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q
			? options.filter((o) => o.name.toLowerCase().includes(q))
			: options;
	}, [options, query]);

	function pick(id: string) {
		if (id !== (assignee?.id ?? "")) onChange(id);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					className="h-7 gap-1.5 px-2 font-normal"
				>
					{assignee ? (
						<>
							<Face user={assignee} />
							<span className="truncate">{assignee.name}</span>
						</>
					) : (
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<UserCircle2 className="size-4" />
							Unassigned
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={4} className="w-60 p-1">
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Filter members…"
					className="mb-1 w-full rounded-md bg-muted/40 px-2 py-1.5 text-ui outline-none placeholder:text-muted-foreground/60"
				/>
				<div role="listbox" className="flex max-h-64 flex-col overflow-y-auto">
					<button
						type="button"
						role="option"
						aria-selected={!assignee}
						onClick={() => pick("")}
						className={cn(
							"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
							!assignee && "bg-accent/50",
						)}
					>
						<span className="flex items-center gap-2 text-muted-foreground">
							<UserCircle2 className="size-4" />
							Unassigned
						</span>
						{!assignee ? <Check className="size-3.5" /> : null}
					</button>
					{filtered.map((option) => {
						const selected = option.id === assignee?.id;
						return (
							<button
								key={option.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => pick(option.id)}
								className={cn(
									"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
									selected && "bg-accent/50",
								)}
							>
								<span className="flex min-w-0 items-center gap-2">
									<Face user={option} />
									<span className="truncate">{option.name}</span>
								</span>
								{selected ? <Check className="size-3.5 shrink-0" /> : null}
							</button>
						);
					})}
					{filtered.length === 0 ? (
						<p className="px-2 py-3 text-center text-muted-foreground text-small">
							{options.length === 0 ? "No members found" : "No matches"}
						</p>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
