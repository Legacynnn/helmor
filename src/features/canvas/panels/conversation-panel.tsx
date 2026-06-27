import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { WorkspaceConversationContainer } from "@/features/conversation";
import { activeStreamsQueryOptions } from "@/lib/query-client";
import { useCanvasWorkspace } from "../canvas-workspace-context";

const noop = () => {};

/** Live conversation inside a canvas panel. Reuses the full conversation
 * container (streaming + composer + thread) pinned to one session. The
 * streaming store is keyed by `session:<sessionId>`, so each panel streams
 * independently with no cross-talk. Selection callbacks are no-ops — the panel
 * owns its session; the canvas, not the router, decides what's displayed. */
export function ConversationPanelBody({ sessionId }: { sessionId: string }) {
	const { workspaceId, repoId, workspaceRootPath } = useCanvasWorkspace();
	const { data: activeStreams = [] } = useQuery(activeStreamsQueryOptions());

	// A panel always shows exactly its bound session, regardless of any global
	// selection — pin both selected + displayed tracks to it.
	const resolveDisplayed = useCallback(noop, []);

	return (
		<div className="flex size-full flex-col bg-app-base">
			<WorkspaceConversationContainer
				hideTabs
				selectedWorkspaceId={workspaceId}
				displayedWorkspaceId={workspaceId}
				selectedSessionId={sessionId}
				displayedSessionId={sessionId}
				repoId={repoId}
				workspaceRootPath={workspaceRootPath}
				activeStreams={activeStreams}
				onSelectSession={noop}
				onResolveDisplayedSession={resolveDisplayed}
				composerFocusScope="workspace-composer"
			/>
		</div>
	);
}
