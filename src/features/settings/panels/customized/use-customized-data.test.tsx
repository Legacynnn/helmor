import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
	AgentLoginStatusResult,
	ProviderConfigInspection,
} from "@/lib/api";
import { MCP_CATALOG, SKILL_CATALOG } from "./catalog";
import { useCustomizedData } from "./use-customized-data";

const apiMocks = vi.hoisted(() => ({
	getAgentLoginStatus: vi.fn(),
	getAgentCliStatus: vi.fn(),
	inspectProviderConfigs: vi.fn(),
	listForgeLogins: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		getAgentLoginStatus: apiMocks.getAgentLoginStatus,
		getAgentCliStatus: apiMocks.getAgentCliStatus,
		inspectProviderConfigs: apiMocks.inspectProviderConfigs,
		listForgeLogins: apiMocks.listForgeLogins,
	};
});

function inspection(
	provider: string,
	mcp: string[],
	skills: string[],
): ProviderConfigInspection {
	const entries = (names: string[]) =>
		names.map((name) => ({ name, source: "Config", path: null, detail: null }));
	return {
		provider,
		label: provider,
		roots: [],
		files: [],
		skills: entries(skills),
		hooks: [],
		mcpServers: entries(mcp),
		extensions: [],
		warnings: [],
	};
}

const LOGIN: AgentLoginStatusResult = {
	claude: true,
	codex: false,
	cursor: true,
	opencode: false,
	copilot: false,
	mimo: false,
	kimi: false,
};

function wrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
}

describe("useCustomizedData", () => {
	it("joins inventory and reflects install + readiness per provider", async () => {
		apiMocks.getAgentLoginStatus.mockResolvedValue(LOGIN);
		apiMocks.getAgentCliStatus.mockResolvedValue([]);
		apiMocks.inspectProviderConfigs.mockResolvedValue([
			inspection("claude", ["github"], ["thermo-nuclear-code-quality-review"]),
			inspection("codex", [], []),
		]);
		apiMocks.listForgeLogins.mockResolvedValue(["octocat"]);

		const { result } = renderHook(() => useCustomizedData(), {
			wrapper: wrapper(),
		});

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		const github = MCP_CATALOG.find((i) => i.id === "github")!;
		const thermo = SKILL_CATALOG.find(
			(i) => i.id === "thermo-nuclear-code-quality-review",
		)!;
		const playwright = MCP_CATALOG.find((i) => i.id === "playwright")!;

		// Installed where the inventory says so, by id match.
		expect(result.current.isInstalled(github, "claude")).toBe(true);
		expect(result.current.isInstalled(github, "codex")).toBe(false);
		expect(result.current.isInstalled(thermo, "claude")).toBe(true);
		expect(result.current.isInstalled(playwright, "claude")).toBe(false);

		// Readiness derives from login status: claude ready, codex not.
		expect(result.current.readyProvidersFor(github)).toEqual(["claude"]);

		// Provider cards: claude/codex installable, cursor view-only.
		const ids = result.current.providers.map((p) => p.id);
		expect(ids).toEqual(["claude", "codex", "cursor"]);
		expect(
			result.current.providers.find((p) => p.id === "cursor")?.installable,
		).toBe(false);

		// GitHub view-only inventory surfaces the CLI logins.
		expect(result.current.githubLogins).toEqual(["octocat"]);

		// "Installed overall" consolidates loaded items across providers, sorted
		// by name, linking the catalog entry for curated items.
		const inv = result.current.installedInventory;
		expect(inv.map((e) => e.name)).toEqual([
			"github",
			"thermo-nuclear-code-quality-review",
		]);
		const githubEntry = inv.find((e) => e.name === "github")!;
		expect(githubEntry.kind).toBe("mcp");
		expect(githubEntry.providers).toEqual(["claude"]);
		expect(githubEntry.catalogItem?.id).toBe("github");
	});

	it("merges providers for an item installed on both", async () => {
		apiMocks.getAgentLoginStatus.mockResolvedValue({ ...LOGIN, codex: true });
		apiMocks.getAgentCliStatus.mockResolvedValue([]);
		apiMocks.inspectProviderConfigs.mockResolvedValue([
			inspection("claude", ["github"], []),
			inspection("codex", ["github"], []),
		]);
		apiMocks.listForgeLogins.mockResolvedValue([]);

		const { result } = renderHook(() => useCustomizedData(), {
			wrapper: wrapper(),
		});
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		const inv = result.current.installedInventory;
		expect(inv).toHaveLength(1);
		expect(inv[0].providers).toEqual(["claude", "codex"]);
	});
});
