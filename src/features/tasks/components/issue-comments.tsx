import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Suspense, useState } from "react";
import { CachedAvatar } from "@/components/cached-avatar";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import {
	createGithubIssueComment,
	listGithubIssueComments,
	type PrCommentInfo,
} from "@/lib/api";

function issueCommentsKey(login: string, externalId: string) {
	return ["tasks", "issue-comments", login, externalId] as const;
}

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

export function IssueComments({
	login,
	externalId,
}: {
	login: string;
	externalId: string;
}) {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: issueCommentsKey(login, externalId),
		queryFn: () => listGithubIssueComments(login, externalId),
		staleTime: 30_000,
	});

	const mutation = useMutation({
		mutationFn: (body: string) =>
			createGithubIssueComment(login, externalId, body),
		onSuccess: (created) => {
			queryClient.setQueryData<PrCommentInfo[]>(
				issueCommentsKey(login, externalId),
				(previous) => [...(previous ?? []), created],
			);
		},
	});

	const comments = query.data ?? [];

	return (
		<section aria-label="Issue comments" className="flex flex-col">
			<header className="mb-2 flex items-baseline gap-2">
				<h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
					Comments
				</h2>
				{comments.length > 0 ? (
					<span className="rounded-sm bg-foreground/10 px-1 text-[11px] font-medium tabular-nums text-foreground/80">
						{comments.length}
					</span>
				) : null}
			</header>

			{query.isLoading ? (
				<div className="flex items-center justify-center py-4">
					<HelmorLogoAnimated size={28} className="opacity-70" />
				</div>
			) : query.error ? (
				<div className="py-2 text-[12px] text-destructive">
					{query.error instanceof Error
						? query.error.message
						: String(query.error)}
				</div>
			) : comments.length === 0 ? (
				<div className="py-2 text-[12px] text-muted-foreground">
					No comments yet.
				</div>
			) : (
				<ul className="flex flex-col gap-3">
					{comments.map((comment) => (
						<CommentRow key={comment.id} comment={comment} />
					))}
				</ul>
			)}

			<Composer
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

function CommentRow({ comment }: { comment: PrCommentInfo }) {
	const body = comment.body.trim();
	return (
		<li className="rounded-md border border-border/40 bg-muted/20">
			<div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px]">
				<CachedAvatar
					size="sm"
					className="size-5 shrink-0"
					src={comment.authorAvatarUrl}
					alt={comment.authorLogin}
					fallback={comment.authorLogin.charAt(0).toUpperCase()}
					fallbackClassName="bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
				/>
				<span className="truncate font-medium text-foreground/90">
					{comment.authorLogin}
				</span>
				<span className="text-muted-foreground/70">
					{relativeShort(comment.createdAt)}
				</span>
				<button
					type="button"
					onClick={() => void openUrl(comment.url)}
					className="ml-auto cursor-pointer text-[11px] text-muted-foreground/70 hover:text-foreground"
				>
					Open
				</button>
			</div>
			<div className="px-3 py-2 text-[13px] leading-6 text-foreground/90">
				{body ? (
					<Suspense
						fallback={
							<div className="whitespace-pre-wrap break-words">{body}</div>
						}
					>
						<LazyStreamdown
							className="conversation-streamdown conversation-markdown break-words"
							mode="static"
						>
							{body}
						</LazyStreamdown>
					</Suspense>
				) : (
					<span className="italic text-muted-foreground">No content.</span>
				)}
			</div>
		</li>
	);
}

function Composer({
	isSubmitting,
	error,
	onSubmit,
}: {
	isSubmitting: boolean;
	error: string | null;
	onSubmit: (body: string) => Promise<unknown>;
}) {
	const [draft, setDraft] = useState("");
	const trimmed = draft.trim();
	const disabled = isSubmitting || trimmed.length === 0;

	return (
		<form
			className="mt-3 flex flex-col gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (disabled) return;
				void onSubmit(trimmed).then(() => setDraft(""));
			}}
		>
			<textarea
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				placeholder="Write a comment…"
				rows={3}
				disabled={isSubmitting}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						if (disabled) return;
						void onSubmit(trimmed).then(() => setDraft(""));
					}
				}}
				className="min-h-[72px] w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] leading-5 outline-none focus:border-foreground/40"
			/>
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] text-muted-foreground/80">
					{error ? (
						<span className="text-destructive">{error}</span>
					) : (
						<>Cmd/Ctrl+Enter to submit</>
					)}
				</span>
				<Button
					type="submit"
					size="sm"
					disabled={disabled}
					className="h-7 cursor-pointer"
				>
					{isSubmitting ? "Posting…" : "Comment"}
				</Button>
			</div>
		</form>
	);
}
