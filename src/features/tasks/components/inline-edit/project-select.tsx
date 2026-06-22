import { Box, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskProject } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectIcon } from "../project-icon";

export function ProjectSelect({
	project,
	options,
	onChange,
	disabled,
}: {
	project: TaskProject | null;
	options: TaskProject[];
	/** Empty string clears the project. */
	onChange: (projectId: string) => void;
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
		if (id !== (project?.id ?? "")) onChange(id);
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
					{project ? (
						<>
							<ProjectIcon project={project} size={13} />
							<span className="max-w-[140px] truncate">{project.name}</span>
						</>
					) : (
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<Box className="size-3.5" />
							Project
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={4} className="w-60 p-1">
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Filter projects…"
					className="mb-1 w-full rounded-md bg-muted/40 px-2 py-1.5 text-ui outline-none placeholder:text-muted-foreground/60"
				/>
				<div role="listbox" className="flex max-h-64 flex-col overflow-y-auto">
					<button
						type="button"
						role="option"
						aria-selected={!project}
						onClick={() => pick("")}
						className={cn(
							"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
							!project && "bg-accent/50",
						)}
					>
						<span className="flex items-center gap-2 text-muted-foreground">
							<Box className="size-3.5" />
							No project
						</span>
						{!project ? <Check className="size-3.5" /> : null}
					</button>
					{filtered.map((option) => {
						const selected = option.id === project?.id;
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
									<ProjectIcon project={option} size={13} />
									<span className="truncate">{option.name}</span>
								</span>
								{selected ? <Check className="size-3.5 shrink-0" /> : null}
							</button>
						);
					})}
					{filtered.length === 0 ? (
						<p className="px-2 py-3 text-center text-muted-foreground text-small">
							{options.length === 0 ? "No projects" : "No matches"}
						</p>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
