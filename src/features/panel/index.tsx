import { memo, type ReactNode, useEffect, useRef } from "react";
import { SourceDetailView } from "@/features/source-detail";
import { terminalAgentLabel } from "@/features/terminals/agent-meta";
import { TerminalSessionPane } from "@/features/terminals/terminal-session-pane";
import type {
	AgentProvider,
	ChangeRequestInfo,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { HelmorProfiler } from "@/lib/dev-react-profiler";
import type { ContextCard } from "@/lib/sources/types";
import type { WorkspaceScriptType } from "@/lib/workspace-script-actions";
import { WorkspacePanelHeader } from "./header";
import { EmptyState, preloadStreamdown } from "./message-components";
import {
	ActiveThreadViewport,
	ConversationColdPlaceholder,
	type PresentedSessionPane,
} from "./thread-viewport";
import type { SessionCloseRequest } from "./use-confirm-session-close";

export {
	AssistantToolCall,
	agentChildrenBlockPropsEqual,
	assistantToolCallPropsEqual,
} from "./message-components";

type WorkspacePanelProps = {
	workspace: WorkspaceDetail | null;
	changeRequest?: ChangeRequestInfo | null;
	sessions: WorkspaceSessionSummary[];
	selectedSessionId: string | null;
	sessionDisplayProviders?: Record<string, AgentProvider>;
	sessionPanes: PresentedSessionPane[];
	loadingWorkspace?: boolean;
	loadingSession?: boolean;
	refreshingWorkspace?: boolean;
	refreshingSession?: boolean;
	sending?: boolean;
	busySessionIds?: Set<string>;
	interactionRequiredSessionIds?: Set<string>;
	contextPreviewCard?: ContextCard | null;
	contextPreviewActive?: boolean;
	onSelectSession?: (sessionId: string) => void;
	onSelectWorkspace?: (workspaceId: string) => void;
	onSelectContextPreview?: () => void;
	onCloseContextPreview?: () => void;
	onPrefetchSession?: (sessionId: string) => void;
	onSessionsChanged?: () => void;
	onSessionRenamed?: (sessionId: string, title: string) => void;
	onWorkspaceChanged?: () => void;
	onRequestCloseSession?: (request: SessionCloseRequest) => void;
	headerActions?: ReactNode;
	headerLeading?: ReactNode;
	newSessionShortcut?: string | null;
	newTerminalShortcut?: string | null;
	missingScriptTypes?: WorkspaceScriptType[];
	onInitializeScript?: (scriptType: WorkspaceScriptType) => void;
};

export const WorkspacePanel = memo(function WorkspacePanel({
	workspace,
	changeRequest = null,
	sessions,
	selectedSessionId,
	sessionDisplayProviders,
	sessionPanes,
	loadingWorkspace = false,
	loadingSession = false,
	refreshingWorkspace: _refreshingWorkspace = false,
	refreshingSession: _refreshingSession = false,
	sending = false,
	busySessionIds,
	interactionRequiredSessionIds,
	contextPreviewCard = null,
	contextPreviewActive = false,
	onSelectSession,
	onSelectWorkspace,
	onSelectContextPreview,
	onCloseContextPreview,
	onPrefetchSession,
	onSessionsChanged,
	onSessionRenamed,
	onWorkspaceChanged,
	onRequestCloseSession,
	headerActions,
	headerLeading,
	newSessionShortcut,
	newTerminalShortcut,
	missingScriptTypes = [],
	onInitializeScript,
}: WorkspacePanelProps) {
	const selectedSession =
		sessions.find((session) => session.id === selectedSessionId) ?? null;
	const activePane =
		sessionPanes.find((pane) => pane.presentationState === "presented") ??
		sessionPanes[0] ??
		null;

	// Terminal sessions: a pane spawns its PTY on first selection and then
	// stays mounted (CSS-hidden) so scrollback survives tab switches. The
	// `openedTerminalIds` ref remembers which sessions have been opened —
	// without it every terminal tab would spawn its agent CLI eagerly.
	const selectedIsTerminal = selectedSession?.sessionKind === "terminal";
	const openedTerminalIds = useRef<Set<string>>(new Set());
	if (selectedIsTerminal && selectedSessionId) {
		openedTerminalIds.current.add(selectedSessionId);
	}
	const visibleSessionIds = new Set(sessions.map((session) => session.id));
	for (const id of [...openedTerminalIds.current]) {
		if (!visibleSessionIds.has(id)) openedTerminalIds.current.delete(id);
	}
	const mountedTerminalSessions = sessions.filter(
		(session) =>
			session.sessionKind === "terminal" &&
			openedTerminalIds.current.has(session.id),
	);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const idleCallbackId =
			"requestIdleCallback" in window
				? window.requestIdleCallback(() => preloadStreamdown(), {
						timeout: 1200,
					})
				: null;
		const timeoutId =
			idleCallbackId === null
				? window.setTimeout(() => preloadStreamdown(), 180)
				: null;

		return () => {
			if (idleCallbackId !== null && "cancelIdleCallback" in window) {
				window.cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
		};
	}, []);

	return (
		<HelmorProfiler id="WorkspacePanel">
			<div className="flex min-h-0 flex-1 flex-col bg-panel">
				<WorkspacePanelHeader
					workspace={workspace}
					changeRequest={changeRequest}
					sessions={sessions}
					selectedSessionId={selectedSessionId}
					sessionDisplayProviders={sessionDisplayProviders}
					sending={sending}
					busySessionIds={busySessionIds}
					interactionRequiredSessionIds={interactionRequiredSessionIds}
					loadingWorkspace={loadingWorkspace}
					contextPreviewCard={contextPreviewCard}
					contextPreviewActive={contextPreviewActive}
					headerActions={headerActions}
					headerLeading={headerLeading}
					onSelectSession={onSelectSession}
					onSelectWorkspace={onSelectWorkspace}
					onSelectContextPreview={onSelectContextPreview}
					onCloseContextPreview={onCloseContextPreview}
					onPrefetchSession={onPrefetchSession}
					onSessionsChanged={onSessionsChanged}
					onSessionRenamed={onSessionRenamed}
					onWorkspaceChanged={onWorkspaceChanged}
					onRequestCloseSession={onRequestCloseSession}
					newSessionShortcut={newSessionShortcut}
					newTerminalShortcut={newTerminalShortcut}
				/>

				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{workspace
						? mountedTerminalSessions.map((session) => (
								<TerminalSessionPane
									key={session.id}
									sessionId={session.id}
									repoId={workspace.repoId}
									workspaceId={workspace.id}
									agentLabel={terminalAgentLabel(session.agentType)}
									initialStatus={session.status}
									isActive={
										selectedIsTerminal &&
										session.id === selectedSessionId &&
										!contextPreviewActive
									}
								/>
							))
						: null}
					{contextPreviewActive && contextPreviewCard ? (
						<div className="min-h-0 flex-1 overflow-hidden px-0 pt-4 pb-3">
							<SourceDetailView card={contextPreviewCard} />
						</div>
					) : selectedIsTerminal ? null : activePane?.hasLoaded ? (
						<ActiveThreadViewport
							hasSession={!!selectedSession}
							pane={activePane}
							missingScriptTypes={missingScriptTypes}
							onInitializeScript={onInitializeScript}
						/>
					) : loadingWorkspace || loadingSession ? (
						<ConversationColdPlaceholder />
					) : (
						<div className="flex min-h-full flex-1 items-center justify-center px-8">
							<EmptyState
								workspaceState={workspace?.state ?? null}
								hasSession={!!selectedSession}
								missingScriptTypes={missingScriptTypes}
								onInitializeScript={onInitializeScript}
							/>
						</div>
					)}
				</div>
			</div>
		</HelmorProfiler>
	);
});
