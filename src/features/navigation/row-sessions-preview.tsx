import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, SquareTerminal } from "lucide-react";
import { memo, useMemo } from "react";
import type { WorkspaceSessionSummary } from "@/lib/api";
import { workspaceSessionsQueryOptions } from "@/lib/query-client";
import { useBusySessionIds } from "@/lib/session-run-state-context";
import {
	readSessionThread,
	sessionThreadCacheKey,
} from "@/lib/session-thread-cache";
import { cn } from "@/lib/utils";
import { extractLiveActivity } from "./workspace-hover-card";

/** First non-empty text/reasoning block of the latest assistant message, single line. */
function useLivePreviewText(sessionId: string): string | null {
	const queryClient = useQueryClient();
	// Subscribe to the same cache key `use-streaming` writes deltas into so the
	// preview re-renders on every streaming tick (a plain `getQueryData` read
	// never subscribes, leaving the text frozen mid-stream).
	const { data: thread } = useQuery({
		queryKey: sessionThreadCacheKey(sessionId || "__none__"),
		queryFn: () =>
			sessionId ? (readSessionThread(queryClient, sessionId) ?? []) : [],
		enabled: Boolean(sessionId),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30_000,
	});
	const blocks = extractLiveActivity(thread);
	for (const block of blocks) {
		if (block.kind === "markdown" && block.text.trim()) {
			return block.text.replace(/\s+/g, " ").trim();
		}
	}
	return null;
}

function SessionLine({ session }: { session: WorkspaceSessionSummary }) {
	const isTerminal = session.sessionKind === "terminal";
	// Terminals have no sidebar-accessible output source — label only.
	const preview = useLivePreviewText(isTerminal ? "" : session.id);
	const Icon = isTerminal ? SquareTerminal : Bot;
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-mini text-muted-foreground">
			<Icon className="size-3 shrink-0" strokeWidth={1.9} />
			<span className="max-w-[7rem] shrink-0 truncate font-medium text-foreground/80">
				{session.title}
			</span>
			{session.agentType ? (
				<span className="shrink-0 text-foreground/40">{session.agentType}</span>
			) : null}
			{!isTerminal && preview ? (
				<span className="min-w-0 flex-1 truncate text-foreground/50">
					{preview}
				</span>
			) : null}
		</div>
	);
}

export const WorkspaceRowSessionsPreview = memo(
	function WorkspaceRowSessionsPreview({
		workspaceId,
		className,
	}: {
		workspaceId: string;
		className?: string;
	}) {
		const busySessionIds = useBusySessionIds();
		const { data: sessions } = useQuery(
			workspaceSessionsQueryOptions(workspaceId, { staleTime: 5_000 }),
		);
		const running = useMemo(
			() =>
				(sessions ?? [])
					.filter(
						(s) => !s.isHidden && !s.actionKind && busySessionIds.has(s.id),
					)
					.sort((a, b) => a.title.localeCompare(b.title)),
			[sessions, busySessionIds],
		);
		if (running.length === 0) return null;
		return (
			<div className={cn("flex flex-col gap-0.5 pb-1 pl-9 pr-2.5", className)}>
				{running.map((session) => (
					<SessionLine key={session.id} session={session} />
				))}
			</div>
		);
	},
);
