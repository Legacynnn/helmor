import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	ArrowLeft,
	Check,
	Clock3,
	Copy,
	ExternalLink,
	Pencil,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getInboxItemDetail,
	type InboxItemDetail,
	type InboxItemDetailRef,
	type LinearIssueDetail,
	linearGetTask,
	type RepositoryCreateOption,
	tasksFindWorkspaceForLinearTask,
	tasksFindWorkspaceForPrUrl,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "../types";
import { EditableBody } from "./editable-body";
import { EditableTitle } from "./editable-title";
import { IssueActivity } from "./issue-activity";
import { IssueSidebar } from "./issue-sidebar";
import { StatusBadgeMenu } from "./status-badge-menu";

function parseGitHubOwnerRepo(
	remoteUrl: string | null | undefined,
): string | null {
	if (!remoteUrl) return null;
	const trimmed = remoteUrl.trim().replace(/\.git$/, "");
	const m =
		trimmed.match(/^git@github\.com:(.+)$/) ??
		trimmed.match(/^https:\/\/github\.com\/(.+)$/) ??
		trimmed.match(/^ssh:\/\/git@github\.com\/(.+)$/);
	if (!m) return null;
	const parts = m[1].split("/");
	if (parts.length < 2 || !parts[0] || !parts[1]) return null;
	return `${parts[0]}/${parts[1]}`;
}

function buildDetailRef(
	item: TaskListItem,
	repo: RepositoryCreateOption | null,
): InboxItemDetailRef | null {
	if (item.source !== "github-pr" && item.source !== "github-issue")
		return null;
	if (!repo?.forgeLogin || !repo.remoteUrl) return null;
	const ownerRepo = parseGitHubOwnerRepo(repo.remoteUrl);
	if (!ownerRepo) return null;
	const number = item.displayId.replace(/^#/, "");
	if (!number) return null;
	return {
		provider: "github",
		login: repo.forgeLogin,
		host: "github.com",
		source: item.source === "github-pr" ? "github_pr" : "github_issue",
		externalId: `${ownerRepo}#${number}`,
	};
}

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const minutes = Math.max(1, Math.round((Date.now() - then) / 60_000));
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

function extractBody(detail: InboxItemDetail | null): string {
	if (!detail) return "";
	if (detail.type === "github_issue") return detail.data.body ?? "";
	if (detail.type === "github_pr") return detail.data.body ?? "";
	return "";
}

export function DetailScreen({
	item,
	repo,
	onClose,
	onOpenWorkspace,
	onStartWorkspace,
}: {
	item: TaskListItem;
	repo: RepositoryCreateOption | null;
	onClose: () => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onStartWorkspace: (item: TaskListItem) => void;
}) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented) {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	const [editSignal, setEditSignal] = useState(0);

	const linearQuery = useQuery<LinearIssueDetail>({
		queryKey: ["tasks", "detail", "linear", item.key],
		queryFn: () => linearGetTask(item.key),
		enabled: item.source === "linear",
		staleTime: 5 * 60_000,
	});

	const detailRef = buildDetailRef(item, repo);
	const ghQuery = useQuery<InboxItemDetail | null>({
		queryKey: detailRef
			? [
					"tasks",
					"detail",
					"github",
					detailRef.provider,
					detailRef.login,
					detailRef.source,
					detailRef.externalId,
				]
			: ["tasks", "detail", "github", "disabled", item.key],
		queryFn: () => getInboxItemDetail(detailRef as InboxItemDetailRef),
		enabled: !!detailRef,
		staleTime: 60_000,
	});

	const linked = useQuery<string | null>({
		queryKey: ["tasks", "linkedWorkspace", item.source, item.key],
		queryFn: async () => {
			if (item.source === "linear") {
				return await tasksFindWorkspaceForLinearTask(item.key);
			}
			if (item.source === "github-pr") {
				return await tasksFindWorkspaceForPrUrl(item.url);
			}
			return null;
		},
		staleTime: 30_000,
	});

	const isLinear = item.source === "linear";
	const isLoading = isLinear ? linearQuery.isLoading : ghQuery.isLoading;
	const error = isLinear ? linearQuery.error : detailRef ? ghQuery.error : null;
	const body = isLinear
		? (linearQuery.data?.description ?? "")
		: extractBody(ghQuery.data ?? null);

	const markdownBody = body.trim() || "No description provided.";
	const kindLabel =
		item.source === "github-pr"
			? "pull request"
			: item.source === "github-issue"
				? "issue"
				: "task";

	return (
		<article className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-4 [contain:content] [scrollbar-gutter:stable]">
			<header className="shrink-0 py-1.5">
				<div className="flex min-w-0 items-center justify-between gap-4">
					<div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClose}
							className="h-7 cursor-pointer gap-1 px-2"
						>
							<ArrowLeft className="size-[13px]" strokeWidth={1.8} />
							Back
						</Button>
						<StatusBadgeMenu
							status={item.status}
							state={
								ghQuery.data?.type === "github_issue"
									? ghQuery.data.data.state
									: item.status.key.toLowerCase()
							}
							updatedAt={
								ghQuery.data?.type === "github_issue"
									? (ghQuery.data.data.updatedAt ?? null)
									: null
							}
							detailRef={detailRef}
							detailQueryKey={
								detailRef
									? [
											"tasks",
											"detail",
											"github",
											detailRef.provider,
											detailRef.login,
											detailRef.source,
											detailRef.externalId,
										]
									: ["tasks", "detail", "github", "disabled", item.key]
							}
							editable={item.source === "github-issue" && !!detailRef}
						/>
						<span className="font-mono text-[12px] text-muted-foreground">
							{item.displayId}
						</span>
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							{kindLabel}
						</span>
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<Clock3 className="size-[13px]" strokeWidth={1.8} />
							Updated {relativeTime(item.updatedAt)}
						</span>
					</div>
					<DetailActions
						item={item}
						markdownBody={markdownBody}
						copyDisabled={isLoading || Boolean(error)}
						linkedWorkspaceId={linked.data ?? null}
						onOpenWorkspace={onOpenWorkspace}
						onStartWorkspace={onStartWorkspace}
						canEdit={item.source === "github-issue" && !!detailRef}
						onEdit={() => setEditSignal((n) => n + 1)}
					/>
				</div>
				<EditableTitle
					title={
						ghQuery.data?.type === "github_issue"
							? ghQuery.data.data.title
							: item.title
					}
					updatedAt={
						ghQuery.data?.type === "github_issue"
							? (ghQuery.data.data.updatedAt ?? null)
							: null
					}
					detailRef={detailRef}
					detailQueryKey={
						detailRef
							? [
									"tasks",
									"detail",
									"github",
									detailRef.provider,
									detailRef.login,
									detailRef.source,
									detailRef.externalId,
								]
							: ["tasks", "detail", "github", "disabled", item.key]
					}
					editable={item.source === "github-issue" && !!detailRef}
					editSignal={editSignal}
				/>
			</header>
			<div
				className={cn(
					"min-h-0 flex-1",
					isLoading || error ? "flex items-center justify-center" : "py-4",
				)}
			>
				{isLoading ? (
					<HelmorLogoAnimated size={48} className="opacity-80" />
				) : error ? (
					<div className="text-center text-[13px] text-muted-foreground">
						{error instanceof Error ? error.message : String(error)}
					</div>
				) : item.source === "github-issue" && detailRef ? (
					<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
						<div className="flex min-w-0 flex-col gap-6">
							<EditableBody
								body={body}
								updatedAt={
									ghQuery.data?.type === "github_issue"
										? (ghQuery.data.data.updatedAt ?? null)
										: null
								}
								detailRef={detailRef}
								detailQueryKey={[
									"tasks",
									"detail",
									"github",
									detailRef.provider,
									detailRef.login,
									detailRef.source,
									detailRef.externalId,
								]}
								editable
								editSignal={editSignal}
							/>
							<IssueActivity
								login={detailRef.login}
								externalId={detailRef.externalId}
							/>
						</div>
						{ghQuery.data?.type === "github_issue" ? (
							<IssueSidebar
								issue={ghQuery.data.data}
								repo={
									detailRef && repo?.remoteUrl
										? (() => {
												const ownerRepo = parseGitHubOwnerRepo(repo.remoteUrl);
												if (!ownerRepo) return null;
												const [owner, name] = ownerRepo.split("/");
												return {
													login: detailRef.login,
													owner,
													repo: name,
												};
											})()
										: null
								}
								externalId={detailRef.externalId}
								onOpenWorkspace={onOpenWorkspace}
							/>
						) : null}
					</div>
				) : (
					<MarkdownBody body={markdownBody} />
				)}
			</div>
		</article>
	);
}

