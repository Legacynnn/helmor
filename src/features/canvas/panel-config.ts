// Typed access to a panel's opaque `config` JSON (persisted in
// `canvas_panels.config`). Each panel type owns its own shape:
//   - conversation: { sessionId }   — bound Helmor session (created on add)
//   - terminal:     { instanceId }  — PTY instance key (panel-scoped UUID)
// Unknown / malformed config degrades to an empty object.

export type ConversationPanelConfig = {
	sessionId?: string;
};

export type TerminalPanelConfig = {
	instanceId?: string;
};

export type PanelConfig = ConversationPanelConfig & TerminalPanelConfig;

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
