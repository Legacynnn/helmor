import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RepositoryCreateOption } from "@/lib/api";

export function RepoSwitcher({
	repos,
	selectedId,
	onSelect,
}: {
	repos: RepositoryCreateOption[];
	selectedId: string | "all" | null;
	onSelect: (id: string | "all") => void;
}) {
	const label =
		selectedId === "all"
			? "All repos"
			: (repos.find((r) => r.id === selectedId)?.name ?? "Select repo");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1.5">
					<span className="font-medium">{label}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[180px]">
				<DropdownMenuItem onClick={() => onSelect("all")}>
					All repos
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{repos.map((repo) => (
					<DropdownMenuItem key={repo.id} onClick={() => onSelect(repo.id)}>
						{repo.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
