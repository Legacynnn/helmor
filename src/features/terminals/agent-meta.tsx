import { SquareTerminal } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import {
	AmpIcon,
	ClaudeIcon,
	CursorIcon,
	GeminiCliIcon,
	GithubCopilotIcon,
	GooseIcon,
	OpenAIIcon,
	OpenCodeIcon,
	PiIcon,
} from "@/components/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** iconKey (from the Rust registry / `TerminalAgentInfo.iconKey`) → icon. */
const ICONS_BY_KEY: Record<string, IconComponent> = {
	claude: ClaudeIcon,
	pi: PiIcon,
	openai: OpenAIIcon,
	amp: AmpIcon,
	opencode: OpenCodeIcon,
	gemini: GeminiCliIcon,
	cursor: CursorIcon,
	copilot: GithubCopilotIcon,
	aider: SquareTerminal,
	goose: GooseIcon,
};

/** agentId (stored in `sessions.agentType` for terminal rows) → iconKey.
 * Mirrors the Rust registry so tabs render without an extra IPC fetch. */
const ICON_KEY_BY_AGENT_ID: Record<string, string> = {
	"claude-code": "claude",
	pi: "pi",
	codex: "openai",
	amp: "amp",
	opencode: "opencode",
	gemini: "gemini",
	"cursor-agent": "cursor",
	copilot: "copilot",
	aider: "aider",
	goose: "goose",
};

const LABEL_BY_AGENT_ID: Record<string, string> = {
	"claude-code": "Claude Code",
	pi: "pi",
	codex: "Codex CLI",
	amp: "Amp",
	opencode: "OpenCode",
	gemini: "Gemini CLI",
	"cursor-agent": "Cursor Agent",
	copilot: "Copilot CLI",
	aider: "Aider",
	goose: "Goose",
};

export function terminalAgentIconByKey(iconKey: string): IconComponent {
	return ICONS_BY_KEY[iconKey] ?? SquareTerminal;
}

export function terminalAgentIcon(
	agentId: string | null | undefined,
): IconComponent {
	if (!agentId) return SquareTerminal;
	return terminalAgentIconByKey(ICON_KEY_BY_AGENT_ID[agentId] ?? "");
}

export function terminalAgentLabel(agentId: string | null | undefined): string {
	if (!agentId) return "Terminal";
	return LABEL_BY_AGENT_ID[agentId] ?? agentId;
}
