import { ChevronDown, FolderGit2 } from "lucide-react";
import { CachedAvatar } from "@/components/cached-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RepositoryCreateOption } from "@/lib/api";
import { initialsFor } from "@/lib/initials";

function RepoAvatar({ repo }: { repo: RepositoryCreateOption }) {
	return (
		<CachedAvatar
			src={repo.repoIconSrc ?? undefined}
			alt={repo.name}
			fallback={repo.repoInitials ?? initialsFor(repo.name)}
			className="size-4 shrink-0 rounded"
			fallbackClassName="rounded text-[9px]"
		/>
	);
}

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
	const selectedRepo =
		selectedId !== "all" ? repos.find((r) => r.id === selectedId) : null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="max-w-[220px] gap-1.5 px-2"
				>
					{selectedRepo ? (
						<RepoAvatar repo={selectedRepo} />
					) : (
						<span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
							<FolderGit2 className="size-3" strokeWidth={1.8} />
						</span>
					)}
					<span className="min-w-0 truncate font-medium">{label}</span>
					<ChevronDown className="size-2.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[180px]">
				<DropdownMenuItem onClick={() => onSelect("all")} className="gap-2">
					<span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
						<FolderGit2 className="size-3" strokeWidth={1.8} />
					</span>
					All repos
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{repos.map((repo) => (
					<DropdownMenuItem
						key={repo.id}
						onClick={() => onSelect(repo.id)}
						className="gap-2"
					>
						<RepoAvatar repo={repo} />
						<span className="min-w-0 truncate">{repo.name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
