import {
	CheckCircle2,
	ChevronRight,
	CircleDot,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	UserCircle2,
} from "lucide-react";
import { CachedAvatar } from "@/components/cached-avatar";
import { cn } from "@/lib/utils";
import { TaskStatusIcon } from "../status-icon";
import type { TaskListItem } from "../types";

const PRIORITY_LEVELS: Record<NonNullable<TaskListItem["priority"]>, number> = {
	urgent: 4,
	high: 3,
	medium: 2,
	low: 1,
	none: 0,
};

export function GhLeadingIcon({
	source,
	statusKey,
}: {
	source: TaskListItem["source"];
	statusKey: string;
}) {
	if (source === "github-issue") {
		const closed = statusKey === "closed";
		const Icon = closed ? CheckCircle2 : CircleDot;
		return (
			<Icon
				className={cn(
					"size-[15px] shrink-0",
					closed ? "text-[#8957e5]" : "text-[#3fb950]",
				)}
				strokeWidth={2}
				aria-hidden="true"
			/>
		);
	}
	if (source === "github-pr") {
		const Icon =
			statusKey === "merged"
				? GitMerge
				: statusKey === "closed"
					? GitPullRequestClosed
					: statusKey === "draft"
						? GitPullRequestDraft
						: GitPullRequest;
		const tone =
			statusKey === "merged"
				? "text-[#8957e5]"
				: statusKey === "closed"
					? "text-[#f85149]"
					: statusKey === "draft"
						? "text-muted-foreground"
						: "text-[#3fb950]";
		return (
			<Icon
				className={cn("size-[15px] shrink-0", tone)}
				strokeWidth={2}
				aria-hidden="true"
			/>
		);
	}
	return null;
}

function formatShortDate(dateIso: string): string {
	const date = new Date(dateIso);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(date);
}

function PriorityIndicator({
	priority,
}: {
	priority: NonNullable<TaskListItem["priority"]>;
}) {
	const active = PRIORITY_LEVELS[priority];
	return (
		<span
			className="flex h-5 w-5 shrink-0 items-end justify-center gap-[2px] text-muted-foreground/65"
			aria-hidden="true"
			title={priority}
		>
			{[1, 2, 3].map((level) => (
				<span
					key={level}
					className={cn(
						"w-[3px] rounded-full bg-current",
						level === 1 ? "h-1.5" : level === 2 ? "h-2.5" : "h-3.5",
						active >= level ? "opacity-100" : "opacity-25",
						priority === "urgent" && "text-destructive",
					)}
				/>
			))}
		</span>
	);
}

function AssigneeAvatar({ assignee }: { assignee: TaskListItem["assignee"] }) {
	if (!assignee) {
		return (
			<span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground/70">
				<UserCircle2 className="size-5" strokeWidth={1.7} />
			</span>
		);
	}

	const fallback = assignee.login.slice(0, 2).toUpperCase();
	return (
		<CachedAvatar
			src={assignee.avatarUrl}
			alt={assignee.login}
			fallback={fallback}
			className="size-6 shrink-0 rounded-full"
			fallbackClassName="text-[10px]"
		/>
	);
}

export function ItemRow({
	item,
	onSelect,
	isSelected,
}: {
	item: TaskListItem;
	onSelect: (item: TaskListItem) => void;
	isSelected: boolean;
}) {
	const openItem = () => onSelect(item);

	return (
		<div
			role="button"
			tabIndex={0}
			data-selected={isSelected}
			onClick={openItem}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openItem();
				}
			}}
			className="group grid min-h-12 w-full cursor-pointer grid-cols-[1.5rem_4.5rem_minmax(12rem,1fr)_auto_auto] items-center gap-x-1 border-b border-border/35 px-4 py-2 text-left text-[13px] transition-colors hover:bg-muted/35 data-[selected=true]:bg-muted/55"
		>
			<span className="flex size-6 items-center justify-center">
				{item.source === "linear" ? (
					<PriorityIndicator priority={item.priority ?? "none"} />
				) : (
					<GhLeadingIcon source={item.source} statusKey={item.status.key} />
				)}
			</span>
			<span className="truncate font-mono text-[12px] text-muted-foreground">
				{item.displayId}
			</span>
			<div className="flex min-w-0 items-center gap-1.5">
				{item.source === "linear" ? (
					<span aria-label={item.status.label} title={item.status.label}>
						<TaskStatusIcon status={item.status} />
					</span>
				) : null}
				<span className="min-w-0 truncate font-medium text-foreground/90">
					{item.title}
				</span>
				{item.type ? (
					<>
						<span
							aria-hidden="true"
							className="h-3.5 w-px shrink-0 bg-border/70"
						/>
						<span
							className="inline-flex max-w-28 shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
							title={`Type: ${item.type.name}`}
							style={{
								color: item.type.color,
								borderColor: `color-mix(in oklab, ${item.type.color} 45%, transparent)`,
								backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${item.type.color} 26%, transparent), color-mix(in oklab, ${item.type.color} 8%, transparent))`,
								boxShadow: `0 0 0 1px color-mix(in oklab, ${item.type.color} 12%, transparent), 0 0 10px color-mix(in oklab, ${item.type.color} 22%, transparent)`,
							}}
						>
							<span
								className="size-1.5 shrink-0 rounded-full"
								style={{
									backgroundColor: item.type.color,
									boxShadow: `0 0 6px color-mix(in oklab, ${item.type.color} 70%, transparent)`,
								}}
							/>
							<span className="truncate">{item.type.name}</span>
						</span>
					</>
				) : null}
				{item.repo ? (
					<span className="hidden shrink-0 rounded-md border border-border/50 bg-muted/45 px-1.5 py-0.5 text-[10px] text-muted-foreground xl:inline">
						{item.repo.name}
					</span>
				) : null}
			</div>
			<div className="hidden max-w-[17rem] shrink-0 items-center justify-end gap-1.5 lg:flex">
				{item.labels.slice(0, 3).map((label) => (
					<span
						key={label.name}
						className="max-w-28 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium"
						style={{
							color: label.color,
							borderColor: `color-mix(in oklab, ${label.color} 35%, transparent)`,
							backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${label.color} 22%, transparent), color-mix(in oklab, ${label.color} 6%, transparent))`,
						}}
					>
						{label.name}
					</span>
				))}
			</div>
			<span className="flex shrink-0 items-center justify-end gap-2.5 text-[12px] text-muted-foreground">
				<AssigneeAvatar assignee={item.assignee} />
				<span className="min-w-14 text-right">
					{formatShortDate(item.updatedAt)}
				</span>
				<ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
			</span>
		</div>
	);
}
