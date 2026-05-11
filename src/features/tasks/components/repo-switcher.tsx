import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RepositoryCreateOption } from "@/lib/api";

export function RepoSwitcher({
	repos,
	selectedId,
	onSelect,
}: {
	repos: RepositoryCreateOption[];
	selectedId: string | null;
	onSelect: (repoId: string) => void;
}) {
	const selected = repos.find((r) => r.id === selectedId) ?? repos[0];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1.5">
					<span className="font-medium">{selected?.name ?? "Select repo"}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[180px]">
				{repos.map((repo) => (
					<DropdownMenuItem key={repo.id} onClick={() => onSelect(repo.id)}>
						{repo.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
