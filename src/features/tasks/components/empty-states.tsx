import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyConnectLinear({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<ListChecks className="size-8" />
			<p>Connect your Linear account to see tasks here.</p>
			<Button size="sm" onClick={onOpenSettings}>
				Open Settings
			</Button>
		</div>
	);
}

export function EmptyLinkLinearTeam({
	onPickTeam,
}: {
	onPickTeam: () => void;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<p>Link a Linear team to this repository to see tasks.</p>
			<Button size="sm" onClick={onPickTeam}>
				Link Linear team
			</Button>
		</div>
	);
}

export function EmptyNoGitHubLogin() {
	return (
		<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
			Sign in to GitHub in Settings to see this repository's PRs and issues.
		</div>
	);
}

export function ErrorState({ message }: { message: string }) {
	return (
		<div className="flex h-full items-center justify-center text-sm text-destructive">
			{message}
		</div>
	);
}
