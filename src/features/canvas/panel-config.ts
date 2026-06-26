// Typed access to a panel's opaque `config` JSON (persisted in
// `canvas_panels.config`). Each panel type owns its own shape:
//   - conversation: { sessionId }    — bound Helmor session (created on add)
//   - terminal:     { instanceId }   — PTY instance key (panel-scoped UUID)
//   - notes:        { notes }        — markdown body
//   - drawing:      { drawing }      — serialized tldraw document snapshot
//   - editor:       { filePath }     — workspace-relative file under edit
//   - file-manager: { rootSubpath }  — optional sub-directory to scope to
// Unknown / malformed config degrades to an empty object.

export type ConversationPanelConfig = {
	sessionId?: string;
};

export type TerminalPanelConfig = {
	instanceId?: string;
};

export type NotesPanelConfig = {
	notes?: string;
};

export type DrawingPanelConfig = {
	/** JSON.stringify of a tldraw `getSnapshot()` document. */
	drawing?: string;
};

export type EditorPanelConfig = {
	/** Workspace-root-relative path of the file being edited. */
	filePath?: string;
};

export type FileManagerPanelConfig = {
	/** Optional sub-directory (relative to the workspace root) to scope to. */
	rootSubpath?: string;
};

export type CommonPanelConfig = {
	/** Per-panel translucency override (0..1). When unset the panel inherits
	 * the canvas-wide translucency. */
	opacity?: number;
};

export type PanelConfig = ConversationPanelConfig &
	TerminalPanelConfig &
	NotesPanelConfig &
	DrawingPanelConfig &
	EditorPanelConfig &
	FileManagerPanelConfig &
	CommonPanelConfig;

export function parsePanelConfig(raw: string | null | undefined): PanelConfig {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as PanelConfig) : {};
	} catch {
		return {};
	}
}

export function stringifyPanelConfig(config: PanelConfig): string {
	return JSON.stringify(config);
}