function DetailActions({
	item,
	markdownBody,
	copyDisabled,
	linkedWorkspaceId,
	onOpenWorkspace,
	onStartWorkspace,
	canEdit,
	onEdit,
}: {
	item: TaskListItem;
	markdownBody: string;
	copyDisabled: boolean;
	linkedWorkspaceId: string | null;
	onOpenWorkspace: (workspaceId: string) => void;
	onStartWorkspace: (item: TaskListItem) => void;
	canEdit: boolean;
	onEdit: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const handleCopy = useCallback(() => {
		if (copyDisabled || !navigator.clipboard?.writeText) return;
		void navigator.clipboard.writeText(markdownBody).then(() => {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		});
	}, [copyDisabled, markdownBody]);

	return (
		<div className="flex shrink-0 items-center gap-1">
			{linkedWorkspaceId ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onOpenWorkspace(linkedWorkspaceId)}
					className="h-7 cursor-pointer"
				>
					Open workspace
				</Button>
			) : null}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => onStartWorkspace(item)}
				className="h-7 cursor-pointer"
			>
				Start workspace
			</Button>
			{canEdit ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Edit issue"
							onClick={onEdit}
							className="size-7 cursor-pointer rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
						>
							<Pencil className="size-[13px]" strokeWidth={1.8} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">Edit</TooltipContent>
				</Tooltip>
			) : null}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Open externally"
						onClick={() => void openUrl(item.url)}
						className="size-7 cursor-pointer rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
					>
						<ExternalLink className="size-[13px]" strokeWidth={1.8} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Open externally</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Copy markdown"
						disabled={copyDisabled}
						onClick={handleCopy}
						className="size-7 cursor-pointer rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
					>
						{copied ? (
							<Check className="size-[13px]" strokeWidth={1.8} />
						) : (
							<Copy className="size-[13px]" strokeWidth={1.8} />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					{copied ? "Copied" : "Copy markdown"}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function MarkdownBody({ body }: { body: string }) {
	return (
		<div className="conversation-markdown max-w-3xl break-words text-[13px] leading-6 text-foreground after:block after:h-24 after:content-['']">
			<Suspense
				fallback={
					<div className="conversation-streamdown whitespace-pre-wrap break-words">
						{body}
					</div>
				}
			>
				<LazyStreamdown className="conversation-streamdown" mode="static">
					{body}
				</LazyStreamdown>
			</Suspense>
		</div>
	);
}
