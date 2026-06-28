import type { CSSProperties } from "react";
import { TerminalSessionPanel } from "@/features/terminal/terminal-session-panel";
import { useCanvasViewStore } from "../canvas-view-store";
import { useCanvasWorkspace } from "../canvas-workspace-context";
import { READABLE_PANEL_MIN_ALPHA } from "../types";

/** Translucent terminal fill — the (opaque) terminal pane token mixed toward
 * transparent at the given alpha. A defined fallback (`--bg-base`) keeps the
 * surface from collapsing to `transparent` if the token isn't resolved yet (an
 * undefined `var()` inside `color-mix` voids the whole declaration). At full
 * strength no `color-mix` is needed. */
const TERMINAL_BG = "var(--canvas-pane-terminal-bg, var(--bg-base))";
function terminalSurface(alpha: number): string {
	if (alpha >= 1) return TERMINAL_BG;
	return `color-mix(in srgb, ${TERMINAL_BG} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Live PTY terminal inside a canvas panel. The PTY is keyed by the panel's
 * own `instanceId` (mirrors the terminal sub-tab UUID-keying), so multiple
 * terminal panels coexist. The module-level terminal store keeps the buffer
 * alive across a canvas-mode toggle (host unmount) so re-entry replays it;
 * the PTY is only SIGTERM'd when the panel shape is deleted (handled in the
 * sync engine, which sees the removed shape's config). */
export function TerminalPanelBody({ instanceId }: { instanceId: string }) {
	const { repoId, workspaceId, workspaceReady } = useCanvasWorkspace();
	// The terminal is the single translucent surface for this panel (the
	// panel-node container stays transparent for terminals). xterm draws
	// transparent over `--terminal-background`, so mixing that token toward
	// transparent translucents the whole terminal with the canvas slider, gated
	// by the readability floor so dense output stays legible.
	const translucency = useCanvasViewStore((s) => s.translucency);
	const alpha = Math.min(1, Math.max(READABLE_PANEL_MIN_ALPHA, translucency));

	return (
		// `flex flex-col` (not a bare block) so TerminalSessionPanel's `flex-1`
		// root resolves and the terminal fills the full panel height — a block
		// parent leaves flex-1 inert and the terminal collapses to content height.
		<div
			className="flex size-full flex-col"
			style={
				{
					"--terminal-background": terminalSurface(alpha),
				} as CSSProperties
			}
		>
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
