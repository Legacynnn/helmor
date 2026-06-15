export type SessionProviderGroup = "hybrid" | "guiOnly" | "terminalOnly";

export type TerminalInstallInfo = {
	url: string | null;
	commands: readonly string[];
};

export type SessionProviderCatalogEntry = {
	key: string;
	label: string;
	group: SessionProviderGroup;
	binary: string | null;
	terminal: boolean;
	gui: boolean;
	install: TerminalInstallInfo;
};

export const SESSION_PROVIDER_CATALOG: readonly SessionProviderCatalogEntry[] =
	[
		{
			key: "claude",
			label: "Claude Code",
			group: "hybrid",
			binary: "claude",
			terminal: true,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "codex",
			label: "Codex",
			group: "hybrid",
			binary: "codex",
			terminal: true,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "opencode",
			label: "OpenCode",
			group: "hybrid",
			binary: "opencode",
			terminal: true,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "mimo",
			label: "MiMo Code",
			group: "hybrid",
			binary: "mimo",
			terminal: true,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "cursor",
			label: "Cursor",
			group: "guiOnly",
			binary: null,
			terminal: false,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "copilot",
			label: "GitHub Copilot",
			group: "guiOnly",
			binary: null,
			terminal: false,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "kimi",
			label: "Kimi",
			group: "guiOnly",
			binary: "kimi",
			terminal: false,
			gui: true,
			install: { url: null, commands: [] },
		},
		{
			key: "pi",
			label: "Pi",
			group: "terminalOnly",
			binary: "pi",
			terminal: true,
			gui: false,
			install: { url: null, commands: [] },
		},
		{
			key: "amp",
			label: "Amp",
			group: "terminalOnly",
			binary: "amp",
			terminal: true,
			gui: false,
			install: {
				url: "https://ampcode.com/manual",
				commands: ["npm install -g @ampcode/cli"],
			},
		},
		{
			key: "aider",
			label: "Aider",
			group: "terminalOnly",
			binary: "aider",
			terminal: true,
			gui: false,
			install: {
				url: "https://aider.chat/docs/install.html",
				commands: ["python -m pip install aider-install", "aider-install"],
			},
		},
		{
			key: "gemini",
			label: "Gemini CLI",
			group: "terminalOnly",
			binary: "gemini",
			terminal: true,
			gui: false,
			install: {
				url: "https://github.com/google-gemini/gemini-cli",
				commands: ["npm install -g @google/gemini-cli"],
			},
		},
		{
			key: "qwen",
			label: "Qwen Code",
			group: "terminalOnly",
			binary: "qwen",
			terminal: true,
			gui: false,
			install: {
				url: "https://github.com/QwenLM/qwen-code",
				commands: ["npm install -g @qwen-code/qwen-code"],
			},
		},
		{
			key: "goose",
			label: "Goose",
			group: "terminalOnly",
			binary: "goose",
			terminal: true,
			gui: false,
			install: {
				url: "https://goose-docs.ai/docs/getting-started/installation/",
				commands: ["brew install block-goose-cli"],
			},
		},
		{
			key: "crush",
			label: "Crush",
			group: "terminalOnly",
			binary: "crush",
			terminal: true,
			gui: false,
			install: {
				url: "https://github.com/charmbracelet/crush",
				commands: ["go install github.com/charmbracelet/crush@latest"],
			},
		},
		{
			key: "plandex",
			label: "Plandex",
			group: "terminalOnly",
			binary: "plandex",
			terminal: true,
			gui: false,
			install: {
				url: "https://docs.plandex.ai/install/",
				commands: ["curl -fsSL https://plandex.ai/install.sh | bash"],
			},
		},
	];

export function findSessionProviderCatalogEntry(
	key: string | null | undefined,
): SessionProviderCatalogEntry | null {
	if (!key) return null;
	return SESSION_PROVIDER_CATALOG.find((entry) => entry.key === key) ?? null;
}

export function sessionProviderLabel(key: string | null | undefined): string {
	return findSessionProviderCatalogEntry(key)?.label ?? key ?? "Terminal";
}
