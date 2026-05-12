import { openUrl } from "@tauri-apps/plugin-opener";
import {
	Bookmark,
	CircleSlash,
	GitMerge,
	GitPullRequest,
	Link2,
	Link2Off,
	Lock,
	Pin,
	PinOff,
	Tag,
	Unlock,
	UserMinus,
	UserPlus,
} from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { CachedAvatar } from "@/components/cached-avatar";
import { LazyStreamdown } from "@/components/streamdown-loader";
import type {
	GitHubTimelineActor,
	GitHubTimelineEvent,
	GitHubTimelineReference,
} from "@/lib/api";

function relativeShort(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const diff = Math.max(0, Date.now() - date.getTime());
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return date.toLocaleDateString();
}

export type IssueBodyEntry = {
	kind: "issueBody";
	body: string;
	author?: GitHubTimelineActor | null;
	createdAt?: string | null;
	url?: string | null;
};

export type ActivityEntry = IssueBodyEntry | GitHubTimelineEvent;

export function TimelineEntry({ entry }: { entry: ActivityEntry }) {
	if (entry.kind === "issueBody") {
		return (
			<CardEntry
				actor={entry.author}
				createdAt={entry.createdAt ?? ""}
				url={entry.url ?? null}
				body={entry.body}
				emptyText="No description provided."
			/>
		);
	}
	if (entry.kind === "comment") {
		return (
			<CardEntry
				actor={entry.actor}
				createdAt={entry.createdAt}
				url={entry.url}
				body={entry.body}
				emptyText="No content."
			/>
		);
	}
	return <CompactEntry event={entry} />;
}

function CardEntry({
	actor,
	createdAt,
	url,
	body,
	emptyText,
}: {
	actor?: GitHubTimelineActor | null;
	createdAt: string;
	url: string | null;
	body: string;
	emptyText: string;
}) {
	const trimmed = body.trim();
	const login = actor?.login ?? "ghost";
	return (
		<li className="rounded-md border border-border/40 bg-muted/20">
			<div className="flex items-center gap-2 border-border/40 border-b px-3 py-1.5 text-[12px]">
				<CachedAvatar
					size="sm"
					className="size-5 shrink-0"
					src={actor?.avatarUrl ?? undefined}
					alt={login}
					fallback={login.charAt(0).toUpperCase()}
					fallbackClassName="bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
				/>
				<span className="truncate font-medium text-foreground/90">{login}</span>
				{createdAt ? (
					<span className="text-muted-foreground/70">
						{relativeShort(createdAt)}
					</span>
				) : null}
				{url ? (
					<button
						type="button"
						onClick={() => void openUrl(url)}
						className="ml-auto cursor-pointer text-[11px] text-muted-foreground/70 hover:text-foreground"
					>
						Open
					</button>
				) : null}
			</div>
			<div className="px-3 py-2 text-[13px] leading-6 text-foreground/90">
				{trimmed ? (
					<Suspense
						fallback={
							<div className="whitespace-pre-wrap break-words">{trimmed}</div>
						}
					>
						<LazyStreamdown
							className="conversation-streamdown conversation-markdown break-words"
							mode="static"
						>
							{trimmed}
						</LazyStreamdown>
					</Suspense>
				) : (
					<span className="text-muted-foreground italic">{emptyText}</span>
				)}
			</div>
		</li>
	);
}

function CompactEntry({ event }: { event: GitHubTimelineEvent }) {
	const { icon, body } = renderEventBody(event);
	const login = event.actor?.login ?? "someone";
	return (
		<li className="flex items-start gap-2 px-1 py-0.5 text-[12px] text-muted-foreground">
			<span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
				{icon}
			</span>
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
				<CachedAvatar
					size="sm"
					className="size-4 shrink-0 self-center"
					src={event.actor?.avatarUrl ?? undefined}
					alt={login}
					fallback={login.charAt(0).toUpperCase()}
					fallbackClassName="bg-muted text-[9px] font-semibold uppercase text-muted-foreground"
				/>
				<span className="font-medium text-foreground/85">{login}</span>
				<span>{body}</span>
				<span className="text-muted-foreground/60">
					· {relativeShort(event.createdAt)}
				</span>
			</div>
		</li>
	);
}

