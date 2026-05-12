import { Settings2 } from "lucide-react";
import { CachedAvatar } from "@/components/cached-avatar";
import { Button } from "@/components/ui/button";
import type {
	GitHubIssueDetail,
	GitHubLabelRef,
	GitHubUserRef,
} from "@/lib/api";
import {
	useSetIssueAssignees,
	useSetIssueLabels,
	useSetIssueMilestone,
	useSetIssueType,
} from "../hooks/use-issue-metadata-mutations";
import { issueTypeSwatch } from "../lib/issue-type-color";
import { LinkedPrRow } from "./linked-pr-row";
import {
	AssigneesPicker,
	IssueTypePicker,
	LabelsPicker,
	MilestonePicker,
} from "./pickers";
import { SidebarSection } from "./sidebar-section";

type RepoCoord = { login: string; owner: string; repo: string };

export function IssueSidebar({
	issue,
	repo,
	externalId,
	onOpenWorkspace,
}: {
	issue: GitHubIssueDetail;
	repo: RepoCoord | null;
	externalId: string;
	onOpenWorkspace?: (workspaceId: string) => void;
}) {
	const canMutate = repo !== null;
	const setAssignees = useSetIssueAssignees(repo?.login ?? "", externalId);
	const setLabels = useSetIssueLabels(repo?.login ?? "", externalId);
	const setMilestone = useSetIssueMilestone(repo?.login ?? "", externalId);
	const setType = useSetIssueType(repo?.login ?? "", externalId);

	return (
		<aside className="flex flex-col text-[13px]">
			<SidebarSection
				title="Assignees"
				count={issue.assignees.length}
				isPending={setAssignees.isPending}
				editTrigger={
					canMutate && repo ? (
						<AssigneesPicker
							trigger={editIconButton("Edit assignees")}
							issue={issue}
							repo={repo}
							onChange={(logins) => setAssignees.mutate(logins)}
						/>
					) : undefined
				}
			>
				{issue.assignees.length === 0 ? (
					<EmptyText>No one assigned</EmptyText>
				) : (
					<ul className="flex flex-col gap-1.5">
						{issue.assignees.map((user) => (
							<AssigneeRow key={user.login} user={user} />
						))}
					</ul>
				)}
			</SidebarSection>

			<SidebarSection
				title="Labels"
				count={issue.labels.length}
				isPending={setLabels.isPending}
				editTrigger={
					canMutate && repo ? (
						<LabelsPicker
							trigger={editIconButton("Edit labels")}
							issue={issue}
							repo={repo}
							onChange={(names) => setLabels.mutate(names)}
						/>
					) : undefined
				}
			>
				{issue.labels.length === 0 ? (
					<EmptyText>No labels</EmptyText>
				) : (
					<div className="flex flex-wrap gap-1">
						{issue.labels.map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
					</div>
				)}
			</SidebarSection>

			<SidebarSection
				title="Type"
				isPending={setType.isPending}
				editTrigger={
					canMutate && repo ? (
						<IssueTypePicker
							trigger={editIconButton("Edit type")}
							issue={issue}
							repo={repo}
							onChange={(id) => setType.mutate(id)}
						/>
					) : undefined
				}
			>
				{issue.issueType ? (
					(() => {
						const color = issueTypeSwatch(issue.issueType.color);
						return (
							<span
								className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
								style={{
									color,
									borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
									backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${color} 26%, transparent), color-mix(in oklab, ${color} 8%, transparent))`,
									boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 12%, transparent), 0 0 10px color-mix(in oklab, ${color} 22%, transparent)`,
								}}
							>
								<span
									className="size-1.5 shrink-0 rounded-full"
									style={{
										backgroundColor: color,
										boxShadow: `0 0 6px color-mix(in oklab, ${color} 70%, transparent)`,
									}}
								/>
								<span className="truncate">{issue.issueType.name}</span>
							</span>
						);
					})()
				) : (
					<EmptyText>No type</EmptyText>
				)}
			</SidebarSection>

			<SidebarSection
				title="Milestone"
				isPending={setMilestone.isPending}
				editTrigger={
					canMutate && repo ? (
						<MilestonePicker
							trigger={editIconButton("Edit milestone")}
							issue={issue}
							repo={repo}
							onChange={(n) => setMilestone.mutate(n)}
						/>
					) : undefined
				}
			>
				{issue.milestone ? (
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground/90">
							{issue.milestone.title}
						</span>
						{issue.milestone.dueOn ? (
							<span className="text-[11px] text-muted-foreground">
								Due {new Date(issue.milestone.dueOn).toLocaleDateString()}
							</span>
						) : null}
					</div>
				) : (
					<EmptyText>No milestone</EmptyText>
				)}
			</SidebarSection>

			<SidebarSection
				title="Linked PRs"
				count={issue.linkedPullRequests.length}
			>
				{issue.linkedPullRequests.length === 0 ? (
					<EmptyText>No linked pull requests</EmptyText>
				) : (
					<ul className="flex flex-col gap-1.5">
						{issue.linkedPullRequests.map((pr) => (
							<LinkedPrRow
								key={pr.url}
								pr={pr}
								onOpenWorkspace={onOpenWorkspace}
							/>
						))}
					</ul>
				)}
			</SidebarSection>

			{issue.participants.length > 0 ? (
				<SidebarSection title="Participants" count={issue.participants.length}>
					<div className="flex flex-wrap gap-1">
						{issue.participants.map((user) => (
							<CachedAvatar
								key={user.login}
								size="sm"
								className="size-5 shrink-0"
								src={user.avatarUrl ?? undefined}
								alt={user.login}
								fallback={user.login.charAt(0).toUpperCase()}
								fallbackClassName="bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
							/>
						))}
					</div>
				</SidebarSection>
			) : null}
		</aside>
	);
}

// Radix's PopoverTrigger.asChild uses Slot to forward ref/onClick to the
// trigger element. The shadcn Button forwards refs, but a wrapper function
// component would swallow them — so build the Button inline rather than
// returning it from a wrapper.
function editIconButton(label: string) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={label}
			className="size-5 cursor-pointer rounded-md text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground"
		>
			<Settings2 className="size-[11px]" strokeWidth={1.8} />
		</Button>
	);
}

function AssigneeRow({ user }: { user: GitHubUserRef }) {
	return (
		<li className="flex items-center gap-2">
			<CachedAvatar
				size="sm"
				className="size-5 shrink-0"
				src={user.avatarUrl ?? undefined}
				alt={user.login}
				fallback={user.login.charAt(0).toUpperCase()}
				fallbackClassName="bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
			/>
			<span className="truncate font-medium text-foreground/90">
				{user.name ?? user.login}
			</span>
			{user.name ? (
				<span className="truncate text-[11px] text-muted-foreground/80">
					@{user.login}
				</span>
			) : null}
		</li>
	);
}

function LabelChip({ label }: { label: GitHubLabelRef }) {
	const color = label.color ? `#${label.color}` : null;
	return (
		<span
			title={label.description ?? undefined}
			className="max-w-28 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium"
			style={
				color
					? {
							color,
							borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
							backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${color} 22%, transparent), color-mix(in oklab, ${color} 6%, transparent))`,
						}
					: undefined
			}
		>
			{label.name}
		</span>
	);
}

function EmptyText({ children }: { children: string }) {
	return (
		<span className="text-[12px] text-muted-foreground/70">{children}</span>
	);
}
