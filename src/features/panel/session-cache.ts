import type { QueryClient } from "@tanstack/react-query";
import type { WorkspaceDetail, WorkspaceSessionSummary } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

type OptimisticSessionKindOptions = {
	/** "chat" (SDK thread) or "terminal" (PTY agent CLI). Defaults to "chat". */
	sessionKind?: WorkspaceSessionSummary["sessionKind"];
	/** Terminal agent id (e.g. "claude-code") for terminal sessions; drives the
	 * tab label during the optimistic window. Defaults to null. */
	agentType?: string | null;
};

export function buildOptimisticSession(
	workspaceId: string,
	sessionId: string,
	createdAt: string,
	options: OptimisticSessionKindOptions = {},
): WorkspaceSessionSummary {
	return {
		id: sessionId,
		workspaceId,
		title: "Untitled",
		agentType: options.agentType ?? null,
		status: "idle",
		model: null,
		permissionMode: "default",
		providerSessionId: null,
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt,
		updatedAt: createdAt,
		lastUserMessageAt: null,
		isHidden: false,
		sessionKind: options.sessionKind ?? "chat",
		actionKind: null,
		active: true,
	};
}

type SeedNewSessionInCacheOptions = OptimisticSessionKindOptions & {
	queryClient: QueryClient;
	workspaceId: string;
	sessionId: string;
	workspace?: WorkspaceDetail | null;
	existingSessions?: WorkspaceSessionSummary[];
	createdAt?: string;
};

export function seedNewSessionInCache({
	queryClient,
	workspaceId,
	sessionId,
	workspace = null,
	existingSessions,
	createdAt = new Date().toISOString(),
	sessionKind = "chat",
	agentType = null,
}: SeedNewSessionInCacheOptions): WorkspaceSessionSummary {
	const optimisticSession = buildOptimisticSession(
		workspaceId,
		sessionId,
		createdAt,
		{ sessionKind, agentType },
	);

	queryClient.setQueryData(
		helmorQueryKeys.workspaceDetail(workspaceId),
		(current: WorkspaceDetail | null | undefined) => {
			const base = current ?? workspace;
			if (!base) {
				return current;
			}

			return {
				...base,
				activeSessionId: sessionId,
				activeSessionTitle: "Untitled",
				activeSessionAgentType: agentType,
				activeSessionStatus: "idle",
				sessionCount:
					base.activeSessionId === sessionId
						? base.sessionCount
						: base.sessionCount + 1,
			};
		},
	);
	queryClient.setQueryData(
		helmorQueryKeys.workspaceSessions(workspaceId),
		(current: WorkspaceSessionSummary[] | undefined) => {
			const resolvedSessions = current ?? existingSessions ?? [];
			if (resolvedSessions.some((session) => session.id === sessionId)) {
				return resolvedSessions.map((session) => ({
					...session,
					active: session.id === sessionId,
				}));
			}

			return [
				...resolvedSessions.map((session) => ({
					...session,
					active: false,
				})),
				optimisticSession,
			];
		},
	);
	queryClient.setQueryData(
		[...helmorQueryKeys.sessionMessages(sessionId), "thread"],
		[],
	);

	return optimisticSession;
}
