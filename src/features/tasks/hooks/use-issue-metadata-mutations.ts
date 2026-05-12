import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	type GitHubIssueDetail,
	setGithubIssueAssignees,
	setGithubIssueLabels,
	setGithubIssueMilestone,
	setGithubIssueType,
} from "@/lib/api";

type Source = "github_issue" | "github_pr" | "github_discussion";

function detailQueryKey(
	login: string,
	source: Source,
	externalId: string,
): readonly unknown[] {
	return [
		"tasks",
		"detail",
		"github",
		"github",
		login,
		source,
		externalId,
	] as const;
}

function writeBack(
	queryClient: ReturnType<typeof useQueryClient>,
	login: string,
	externalId: string,
	updated: GitHubIssueDetail,
) {
	queryClient.setQueryData(detailQueryKey(login, "github_issue", externalId), {
		type: "github_issue",
		data: updated,
	});
}

export function useSetIssueAssignees(login: string, externalId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (logins: string[]) =>
			setGithubIssueAssignees(login, externalId, logins),
		onSuccess: (updated) => writeBack(queryClient, login, externalId, updated),
	});
}

export function useSetIssueLabels(login: string, externalId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (names: string[]) =>
			setGithubIssueLabels(login, externalId, names),
		onSuccess: (updated) => writeBack(queryClient, login, externalId, updated),
	});
}

export function useSetIssueMilestone(login: string, externalId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (milestoneNumber: number | null) =>
			setGithubIssueMilestone(login, externalId, milestoneNumber),
		onSuccess: (updated) => writeBack(queryClient, login, externalId, updated),
	});
}

export function useSetIssueType(login: string, externalId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (issueTypeId: string | null) =>
			setGithubIssueType(login, externalId, issueTypeId),
		onSuccess: (updated) => writeBack(queryClient, login, externalId, updated),
	});
}
