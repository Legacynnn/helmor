import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import { WorkspaceConversationContainer } from "@/features/conversation";
import { buildTitleSeed } from "@/features/conversation/hooks/seed-session-title";
import type { ThreadMessageLike } from "@/lib/api";
import {
	activeStreamsQueryOptions,
	sessionThreadMessagesQueryOptions,
} from "@/lib/query-client";
import { useCanvasActions } from "../canvas-actions-context";
import { useCanvasWorkspace } from "../canvas-workspace-context";

const noop = () => {};

/** First user prompt text in a thread, used to auto-name a canvas conversation
 * panel (mirrors how a normal session tab seeds its title from the first send). */
function firstUserPrompt(messages: ThreadMessageLike[] | undefined): string {
	const msg = messages?.find((m) => m.role === "user");
	if (!msg) return "";
	return msg.content
		.filter(
			(p): p is { type: "text"; id: string; text: string } => p.type === "text",
		)
		.map((p) => p.text)
		.join(" ")
		.trim();
}

/** Live conversation inside a canvas panel. Reuses the full conversation
 * container (streaming + composer + thread) pinned to one session. The
 * streaming store is keyed by `session:<sessionId>`, so each panel streams
 * independently with no cross-talk. Selection callbacks are no-ops — the panel
 * owns its session; the canvas, not the router, decides what's displayed. */
export function ConversationPanelBody({
	nodeId,
	sessionId,
	nodeTitle,
}: {
	nodeId: string;
	sessionId: string;
	nodeTitle?: string;
}) {
	const { workspaceId, repoId, workspaceRootPath } = useCanvasWorkspace();
	const { data: activeStreams = [] } = useQuery(activeStreamsQueryOptions());

	// A panel always shows exactly its bound session, regardless of any global
	// selection — pin both selected + displayed tracks to it.
	const resolveDisplayed = useCallback(noop, []);

	// Auto-name the panel from its first message, like a session tab. Canvas
	// sessions are hidden, so the normal title-seed path (which writes the
	// visible session list) never reaches them — we seed the node title here
	// instead. Only fills an empty title, so a manual rename (selection toolbar)
	// is never clobbered; once set we never overwrite it again this mount.
	const { patchNodeData } = useCanvasActions();
	const hasTitle = Boolean(nodeTitle?.trim());
	const seededRef = useRef(false);
	const { data: messages } = useQuery({
		...sessionThreadMessagesQueryOptions(sessionId),
		enabled: !hasTitle,
	});
	useEffect(() => {
		if (hasTitle || seededRef.current) return;
		const prompt = firstUserPrompt(messages);
		if (!prompt) return;
		seededRef.current = true;
		patchNodeData(nodeId, { title: buildTitleSeed(prompt) });
	}, [hasTitle, messages, nodeId, patchNodeData]);

	// The conversation panel renders the SAME neutral, opaque background as a
	// normal (non-canvas) conversation, so opening a session on the canvas never
	// switches its background colour. Normal threads paint `bg-panel`
	// (= `--color-panel` → `--panel-bg` → `--bg-base`); we paint that resolved
	// base directly as a single opaque surface for the whole panel.
	//
	// We still zero `--panel-bg`/`--color-panel` on this element: inside the
	// canvas, React Flow's own `.dark` container re-asserts an opaque `--bg-base`
	// for the inner thread viewport, which would paint a second fill over the
	// middle of the thread. Dropping those vars lets our single surface show
	// through the whole thread. The composer keeps its `bg-sidebar` fill.
	//
	// Unlike the other canvas panels, the conversation intentionally ignores the
	// translucency slider — matching a normal conversation exactly was preferred
	// over the translucent "glass over canvas" look here.
	return (
		<div
			className="flex size-full flex-col"
			style={
				{
					backgroundColor: "var(--bg-base)",
					"--panel-bg": "transparent",
					"--color-panel": "transparent",
				} as CSSProperties
			}
		>
			<WorkspaceConversationContainer
				hideTabs
				pinDisplayedSession
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
