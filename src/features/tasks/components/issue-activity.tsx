import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { createGithubIssueComment, type GitHubTimelineEvent } from "@/lib/api";
import { useIssueTimeline } from "../hooks/use-issue-timeline";
import { CommentComposer } from "./comment-composer";
import { type ActivityEntry, TimelineEntry } from "./timeline-entry";

export function IssueActivity({
	login,
	externalId,
}: {
	login: string;
	externalId: string;
}) {
	const queryClient = useQueryClient();
	const timelineQuery = useIssueTimeline(login, externalId);
	const timelineKey = ["tasks", "issue-timeline", login, externalId] as const;

	const mutation = useMutation({
		mutationFn: (body: string) =>
			createGithubIssueComment(login, externalId, body),
		onSuccess: (created) => {
			queryClient.setQueryData<GitHubTimelineEvent[]>(timelineKey, (prev) => {
				const next: GitHubTimelineEvent = {
					kind: "comment",
					id: created.id,
					createdAt: created.createdAt,
					url: created.url,
					body: created.body,
					actor: {
						login: created.authorLogin,
						avatarUrl: created.authorAvatarUrl ?? null,
					},
				};
				return [...(prev ?? []), next];
			});
		},
	});

	const entries: ActivityEntry[] = timelineQuery.data ?? [];
	const commentCount = entries.filter((e) => e.kind === "comment").length;

	return (
		<section aria-label="Issue activity" className="flex flex-col pb-6">
			<header className="mb-2 flex items-baseline gap-2">
				<h2 className="font-semibold text-[12px] text-muted-foreground uppercase tracking-wide">
					Activity
				</h2>
				{commentCount > 0 ? (
					<span className="rounded-sm bg-foreground/10 px-1 font-medium text-[11px] tabular-nums text-foreground/80">
						{commentCount} {commentCount === 1 ? "comment" : "comments"}
					</span>
				) : null}
			</header>

			{timelineQuery.isLoading ? (
				<div className="flex items-center justify-center py-4">
					<HelmorLogoAnimated size={28} className="opacity-70" />
				</div>
			) : timelineQuery.error ? (
				<div className="py-2 text-[12px] text-destructive">
					{timelineQuery.error instanceof Error
						? timelineQuery.error.message
						: String(timelineQuery.error)}
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{entries.map((entry, idx) => (
						<TimelineEntry key={entryKey(entry, idx)} entry={entry} />
					))}
				</ul>
			)}

			<CommentComposer
				isSubmitting={mutation.isPending}
				error={
					mutation.error instanceof Error
						? mutation.error.message
						: mutation.error
							? String(mutation.error)
							: null
				}
				onSubmit={(body) => mutation.mutateAsync(body)}
			/>
		</section>
	);
}

function entryKey(entry: ActivityEntry, idx: number): string {
	if (entry.kind === "issueBody") return "issue-body";
	if (entry.kind === "comment") return `c-${entry.id}`;
	return `${entry.kind}-${entry.createdAt}-${idx}`;
}
