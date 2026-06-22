import { Check, Plus, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskLabel } from "@/lib/api";
import { cn } from "@/lib/utils";

export function LabelSelect({
	value,
	options,
	onChange,
	disabled,
}: {
	/** Labels currently on the task. */
	value: TaskLabel[];
	/** All labels available on the team. */
	options: TaskLabel[];
	/** Fires with the full next set of label ids. */
	onChange: (labelIds: string[]) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selectedIds = useMemo(() => new Set(value.map((l) => l.id)), [value]);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const base = q
			? options.filter((o) => o.name.toLowerCase().includes(q))
			: options;
		return [...base].sort((a, b) => a.name.localeCompare(b.name));
	}, [options, query]);

	function toggle(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange([...next]);
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{value.map((label) => (
				<Badge
					key={label.id}
					variant="outline"
					className="gap-1.5 pr-1"
					style={label.color ? { borderColor: `${label.color}66` } : undefined}
				>
					{label.color ? (
						<span
							className="size-2 rounded-full"
							style={{ backgroundColor: label.color }}
						/>
					) : null}
					{label.name}
					{!disabled ? (
						<button
							type="button"
							aria-label={`Remove ${label.name}`}
							onClick={() => toggle(label.id)}
							className="flex size-3.5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							<X className="size-2.5" />
						</button>
					) : null}
				</Badge>
			))}

			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						className={cn(
							"flex h-6 cursor-pointer items-center gap-1 rounded-full border border-border/60 border-dashed px-2 text-muted-foreground text-small transition-colors",
							"hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
						)}
					>
						<Plus className="size-3" />
						{value.length === 0 ? "Add tags" : "Tag"}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" sideOffset={4} className="w-60 p-1">
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Filter tags…"
						className="mb-1 w-full rounded-md bg-muted/40 px-2 py-1.5 text-ui outline-none placeholder:text-muted-foreground/60"
					/>
					<div
						role="listbox"
						className="flex max-h-64 flex-col overflow-y-auto"
					>
						{filtered.length === 0 ? (
							<p className="px-2 py-3 text-center text-muted-foreground text-small">
								{options.length === 0 ? "No tags on this team" : "No matches"}
							</p>
						) : (
							filtered.map((option) => {
								const selected = selectedIds.has(option.id);
								return (
									<button
										key={option.id}
										type="button"
										role="option"
										aria-selected={selected}
										onClick={() => toggle(option.id)}
										className={cn(
											"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
											selected && "bg-accent/50",
										)}
									>
										<span className="flex min-w-0 items-center gap-2">
											<span
												className="size-2 shrink-0 rounded-full"
												style={{
													backgroundColor: option.color ?? "#8b8b8b",
												}}
											/>
											<span className="truncate">{option.name}</span>
										</span>
										{selected ? <Check className="size-3.5 shrink-0" /> : null}
									</button>
								);
							})
						)}
					</div>
				</PopoverContent>
			</Popover>

			{value.length === 0 && options.length === 0 ? (
				<span className="flex items-center gap-1 text-muted-foreground/50 text-small">
					<Tag className="size-3" />
				</span>
			) : null}
		</div>
	);
}
