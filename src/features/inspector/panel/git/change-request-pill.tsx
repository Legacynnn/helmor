// The change-request pill in the git header: forge brand icon + PR/MR
// number, tinted to match the commit button's lifecycle accent, with an
// "open in browser" tooltip.
import { ExternalLink } from "lucide-react";
import { GithubBrandIcon, GitlabBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkspaceCommitButtonMode } from "@/features/commit/button";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { ChangeRequestInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ChangeRequestPill({
	changeRequest,
	commitButtonMode,
	isMergeRequest,
	openChangeRequestShortcut,
	onClick,
}: {
	changeRequest: ChangeRequestInfo;
	commitButtonMode: WorkspaceCommitButtonMode;
	isMergeRequest: boolean;
	openChangeRequestShortcut: string | null;
	onClick?: () => void;
}) {
	const button = (
		<Button
			type="button"
			variant="outline"
			size="xs"
			className={cn(
				"self-center rounded-md bg-transparent font-normal tracking-[0.01em] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:opacity-80",
				(commitButtonMode === "fix" ||
					commitButtonMode === "merge-blocked" ||
					commitButtonMode === "closed") &&
					"border-[var(--workspace-pr-closed-accent)] text-[var(--workspace-pr-closed-accent)] hover:text-[var(--workspace-pr-closed-accent)]",
				commitButtonMode === "resolve-conflicts" &&
					"border-[var(--workspace-pr-conflicts-accent)] text-[var(--workspace-pr-conflicts-accent)] hover:text-[var(--workspace-pr-conflicts-accent)]",
				commitButtonMode === "checks-running" &&
					"border-[var(--workspace-pr-checks-running-accent)] text-[var(--workspace-pr-checks-running-accent)] hover:text-[var(--workspace-pr-checks-running-accent)]",
				commitButtonMode === "merge" &&
					"border-[var(--workspace-pr-open-accent)] text-[var(--workspace-pr-open-accent)] hover:text-[var(--workspace-pr-open-accent)]",
				commitButtonMode === "merged" &&
					"border-[var(--workspace-pr-merged-accent)] text-[var(--workspace-pr-merged-accent)] hover:text-[var(--workspace-pr-merged-accent)]",
			)}
			onClick={onClick}
		>
			<span className="inline-flex h-4 min-w-0 items-center gap-1.5 leading-4">
				<span className="inline-flex size-4 shrink-0 items-center justify-center overflow-visible">
					{isMergeRequest ? (
						<GitlabBrandIcon size={12} />
					) : (
						<GithubBrandIcon size={12} />
					)}
				</span>
				<span className="inline-flex h-4 min-w-0 items-center truncate leading-4 tabular-nums text-ui font-light">
					{isMergeRequest ? "!" : "#"}
					{changeRequest.number}
				</span>
				<ExternalLink
					size={12}
					strokeWidth={2}
					className="shrink-0 self-center"
				/>
			</span>
		</Button>
	);
	const openLabel = isMergeRequest ? "Open merge request" : "Open pull request";
	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				className="flex max-w-[320px] items-center gap-2 rounded-md px-2 py-1 text-small leading-tight"
			>
				<span className="truncate">{openLabel}</span>
				{openChangeRequestShortcut ? (
					<InlineShortcutDisplay hotkey={openChangeRequestShortcut} />
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