function renderEventBody(event: GitHubTimelineEvent): {
	icon: ReactNode;
	body: ReactNode;
} {
	const ICON_CLS = "size-[10px]";
	switch (event.kind) {
		case "assigned":
			return {
				icon: <UserPlus className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						assigned{" "}
						<span className="font-medium text-foreground/85">
							{event.assigneeLogin}
						</span>
					</>
				),
			};
		case "unassigned":
			return {
				icon: <UserMinus className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						unassigned{" "}
						<span className="font-medium text-foreground/85">
							{event.assigneeLogin}
						</span>
					</>
				),
			};
		case "labeled":
			return {
				icon: <Tag className={ICON_CLS} strokeWidth={2} />,
				body: <>added label {labelChip(event.labelName, event.labelColor)}</>,
			};
		case "unlabeled":
			return {
				icon: <Tag className={ICON_CLS} strokeWidth={2} />,
				body: <>removed label {labelChip(event.labelName, event.labelColor)}</>,
			};
		case "closed":
			return {
				icon: <CircleSlash className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						closed this
						{event.stateReason ? (
							<span className="text-muted-foreground/70">
								{" "}
								as {event.stateReason.replace(/_/g, " ")}
							</span>
						) : null}
					</>
				),
			};
		case "reopened":
			return {
				icon: <GitPullRequest className={ICON_CLS} strokeWidth={2} />,
				body: <>reopened this</>,
			};
		case "renamed":
			return {
				icon: <Bookmark className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						renamed from{" "}
						<span className="line-through text-muted-foreground/70">
							{event.from}
						</span>{" "}
						to{" "}
						<span className="font-medium text-foreground/85">{event.to}</span>
					</>
				),
			};
		case "milestoned":
			return {
				icon: <Bookmark className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						added to milestone{" "}
						<span className="font-medium text-foreground/85">
							{event.milestoneTitle}
						</span>
					</>
				),
			};
		case "demilestoned":
			return {
				icon: <Bookmark className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						removed from milestone{" "}
						<span className="font-medium text-foreground/85">
							{event.milestoneTitle}
						</span>
					</>
				),
			};
		case "crossReferenced":
			return {
				icon: <Link2 className={ICON_CLS} strokeWidth={2} />,
				body: <>mentioned this in {referenceLink(event.source)}</>,
			};
		case "referenced":
			return {
				icon: <GitMerge className={ICON_CLS} strokeWidth={2} />,
				body: <>referenced this in {referenceLink(event.subject)}</>,
			};
		case "locked":
			return {
				icon: <Lock className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						locked this
						{event.lockReason ? (
							<span className="text-muted-foreground/70">
								{" "}
								as {event.lockReason}
							</span>
						) : null}
					</>
				),
			};
		case "unlocked":
			return {
				icon: <Unlock className={ICON_CLS} strokeWidth={2} />,
				body: <>unlocked this</>,
			};
		case "pinned":
			return {
				icon: <Pin className={ICON_CLS} strokeWidth={2} />,
				body: <>pinned this</>,
			};
		case "unpinned":
			return {
				icon: <PinOff className={ICON_CLS} strokeWidth={2} />,
				body: <>unpinned this</>,
			};
		case "transferred":
			return {
				icon: <Link2 className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						transferred this
						{event.fromRepoWithOwner ? (
							<>
								{" "}
								from{" "}
								<span className="font-medium text-foreground/85">
									{event.fromRepoWithOwner}
								</span>
							</>
						) : null}
					</>
				),
			};
		case "markedAsDuplicate":
			return {
				icon: <Link2 className={ICON_CLS} strokeWidth={2} />,
				body: (
					<>
						marked this as duplicate
						{event.duplicate ? <> of {referenceLink(event.duplicate)}</> : null}
					</>
				),
			};
		case "unmarkedAsDuplicate":
			return {
				icon: <Link2Off className={ICON_CLS} strokeWidth={2} />,
				body: <>removed the duplicate mark</>,
			};
		case "connected":
			return {
				icon: <Link2 className={ICON_CLS} strokeWidth={2} />,
				body: <>linked {referenceLink(event.subject)}</>,
			};
		case "disconnected":
			return {
				icon: <Link2Off className={ICON_CLS} strokeWidth={2} />,
				body: <>unlinked {referenceLink(event.subject)}</>,
			};
		// `comment` is handled by the card branch.
		case "comment":
			return { icon: null, body: null };
	}
}

function labelChip(name: string, color?: string | null) {
	const hex = color ? `#${color}` : null;
	return (
		<span
			className="ml-0.5 inline-block rounded-full border px-1.5 py-[1px] align-middle text-[10px] font-medium leading-[14px]"
			style={
				hex
					? {
							color: hex,
							borderColor: `color-mix(in oklab, ${hex} 40%, transparent)`,
							backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${hex} 22%, transparent), color-mix(in oklab, ${hex} 6%, transparent))`,
						}
					: { color: "var(--foreground)" }
			}
		>
			{name}
		</span>
	);
}

function referenceLink(ref: GitHubTimelineReference) {
	return (
		<button
			type="button"
			onClick={() => void openUrl(ref.url)}
			className="cursor-pointer font-medium text-foreground/85 hover:underline"
		>
			{ref.repoWithOwner}#{ref.number}
		</button>
	);
}
