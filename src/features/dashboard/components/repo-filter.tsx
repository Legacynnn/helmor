import { Check, ChevronDown, ListFilter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import { cn } from "@/lib/utils";
import type { RepoOption } from "../hooks/repo-filter-storage";

type Props = {
	repos: RepoOption[];
	/** Selected repo ids. Empty = "All repos". */
	selected: ReadonlySet<string>;
	onChange: (next: Set<string>) => void;
};

export function RepoFilter({ repos, selected, onChange }: Props) {
	const allSelected = selected.size === 0;
	const label = allSelected
		? "All repos"
		: selected.size === 1
			? (repos.find((r) => selected.has(r.id))?.name ?? "1 repo")
			: `${selected.size} repos`;

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange(next);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Filter by repository"
					className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-foreground text-xs transition-colors hover:border-border hover:bg-accent/50"
				>
					<ListFilter className="size-3.5 text-muted-foreground" />
					<span className="max-w-40 truncate font-medium">{label}</span>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 gap-0 p-1">
				<button
					type="button"
					onClick={() => onChange(new Set())}
					className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60"
				>
					<span className="font-medium">All repos</span>
					{allSelected && <Check className="size-4 text-primary" />}
				</button>
				{repos.length > 0 && (
					<div className="my-1 h-px bg-border/60" aria-hidden />
				)}
				<div className="flex max-h-72 flex-col overflow-y-auto">
					{repos.map((repo) => {
						const checked = selected.has(repo.id);
						return (
							<button
								key={repo.id}
								type="button"
								aria-pressed={checked}
								onClick={() => toggle(repo.id)}
								className={cn(
									"flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60",
								)}
							>
								<Checkbox checked={checked} tabIndex={-1} aria-hidden />
								<WorkspaceAvatar
									repoIconSrc={repo.iconSrc}
									repoInitials={repo.initials}
									repoName={repo.name}
									title={repo.name}
									className="size-4 shrink-0"
								/>
								<span className="min-w-0 flex-1 truncate">{repo.name}</span>
							</button>
						);
					})}
					{repos.length === 0 && (
						<div className="px-2 py-3 text-center text-muted-foreground text-xs">
							No repositories
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
