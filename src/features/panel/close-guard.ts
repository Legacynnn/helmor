import type { WorkspaceSessionSummary } from "@/lib/api";
import { isSessionRunningStatus } from "./session-running";

export function shouldConfirmRunningSessionClose(
	session: WorkspaceSessionSummary,
	busySessionIds?: Set<string>,
): boolean {
	if (session.sessionKind === "terminal") {
		// Closing a terminal tab kills the PTY; confirm while the agent is
		// mid-task ("working") or asking for input ("attention").
		return session.status === "working" || session.status === "attention";
	}
	return (
		busySessionIds?.has(session.id) === true ||
		isSessionRunningStatus(session.status)
	);
}
