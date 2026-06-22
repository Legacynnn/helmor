import { Check, ListFilter, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Task } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FacetContext, TaskFacet } from "../filters/facets";
import type { FilterSelection } from "../hooks/use-task-filters";

export function TaskFilterBar({
	facets,
	tasks,
	context,
	selection,
	activeCount,
	onToggle,
	onClearFacet,
	onClearAll,
}: {
	facets: TaskFacet[];
	/** The unfiltered task set — facet options derive from it. */
	tasks: Task[];
	/** Provider-fetched reference data (e.g. full project list). */
	context?: FacetContext;
	selection: FilterSelection;
	activeCount: number;
	onToggle: (facetId: string, key: string) => void;
	onClearFacet: (facetId: string) => void;
	onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5 border-border/40 border-b px-3 py-2">
			<ListFilter className="size-3.5 text-muted-foreground" />
			{facets.map((facet) => (
				<FacetMenu
					key={facet.id}
					facet={facet}
					tasks={tasks}
					context={context}
					selected={selection[facet.id]}
					onToggle={(key) => onToggle(facet.id, key)}
					onClear={() => onClearFacet(facet.id)}
				/>
			))}
			{activeCount > 0 ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 cursor-pointer px-2 text-muted-foreground"
					onClick={onClearAll}
				>
					<X className="size-3.5" />
					Clear
				</Button>
			) : null}
		</div>
	);
}

function FacetMenu({
	facet,
	tasks,
	context,
	selected,
	onToggle,
	onClear,
}: {
	facet: TaskFacet;
	tasks: Task[];
	context?: FacetContext;
	selected: ReadonlySet<string> | undefined;
	onToggle: (key: string) => void;
	onClear: () => void;
}) {
	const [open, setOpen] = useState(false);
	const options = facet.options(tasks, context);
	const count = selected?.size ?? 0;
	const summary =
		count === 0
			? null
			: count === 1
				? (options.find((o) => selected?.has(o.key))?.label ?? `${count}`)
				: `${count}`;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn(
						"h-7 cursor-pointer gap-1.5 px-2 font-normal",
						count > 0 && "border-primary/50 bg-primary/5",
					)}
				>
					<span className="text-muted-foreground">{facet.label}</span>
					{summary ? (
						<span className="max-w-[120px] truncate font-medium text-foreground">
							{summary}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={4} className="w-56 p-1">
				{options.length === 0 ? (
					<p className="px-2 py-3 text-center text-muted-foreground text-small">
						Nothing to filter
					</p>
				) : (
					<div
						role="listbox"
						className="flex max-h-72 flex-col overflow-y-auto"
					>
						{options.map((option) => {
							const isSelected = selected?.has(option.key) ?? false;
							return (
								<button
									key={option.key}
									type="button"
									role="option"
									aria-selected={isSelected}
									onClick={() => onToggle(option.key)}
									className={cn(
										"flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-ui hover:bg-accent",
										isSelected && "bg-accent/50",
									)}
								>
									<span className="flex min-w-0 items-center gap-2">
										{option.swatch ? (
											<span
												className="size-2.5 shrink-0 rounded-full"
												style={{ backgroundColor: option.swatch }}
											/>
										) : null}
										{option.icon ? (
											<span className="flex shrink-0 items-center">
												{option.icon}
											</span>
										) : null}
										<span className="truncate text-left">{option.label}</span>
									</span>
									{isSelected ? (
										<Check className="size-3.5 shrink-0 text-primary" />
									) : null}
								</button>
							);
						})}
					</div>
				)}
				{count > 0 ? (
					<button
						type="button"
						onClick={onClear}
						className="mt-1 flex h-7 w-full cursor-pointer items-center justify-center rounded-md border-border/40 border-t text-muted-foreground text-small hover:bg-accent"
					>
						Clear {facet.label.toLowerCase()}
					</button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
