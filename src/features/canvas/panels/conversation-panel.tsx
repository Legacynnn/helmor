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
import { useCanvasViewStore } from "../canvas-view-store";
import { useCanvasWorkspace } from "../canvas-workspace-context";
import { READABLE_PANEL_MIN_ALPHA } from "../types";

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

/** Translucent fill for the conversation surface — the (opaque) canvas pane
 * token mixed toward transparent at the given alpha. The token carries a defined
 * fallback (`--bg-elevated`) so the surface never collapses to `transparent` if
 * `--canvas-pane-bg` isn't resolved yet (an undefined `var()` inside `color-mix`
 * voids the whole declaration). At full strength no `color-mix` is needed. */
const PANE_COLOR = "var(--canvas-pane-bg, var(--bg-elevated))";
function paneSurface(alpha: number): string {
	if (alpha >= 1) return PANE_COLOR;
	return `color-mix(in srgb, ${PANE_COLOR} ${Math.round(alpha * 100)}%, transparent)`;
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

	// The conversation paints its OWN translucent surface here (the panel-node
	// container stays transparent for conversation panels), so the thread ("main
	// canvas") and the strip behind the composer share one explicit, always-
	// present translucency. The thread viewport's `bg-panel` resolves to
	// `var(--panel-bg)` (= `--bg-base`); inside the canvas, React Flow's own
	// `.dark` container re-asserts the base (opaque) `--bg-base`, shadowing the
	// glass theme's transparent one — which painted the middle of the thread
	// solid black. Zeroing `--panel-bg` here (and `--color-panel`, which mirrors
	// it) drops that opaque fill so our single translucent surface shows through
	// the whole thread. The composer keeps its `bg-sidebar` fill, so the input
	// stays fully colored. Conversation translucents gently (floor) for legibility.
	const translucency = useCanvasViewStore((s) => s.translucency);
	const alpha = Math.min(1, Math.max(READABLE_PANEL_MIN_ALPHA, translucency));

	return (
		<div
			className="flex size-full flex-col"
			style={
				{
					backgroundColor: paneSurface(alpha),
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
