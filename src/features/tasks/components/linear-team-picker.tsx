import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type LinearTeam, linearListTeams, linearSetRepoTeam } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

export function LinearTeamPicker({ repoId }: { repoId: string }) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const teams = useQuery<LinearTeam[]>({
		queryKey: ["linear", "teams"],
		queryFn: linearListTeams,
		enabled: open,
		staleTime: 5 * 60_000,
	});

	const pick = async (teamId: string) => {
		await linearSetRepoTeam(repoId, teamId);
		await qc.invalidateQueries({ queryKey: helmorQueryKeys.repositories });
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button size="sm">Link Linear team</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[200px]">
				{teams.isLoading ? (
					<DropdownMenuItem disabled>Loading…</DropdownMenuItem>
				) : teams.isError ? (
					<DropdownMenuItem disabled>Failed to load teams</DropdownMenuItem>
				) : (teams.data ?? []).length === 0 ? (
					<DropdownMenuItem disabled>No teams found</DropdownMenuItem>
				) : (
					(teams.data ?? []).map((team) => (
						<DropdownMenuItem key={team.id} onClick={() => void pick(team.id)}>
							{team.name} ({team.key})
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
