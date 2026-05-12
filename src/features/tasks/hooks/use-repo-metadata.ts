import { useQuery } from "@tanstack/react-query";
import {
	type GitHubAssignableUser,
	type GitHubRepoIssueType,
	type GitHubRepoLabel,
	type GitHubRepoMilestone,
	listGithubAssignableUsers,
	listGithubIssueTypes,
	listGithubMilestones,
	listGithubRepoLabels,
} from "@/lib/api";

const STALE = 5 * 60_000;

export function useAssignableUsers(
	enabled: boolean,
	login: string,
	owner: string,
	repo: string,
) {
	return useQuery<GitHubAssignableUser[]>({
		queryKey: ["tasks", "repo-meta", "assignees", login, owner, repo],
		queryFn: () => listGithubAssignableUsers(login, owner, repo),
		enabled,
		staleTime: STALE,
	});
}

export function useRepoLabels(
	enabled: boolean,
	login: string,
	owner: string,
	repo: string,
) {
	return useQuery<GitHubRepoLabel[]>({
		queryKey: ["tasks", "repo-meta", "labels", login, owner, repo],
		queryFn: () => listGithubRepoLabels(login, owner, repo),
		enabled,
		staleTime: STALE,
	});
}

export function useMilestones(
	enabled: boolean,
	login: string,
	owner: string,
	repo: string,
) {
	return useQuery<GitHubRepoMilestone[]>({
		queryKey: ["tasks", "repo-meta", "milestones", login, owner, repo],
		queryFn: () => listGithubMilestones(login, owner, repo),
		enabled,
		staleTime: STALE,
	});
}

export function useIssueTypes(
	enabled: boolean,
	login: string,
	owner: string,
	repo: string,
) {
	return useQuery<GitHubRepoIssueType[]>({
		queryKey: ["tasks", "repo-meta", "issue-types", login, owner, repo],
		queryFn: () => listGithubIssueTypes(login, owner, repo),
		enabled,
		staleTime: STALE,
	});
}
