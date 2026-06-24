import type { CustomizedProvider } from "@/lib/api";

// The day-one curated catalog for the Customized hub. Treat this as a seed —
// the arrays are trivially extensible. Every entry is tagged with the providers
// it supports (Claude + Codex only; Cursor/GitHub CLI are view-only).

export type McpInstallSpec = {
	/** The value written under `mcpServers[id]` / `[mcp_servers.id]`. */
	config: Record<string, unknown>;
};

export type SkillInstallSpec = {
	/**
	 * `skills` registry slug for remote skills. Omit for Helmor-vendored skills
	 * (installed from embedded, provider-adapted copies on the Rust side).
	 */
	remoteSource?: string;
};

export type CatalogItem = {
	id: string;
	name: string;
	description: string;
	providers: CustomizedProvider[];
} & (
	| { kind: "mcp"; install: McpInstallSpec }
	| { kind: "skill"; install: SkillInstallSpec }
);

const ALL: CustomizedProvider[] = ["claude", "codex"];

export const MCP_CATALOG: CatalogItem[] = [
	{
		id: "github",
		name: "GitHub",
		description: "Repos, issues, PRs, and code search over MCP.",
		kind: "mcp",
		providers: ALL,
		install: {
			config: {
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-github"],
			},
		},
	},
	{
		id: "filesystem",
		name: "Filesystem",
		description: "Scoped read/write access to project directories.",
		kind: "mcp",
		providers: ALL,
		install: {
			config: {
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-filesystem"],
			},
		},
	},
	{
		id: "fetch",
		name: "Fetch",
		description: "Read web pages and docs as Markdown.",
		kind: "mcp",
		providers: ALL,
		install: {
			config: { command: "uvx", args: ["mcp-server-fetch"] },
		},
	},
	{
		id: "context7",
		name: "Context7",
		description: "Live, version-correct library and framework docs.",
		kind: "mcp",
		providers: ALL,
		install: {
			config: { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
		},
	},
	{
		id: "playwright",
		name: "Playwright",
		description: "Browser automation and page inspection tools.",
		kind: "mcp",
		providers: ALL,
		install: {
			config: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
		},
	},
];

export const SKILL_CATALOG: CatalogItem[] = [
	{
		id: "thermo-nuclear-code-quality-review",
		name: "Thermo-nuclear code quality review",
		description:
			"Extremely strict maintainability & abstraction audit (Helmor-vendored, provider-adapted).",
		kind: "skill",
		providers: ALL,
		// No remoteSource → installed from embedded, provider-adapted copies.
		install: {},
	},
	{
		id: "git-commit-writer",
		name: "git-commit-writer",
		description: "Structured, conventional commit messages from your diff.",
		kind: "skill",
		providers: ALL,
		install: { remoteSource: "git-commit-writer" },
	},
	{
		id: "pr-description-writer",
		name: "pr-description-writer",
		description: "Fills PR bodies from the diff.",
		kind: "skill",
		providers: ALL,
		install: { remoteSource: "pr-description-writer" },
	},
	{
		id: "deep-research",
		name: "deep-research",
		description: "Multi-source research and synthesis.",
		kind: "skill",
		providers: ALL,
		install: { remoteSource: "deep-research" },
	},
];

export const CATALOG: CatalogItem[] = [...MCP_CATALOG, ...SKILL_CATALOG];
