// Split-canvas wrapper for the workspace conversation surface. Sits exactly
// where `ShellWorkspaceConversation` used to: it reads the same router/store
// selection, then either renders the UNCHANGED single-conversation path (the
// common case, zero behavioural change) or, when the canvas holds >1 leaf,
// renders a recursive `PaneTreeView` with one full `WorkspaceConversationContainer`
// per leaf. The focused leaf drives the existing single-session selection so
// the inspector, router URL, and shortcut scope follow the active pane.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
	WorkspaceConversationContainer,
	type WorkspaceConversationContainerProps,
} from "@/features/conversation";
import { WorkspacePanelContainer } from "@/features/panel/container";
import { closeWorkspaceSession } from "@/features/panel/session-close";
import { createSession } from "@/lib/api";
import {
	workspaceDetailQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";
import { useRouterSelection } from "@/router/use-router-selection";
import { useCanvasTabDnd } from "@/shell/canvas/canvas-dnd";
import { PaneTreeView } from "@/shell/canvas/pane-tree-view";
import type { DropEdge, PaneLeaf } from "@/shell/canvas/tree-model";
import { useCanvasState } from "@/shell/canvas/use-canvas-state";
import { useSelectionStore } from "@/shell/controllers/selection-store-context";
import { publishShellEvent, useShellEvent } from "@/shell/event-bus";
import { ShellWorkspaceConversation } from "./shell-workspace-conversation";

type Props = Omit<
	WorkspaceConversationContainerProps,
	| "selectedWorkspaceId"
	| "displayedWorkspaceId"
	| "selectedSessionId"
	| "displayedSessionId"
>;

export function ShellCanvasConversation(props: Props) {
	const { sessionId: selectedSessionId } = useRouterSelection();
	const { displayedWorkspaceId } = useStore(
		useSelectionStore(),
		useShallow((s) => ({
			displayedWorkspaceId: s.displayedWorkspaceId,
		})),
	);
	const queryClient = useQueryClient();
	const pushToast = useWorkspaceToast();

	const canvas = useCanvasState({ workspaceId: displayedWorkspaceId });

	// Workspace + session list — needed to close a pane's session for real
	// (same flow the tab × uses), not just remove it from the split.
	const detailQuery = useQuery({
		...workspaceDetailQueryOptions(displayedWorkspaceId ?? "__none__"),
		enabled: Boolean(displayedWorkspaceId),
	});
	const sessionsQuery = useQuery({
		...workspaceSessionsQueryOptions(displayedWorkspaceId ?? "__none__"),
		enabled: Boolean(displayedWorkspaceId),
	});
	const workspace = detailQuery.data ?? null;
	const sessions = useMemo(
		() => sessionsQuery.data ?? [],
		[sessionsQuery.data],
	);

	const { onSelectSession } = props;

	const splitSet = new Set(canvas.splitSessionIds);
	// Are we currently looking AT the split (selection is one of its panes)?
	// The split persists even when we're not — navigating to another session
	// just shows that session; the split is restored on returning to a member.
	const viewingSplit =
		canvas.hasSplit && !!selectedSessionId && splitSet.has(selectedSessionId);

	const focusedLeaf =
		canvas.leaves.find((l) => l.paneId === canvas.focusedPaneId) ??
		canvas.leaves[0] ??
		null;

	// Focus a leaf → make its session the selected one so the inspector,
	// router, and chat shortcuts follow the active pane.
	const handleFocusPane = useCallback(
		(paneId: string) => {
			canvas.focusPane(paneId);
			const leaf = canvas.leaves.find((l) => l.paneId === paneId);
			if (leaf && leaf.sessionId !== selectedSessionId) {
				onSelectSession(leaf.sessionId);
			}
		},
		[canvas, onSelectSession, selectedSessionId],
	);

	const invalidateSessions = useCallback(async () => {
		if (!displayedWorkspaceId) return;
		await queryClient.invalidateQueries({
			queryKey: workspaceSessionsQueryOptions(displayedWorkspaceId).queryKey,
		});
	}, [displayedWorkspaceId, queryClient]);

	// Extend the split: create a fresh session and split the given pane toward it.
	const handleSplitPane = useCallback(
		async (paneId: string, direction: "row" | "col") => {
			if (!displayedWorkspaceId) return;
			try {
				const { sessionId } = await createSession(displayedWorkspaceId);
				canvas.splitPane(paneId, direction, sessionId);
				await invalidateSessions();
				onSelectSession(sessionId);
			} catch (error) {
				console.error("Failed to split canvas pane", error);
			}
		},
		[canvas, displayedWorkspaceId, invalidateSessions, onSelectSession],
	);

	// Start a brand-new split from the currently-viewed single session.
	const handleStartSplit = useCallback(
		async (direction: "row" | "col") => {
			if (!displayedWorkspaceId || !selectedSessionId) return;
			try {
				const { sessionId } = await createSession(displayedWorkspaceId);
				canvas.startSplit(selectedSessionId, direction, sessionId);
				await invalidateSessions();
				onSelectSession(sessionId);
			} catch (error) {
				console.error("Failed to start split", error);
			}
		},
		[
			canvas,
			displayedWorkspaceId,
			invalidateSessions,
			onSelectSession,
			selectedSessionId,
		],
	);

	const { onRequestCloseSession } = props;
	const handleClosePane = useCallback(
		(paneId: string) => {
			const leaf = canvas.leaves.find((l) => l.paneId === paneId);
			const remaining = canvas.leaves.filter((l) => l.paneId !== paneId);
			// Remove the pane from the split (instant) and keep a survivor selected
			// so focus doesn't land on the session we're about to close.
			canvas.closePane(paneId);
			if (
				remaining.length >= 1 &&
				(remaining.length === 1 || leaf?.sessionId === selectedSessionId)
			) {
				onSelectSession(remaining[0].sessionId);
			}

			// Actually CLOSE the session (hide / delete) — same as the tab × —
			// rather than only un-splitting it. Running sessions route through the
			// shared confirm-close flow when available.
			const session = leaf
				? sessions.find((s) => s.id === leaf.sessionId)
				: null;
			if (!workspace || !session) {
				return;
			}
			if (onRequestCloseSession) {
				onRequestCloseSession({
					workspace,
					sessions,
					session,
					activateAdjacent: false,
					provider: null,
					onSessionsChanged: () => void invalidateSessions(),
				});
			} else {
				void closeWorkspaceSession({
					queryClient,
					workspace,
					sessions,
					sessionId: session.id,
					activateAdjacent: false,
					onSessionsChanged: () => void invalidateSessions(),
					pushToast,
				});
			}
		},
		[
			canvas,
			onRequestCloseSession,
			onSelectSession,
			selectedSessionId,
			sessions,
			workspace,
			queryClient,
			pushToast,
			invalidateSessions,
		],
	);

	// A pane is "closeable via ⌘W" when we're actively viewing the split. Tell
	// the global shortcut handler so ⌘W closes the focused pane (removing it
	// from the split) before it would close the session itself.
	useEffect(() => {
		publishShellEvent({
			type: "canvas-pane-closeable-changed",
			active: viewingSplit,
		});
		return () => {
			publishShellEvent({
				type: "canvas-pane-closeable-changed",
				active: false,
			});
		};
	}, [viewingSplit]);

	// ⌘W (routed here by the shortcut handler) closes the focused pane.
	const focusedPaneId = canvas.focusedPaneId;
	useShellEvent("close-focused-canvas-pane", () => {
		if (focusedPaneId) {
			handleClosePane(focusedPaneId);
		}
	});

	// Drag-to-split: from the no-split single view a drop STARTS a split; within
	// an existing split a drop MOVES a member pane or INSERTS a new one.
	const handleCanvasDrop = useCallback(
		(
			sessionId: string,
			_sourcePaneId: string | null,
			targetPaneId: string,
			edge: DropEdge,
		) => {
			if (!canvas.hasSplit) {
				if (selectedSessionId && sessionId !== selectedSessionId) {
					canvas.startSplitByDrop(selectedSessionId, sessionId, edge);
					onSelectSession(sessionId);
				}
				return;
			}
			const existing = canvas.leaves.find((l) => l.sessionId === sessionId);
			if (existing) {
				if (existing.paneId !== targetPaneId) {
					canvas.movePane(existing.paneId, targetPaneId, edge);
					onSelectSession(sessionId);
				}
				return;
			}
			canvas.insertPane(sessionId, targetPaneId, edge);
			onSelectSession(sessionId);
		},
		[canvas, onSelectSession, selectedSessionId],
	);

	const { overlay: dndOverlay } = useCanvasTabDnd({
		enabled: Boolean(displayedWorkspaceId),
		onDrop: handleCanvasDrop,
		// A real click (no drag) replays the selection we suppress at mousedown
		// so dragging a tab never activates it, but clicking still does.
		onActivateSession: onSelectSession,
	});

	// Phase 2 (cross-chat connection): a pane's siblings are every OTHER pane.
	const siblingSessionIdSet = canvas.splitSessionIds.join(",");
	const getSiblingSessionIds = useCallback(
		(sessionId: string) =>
			siblingSessionIdSet
				? siblingSessionIdSet.split(",").filter((id) => id !== sessionId)
				: [],
		[siblingSessionIdSet],
	);

	// Per-pane overlay is CLOSE-ONLY now — splitting moved to the header (next to
	// history) so the split icons no longer overlap the header's editor / right-
	// sidebar buttons. The focused pane keeps its × always visible.
	const renderPaneOverlay = useCallback(
		(leaf: PaneLeaf) => (
			<PaneCloseControl
				paneId={leaf.paneId}
				alwaysVisible={leaf.paneId === canvas.focusedPaneId}
				onClose={handleClosePane}
			/>
		),
		[canvas.focusedPaneId, handleClosePane],
	);

	// Split the focused pane (header control while viewing the split).
	const handleSplitFocused = useCallback(
		(direction: "row" | "col") => {
			if (focusedLeaf) {
				void handleSplitPane(focusedLeaf.paneId, direction);
			}
		},
		[focusedLeaf, handleSplitPane],
	);

	const canvasGroup =
		canvas.hasSplit && focusedLeaf
			? {
					sessionIds: canvas.splitSessionIds,
					count: canvas.leaves.length,
					activeSessionId: focusedLeaf.sessionId,
				}
			: null;

	// CASE 1 — no split: today's single-conversation path. The split control
	// lives in the conversation header (next to history); a dragged tab can also
	// start a split via the dropzone.
	if (!canvas.hasSplit) {
		const dropPaneId = selectedSessionId
			? `pane-${selectedSessionId}`
			: undefined;
		return (
			<div
				className="group/canvas relative flex min-h-0 flex-1 flex-col"
				data-canvas-dropzone={dropPaneId}
			>
				<ShellWorkspaceConversation
					{...props}
					onCanvasSplit={selectedSessionId ? handleStartSplit : undefined}
				/>
				{dndOverlay}
			</div>
		);
	}

	// CASE 2 — split exists but we're viewing a NON-member session: render that
	// session normally; its header carries the collapsed "split" group tab so
	// the user can click it to return to the split (which is NOT destroyed).
	if (!viewingSplit) {
		return (
			<div className="group/canvas relative flex min-h-0 flex-1 flex-col">
				<ShellWorkspaceConversation
					{...props}
					canvasGroup={canvasGroup}
					onCanvasSplit={selectedSessionId ? handleStartSplit : undefined}
				/>
				{dndOverlay}
			</div>
		);
	}

	// CASE 3 — viewing the split: one shared tab bar above all panes, each pane
	// a complete headerless conversation scoped to its own session.
	const renderLeaf = (leaf: PaneLeaf) => (
		<WorkspaceConversationContainer
			{...props}
			selectedWorkspaceId={displayedWorkspaceId}
			displayedWorkspaceId={displayedWorkspaceId}
			selectedSessionId={leaf.sessionId}
			displayedSessionId={leaf.sessionId}
			getSiblingSessionIds={getSiblingSessionIds}
			hideHeader
			headerLeading={undefined}
			headerActions={undefined}
		/>
	);

	if (!canvas.canvas) {
		return <ShellWorkspaceConversation {...props} />;
	}

	return (
		<div className="group/canvas relative flex min-h-0 flex-1 flex-col">
			<WorkspacePanelContainer
				headerOnly
				canvasGroup={canvasGroup}
				onCanvasSplit={handleSplitFocused}
				canvasSplitDisabled={canvas.leaves.length >= 4}
				selectedWorkspaceId={displayedWorkspaceId}
				displayedWorkspaceId={displayedWorkspaceId}
				selectedSessionId={focusedLeaf?.sessionId ?? null}
				displayedSessionId={focusedLeaf?.sessionId ?? null}
				sessionSelectionHistory={props.sessionSelectionHistory}
				sending={false}
				busySessionIds={props.busySessionIds}
				interactionRequiredSessionIds={props.interactionRequiredSessionIds}
				workspaceChangeRequest={props.workspaceChangeRequest}
				onSelectSession={onSelectSession}
				onSelectWorkspace={props.onSelectWorkspace}
				onResolveDisplayedSession={props.onResolveDisplayedSession}
				onQueuePendingPromptForSession={props.onQueuePendingPromptForSession}
				onRequestCloseSession={props.onRequestCloseSession}
				contextPreviewCard={props.contextPreviewCard}
				contextPreviewActive={props.contextPreviewActive}
				onSelectContextPreview={props.onSelectContextPreview}
				onCloseContextPreview={props.onCloseContextPreview}
				headerActions={props.headerActions}
				headerLeading={props.headerLeading}
			/>
			<div className="relative flex min-h-0 flex-1 flex-col">
				<PaneTreeView
					node={canvas.canvas.root}
					focusedPaneId={canvas.focusedPaneId}
					renderLeaf={renderLeaf}
					onFocusPane={handleFocusPane}
					onResize={canvas.resize}
					renderPaneOverlay={renderPaneOverlay}
				/>
				{dndOverlay}
			</div>
		</div>
	);
}

type PaneCloseControlProps = {
	paneId: string;
	/** Keep the close button visible without hovering — used for the focused
	 *  pane so closing the selected pane is always one click away. */
	alwaysVisible?: boolean;
	onClose: (paneId: string) => void;
};

// Per-pane close affordance (top-right of each pane). Splitting now lives in the
// header next to the history button, so this overlay only carries the ×.
function PaneCloseControl({
	paneId,
	alwaysVisible = false,
	onClose,
}: PaneCloseControlProps) {
	return (
		<div
			className={cn(
				"absolute right-2 top-1.5 z-30 flex items-center rounded-md",
				"bg-background/80 p-0.5 shadow-sm backdrop-blur transition-opacity",
				"group-hover/canvas:opacity-100 hover:opacity-100 focus-within:opacity-100",
				alwaysVisible ? "opacity-100" : "opacity-0",
			)}
			// Don't let control clicks bubble into the leaf focus / thread.
			onPointerDown={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				title="Close pane (⌘W)"
				aria-label="Close pane"
				className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
				onClick={() => onClose(paneId)}
			>
				<CloseIcon />
			</button>
		</div>
	);
}

function CloseIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<line x1="6" y1="6" x2="18" y2="18" />
			<line x1="18" y1="6" x2="6" y2="18" />
		</svg>
	);
}
