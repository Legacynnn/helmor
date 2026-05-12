import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CachedAvatar } from "@/components/cached-avatar";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import {
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { CommandPopoverContent } from "@/components/ui/command-popover";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import type {
	GitHubAssignableUser,
	GitHubIssueDetail,
	GitHubRepoIssueType,
	GitHubRepoLabel,
	GitHubRepoMilestone,
} from "@/lib/api";
import {
	useAssignableUsers,
	useIssueTypes,
	useMilestones,
	useRepoLabels,
} from "../hooks/use-repo-metadata";
import { issueTypeSwatch } from "../lib/issue-type-color";

type RepoCoord = { login: string; owner: string; repo: string };

export function AssigneesPicker({
	trigger,
	issue,
	repo,
	onChange,
}: {
	trigger: ReactNode;
	issue: GitHubIssueDetail;
	repo: RepoCoord;
	onChange: (logins: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const users = useAssignableUsers(open, repo.login, repo.owner, repo.repo);
	const selected = new Set(issue.assignees.map((u) => u.login));
	const toggle = (login: string) => {
		const next = new Set(selected);
		if (next.has(login)) {
			next.delete(login);
		} else {
			next.add(login);
		}
		onChange([...next]);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<CommandPopoverContent align="end" className="w-64">
				<CommandInput placeholder="Search people…" />
				<CommandList>
					{users.isLoading ? (
						<div className="flex items-center justify-center px-2 py-3">
							<HelmorLogoAnimated size={20} className="opacity-70" />
						</div>
					) : (
						<CommandEmpty>No matches.</CommandEmpty>
					)}
					<CommandGroup>
						{(users.data ?? []).map((u) => (
							<UserRow
								key={u.login}
								user={u}
								selected={selected.has(u.login)}
								onToggle={() => toggle(u.login)}
							/>
						))}
					</CommandGroup>
				</CommandList>
			</CommandPopoverContent>
		</Popover>
	);
}

function UserRow({
	user,
	selected,
	onToggle,
}: {
	user: GitHubAssignableUser;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<CommandItem
			value={`${user.login} ${user.name ?? ""}`}
			onSelect={onToggle}
			className="flex cursor-pointer items-center gap-2"
		>
			<CachedAvatar
				size="sm"
				className="size-5 shrink-0"
				src={user.avatarUrl ?? undefined}
				alt={user.login}
				fallback={user.login.charAt(0).toUpperCase()}
				fallbackClassName="bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
			/>
			<span className="min-w-0 flex-1 truncate text-[12px]">
				<span className="font-medium text-foreground/90">
					{user.name ?? user.login}
				</span>
				{user.name ? (
					<span className="ml-1 text-muted-foreground/70">@{user.login}</span>
				) : null}
			</span>
			{selected ? <Check className="size-3.5 text-foreground/80" /> : null}
		</CommandItem>
	);
}

export function LabelsPicker({
	trigger,
	issue,
	repo,
	onChange,
}: {
	trigger: ReactNode;
	issue: GitHubIssueDetail;
	repo: RepoCoord;
	onChange: (names: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const labels = useRepoLabels(open, repo.login, repo.owner, repo.repo);
	const selected = new Set(issue.labels.map((l) => l.name));
	const toggle = (name: string) => {
		const next = new Set(selected);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		onChange([...next]);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<CommandPopoverContent align="end" className="w-64">
				<CommandInput placeholder="Search labels…" />
				<CommandList>
					{labels.isLoading ? (
						<div className="flex items-center justify-center px-2 py-3">
							<HelmorLogoAnimated size={20} className="opacity-70" />
						</div>
					) : (
						<CommandEmpty>No matches.</CommandEmpty>
					)}
					<CommandGroup>
						{(labels.data ?? []).map((l) => (
							<LabelRow
								key={l.name}
								label={l}
								selected={selected.has(l.name)}
								onToggle={() => toggle(l.name)}
							/>
						))}
					</CommandGroup>
				</CommandList>
			</CommandPopoverContent>
		</Popover>
	);
}

function LabelRow({
	label,
	selected,
	onToggle,
}: {
	label: GitHubRepoLabel;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<CommandItem
			value={`${label.name} ${label.description ?? ""}`}
			onSelect={onToggle}
			className="flex cursor-pointer items-center gap-2"
		>
			<span
				className="size-2.5 shrink-0 rounded-full"
				style={{
					backgroundColor: label.color ? `#${label.color}` : "transparent",
					border: label.color ? "none" : "1px solid currentColor",
				}}
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate text-[12px]">
				<span className="font-medium text-foreground/90">{label.name}</span>
				{label.description ? (
					<span className="ml-1 text-muted-foreground/70">
						{label.description}
					</span>
				) : null}
			</span>
			{selected ? <Check className="size-3.5 text-foreground/80" /> : null}
		</CommandItem>
	);
}

export function MilestonePicker({
	trigger,
	issue,
	repo,
	onChange,
}: {
	trigger: ReactNode;
	issue: GitHubIssueDetail;
	repo: RepoCoord;
	onChange: (milestoneNumber: number | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const milestones = useMilestones(open, repo.login, repo.owner, repo.repo);
	// `milestone.id` on the issue is a GraphQL node id; we match on
	// title for the visual "selected" state since the REST list uses
	// REST numeric ids.
	const selectedTitle = issue.milestone?.title ?? null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<CommandPopoverContent align="end" className="w-64">
				<CommandInput placeholder="Search milestones…" />
				<CommandList>
					{milestones.isLoading ? (
						<div className="flex items-center justify-center px-2 py-3">
							<HelmorLogoAnimated size={20} className="opacity-70" />
						</div>
					) : (
						<CommandEmpty>No matches.</CommandEmpty>
					)}
					<CommandGroup>
						<CommandItem
							value="__none__"
							onSelect={() => onChange(null)}
							className="cursor-pointer text-muted-foreground"
						>
							<span className="flex-1 text-[12px]">No milestone</span>
							{selectedTitle === null ? (
								<Check className="size-3.5 text-foreground/80" />
							) : null}
						</CommandItem>
						{(milestones.data ?? []).map((m) => (
							<MilestoneRow
								key={m.number}
								milestone={m}
								selected={selectedTitle === m.title}
								onSelect={() => onChange(m.number)}
							/>
						))}
					</CommandGroup>
				</CommandList>
			</CommandPopoverContent>
		</Popover>
	);
}

function MilestoneRow({
	milestone,
	selected,
	onSelect,
}: {
	milestone: GitHubRepoMilestone;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<CommandItem
			value={milestone.title}
			onSelect={onSelect}
			className="flex cursor-pointer items-center gap-2"
		>
			<span className="min-w-0 flex-1 truncate text-[12px]">
				<span className="font-medium text-foreground/90">
					{milestone.title}
				</span>
				{milestone.dueOn ? (
					<span className="ml-1 text-muted-foreground/70">
						· due {new Date(milestone.dueOn).toLocaleDateString()}
					</span>
				) : null}
			</span>
			{selected ? <Check className="size-3.5 text-foreground/80" /> : null}
		</CommandItem>
	);
}

export function IssueTypePicker({
	trigger,
	issue,
	repo,
	onChange,
}: {
	trigger: ReactNode;
	issue: GitHubIssueDetail;
	repo: RepoCoord;
	onChange: (typeId: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const types = useIssueTypes(open, repo.login, repo.owner, repo.repo);
	const selectedId = issue.issueType?.id ?? null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<CommandPopoverContent align="end" className="w-56">
				<CommandInput placeholder="Search types…" />
				<CommandList>
					{types.isLoading ? (
						<div className="flex items-center justify-center px-2 py-3">
							<HelmorLogoAnimated size={20} className="opacity-70" />
						</div>
					) : (
						<CommandEmpty>No types defined.</CommandEmpty>
					)}
					<CommandGroup>
						<CommandItem
							value="__none__"
							onSelect={() => onChange(null)}
							className="cursor-pointer text-muted-foreground"
						>
							<span className="flex-1 text-[12px]">No type</span>
							{selectedId === null ? (
								<Check className="size-3.5 text-foreground/80" />
							) : null}
						</CommandItem>
						{(types.data ?? []).map((t) => (
							<IssueTypeRow
								key={t.id}
								type={t}
								selected={selectedId === t.id}
								onSelect={() => onChange(t.id)}
							/>
						))}
					</CommandGroup>
				</CommandList>
			</CommandPopoverContent>
		</Popover>
	);
}

function IssueTypeRow({
	type,
	selected,
	onSelect,
}: {
	type: GitHubRepoIssueType;
	selected: boolean;
	onSelect: () => void;
}) {
	const color = issueTypeSwatch(type.color);
	return (
		<CommandItem
			value={type.name}
			onSelect={onSelect}
			className="flex cursor-pointer items-center gap-2"
		>
			<span
				aria-hidden="true"
				className="size-2 shrink-0 rounded-full"
				style={{
					backgroundColor: color,
					boxShadow: `0 0 6px color-mix(in oklab, ${color} 70%, transparent)`,
				}}
			/>
			<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
				{type.name}
			</span>
			{selected ? <Check className="size-3.5 text-foreground/80" /> : null}
		</CommandItem>
	);
}
