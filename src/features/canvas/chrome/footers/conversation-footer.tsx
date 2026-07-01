import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import {
	activeStreamsQueryOptions,
	workspaceDetailQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { useCanvasWorkspace } from "../../canvas-workspace-context";

export type ConversationFooterInput = {
	status: string;
	streaming: boolean;
	lastUserMessageAt?: string | null;
	branch?: string | null;
};

export type ConversationFooterModel = {
	statusLabel: string;
	streaming: boolean;
	branch: string | null;
	lastActivity: string | null;
};

/** Pure display logic for the conversation footer. Streaming wins over the
 * stored status; a non-idle status without an active stream reads as
 * "Thinking". Kept separate from the component so it is unit-testable without a
 * QueryClient. */
export function conversationFooterModel(
	input: ConversationFooterInput,
): ConversationFooterModel {
	const streaming = input.streaming;
	let statusLabel: string;
	if (streaming) statusLabel = "Streaming";
	else if (input.status === "idle" || input.status === "") statusLabel = "Idle";
	else statusLabel = "Thinking";
	return {
		statusLabel,
		streaming,
		branch: input.branch ?? null,
		lastActivity: relativeTime(input.lastUserMessageAt),
	};
}

export function ConversationFooter({ sessionId }: { sessionId?: string }) {
	const { workspaceId } = useCanvasWorkspace();
	const sessions = useQuery(workspaceSessionsQueryOptions(workspaceId));
	const streams = useQuery(activeStreamsQueryOptions());
	const detail = useQuery(workspaceDetailQueryOptions(workspaceId));

	const session = sessionId
		? sessions.data?.find((s) => s.id === sessionId)
		: undefined;
	const streaming = sessionId
		? Boolean(streams.data?.some((s) => s.sessionId === sessionId))
		: false;

	const model = conversationFooterModel({
		status: session?.status ?? "",
		streaming,
		lastUserMessageAt: session?.lastUserMessageAt,
		branch: detail.data?.branch,
	});

	return (
		<>
			<span className="flex shrink-0 items-center gap-1">
				<span
					className={cn(
						"size-1.5 rounded-full",
						model.streaming
							? "animate-pulse bg-emerald-500"
							: model.statusLabel === "Thinking"
								? "bg-amber-500"
								: "bg-app-muted-foreground/50",
					)}
				/>
				<span className="tabular-nums leading-none">{model.statusLabel}</span>
			</span>
			{model.branch ? (
				<span className="flex min-w-0 items-center gap-1">
					<GitBranch className="size-2.5 shrink-0 opacity-70" />
					<span className="truncate">{model.branch}</span>
				</span>
			) : null}
			{model.lastActivity ? (
				<span className="ml-auto shrink-0 truncate opacity-70">
					{model.lastActivity}
				</span>
			) : null}
		</>
	);
}
