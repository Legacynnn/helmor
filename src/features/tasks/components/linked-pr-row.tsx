import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
	type GitHubLinkedPullRequest,
	tasksFindWorkspaceForPrUrl,
} from "@/lib/api";

export function LinkedPrRow({
	pr,
	onOpenWorkspace,
}: {
	pr: GitHubLinkedPullRequest;
	onOpenWorkspace?: (workspaceId: string) => void;
}) {
	const linked = useQuery<string | null>({
		queryKey: ["tasks", "linkedWorkspace", "github-pr", pr.url],
		queryFn: () => tasksFindWorkspaceForPrUrl(pr.url),
		staleTime: 30_000,
	});

	return (
		<li className="flex flex-col gap-1">
			<div className="flex items-start gap-1.5">
				<span
					className="mt-1 inline-block size-1.5 shrink-0 rounded-full"
					style={{ backgroundColor: prStateColor(pr.state, pr.isDraft) }}
					aria-hidden="true"
				/>
				<div className="flex min-w-0 flex-col gap-0.5">
					<button
						type="button"
						onClick={() => void openUrl(pr.url)}
						className="cursor-pointer truncate text-left text-[12px] text-foreground/90 hover:text-foreground hover:underline"
					>
						<span className="font-mono text-muted-foreground/70">
							#{pr.number}
						</span>{" "}
						{pr.title}
					</button>
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
						{pr.isDraft ? "draft" : pr.state.toLowerCase()}
					</span>
				</div>
			</div>
			{linked.data && onOpenWorkspace ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onOpenWorkspace(linked.data as string)}
					className="ml-3.5 h-6 cursor-pointer self-start px-2 text-[11px]"
				>
					Open workspace
				</Button>
			) : null}
		</li>
	);
}

function prStateColor(state: string, isDraft: boolean): string {
	if (isDraft) return "#6e7681";
	switch (state.toUpperCase()) {
		case "OPEN":
			return "#1f883d";
		case "MERGED":
			return "#8250df";
		case "CLOSED":
			return "#cf222e";
		default:
			return "#6e7681";
	}
}
