import type { Editor, TLShapeId } from "tldraw";
import { parsePanelConfig } from "../panel-config";
import type { PanelShape } from "../shapes/panel-shape";
import { connectionMeta, useConnectionsStore } from "./connections-store";

/** Resolve which terminal a conversation panel routes command execution to.
 *
 * Picks the conversation→terminal edge flagged `primary` ("run with a specific
 * terminal"); if none is flagged, falls back to the first connected terminal.
 * Returns the target terminal's PTY `instanceId` (the key
 * `writeTerminalStdin` / `ensureTerminal` use), or null when the conversation
 * isn't connected to any terminal.
 *
 * This is the bridge the Phase 6 CLI / agent-orchestration layer uses to send
 * a connected conversation's shell commands into the chosen terminal. */
export function resolveRoutedTerminalInstance(
	editor: Editor,
	conversationPanelId: string,
): string | null {
	const edges = useConnectionsStore
		.getState()
		.connections.filter(
			(c) =>
				c.fromPanelId === conversationPanelId &&
				c.kind === "conversation-terminal",
		);
	if (edges.length === 0) return null;
	const chosen = edges.find((c) => connectionMeta(c).primary) ?? edges[0];
	const target = editor.getShape(chosen.toPanelId as TLShapeId) as
		| PanelShape
		| undefined;
	if (target?.type !== "panel") return null;
	return parsePanelConfig(target.props.config).instanceId ?? null;
}
