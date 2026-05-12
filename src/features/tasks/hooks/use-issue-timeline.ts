import { useQuery } from "@tanstack/react-query";
import { type GitHubTimelineEvent, listGithubIssueTimeline } from "@/lib/api";

export function issueTimelineQueryKey(login: string, externalId: string) {
	return ["tasks", "issue-timeline", login, externalId] as const;
}

export function useIssueTimeline(login: string, externalId: string) {
	return useQuery<GitHubTimelineEvent[]>({
		queryKey: issueTimelineQueryKey(login, externalId),
		queryFn: () => listGithubIssueTimeline(login, externalId),
		staleTime: 30_000,
	});
}
