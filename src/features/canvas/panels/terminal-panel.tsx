import { TerminalSessionPanel } from "@/features/terminal/terminal-session-panel";
import { useCanvasWorkspace } from "../canvas-workspace-context";

/** Live PTY terminal inside a canvas panel. The PTY is keyed by the panel's
 * own `instanceId` (mirrors the terminal sub-tab UUID-keying), so multiple
 * terminal panels coexist. The module-level terminal store keeps the buffer
 * alive across a canvas-mode toggle (host unmount) so re-entry replays it;
 * the PTY is only SIGTERM'd when the panel shape is deleted (handled in the
 * sync engine, which sees the removed shape's config). */
export function TerminalPanelBody({ instanceId }: { instanceId: string }) {
	const { repoId, workspaceId, workspaceReady } = useCanvasWorkspace();

	return (
		<div className="size-full bg-app-base">
			<TerminalSessionPanel
				repoId={repoId}
				workspaceId={workspaceId}
				sessionId={instanceId}
				workspaceReady={workspaceReady}
				isActive
			/>
		</div>
	);
}
