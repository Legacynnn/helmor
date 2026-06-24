import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	type CustomizedProvider,
	getAgentCliStatus,
	getAgentLoginStatus,
	inspectProviderConfigs,
	installCatalogSkill,
	installMcpServer,
	listForgeLogins,
	type ProviderConfigInspection,
	uninstallCatalogSkill,
	uninstallMcpServer,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { CATALOG, type CatalogItem } from "./catalog";

export type ConnectedProvider = {
	id: string;
	label: string;
	ready: boolean;
	/** Whether this provider supports one-click installs (Claude/Codex). */
	installable: boolean;
	skills: ProviderConfigInspection["skills"];
	mcpServers: ProviderConfigInspection["mcpServers"];
};

/** One installed item, consolidated across providers (the "installed overall"
 * view). Includes items not in the curated catalog. */
export type InstalledEntry = {
	name: string;
	kind: "mcp" | "skill";
	/** Provider ids (claude/codex) this item is installed on. */
	providers: CustomizedProvider[];
	/** Where it came from (e.g. "Global config", "Claude skills"). */
	source: string | null;
	/** Matching catalog entry, if this is a curated item. */
	catalogItem: CatalogItem | null;
};

export type CustomizedData = {
	isLoading: boolean;
	providers: ConnectedProvider[];
	installedInventory: InstalledEntry[];
	githubLogins: string[];
	/** Is a catalog item installed for a given provider (matched by id)? */
	isInstalled: (item: CatalogItem, provider: CustomizedProvider) => boolean;
	/** Eligible providers for an item that are connected/ready. */
	readyProvidersFor: (item: CatalogItem) => CustomizedProvider[];
	install: (
		item: CatalogItem,
		providers: CustomizedProvider[],
	) => Promise<void>;
	uninstall: (
		item: CatalogItem,
		providers: CustomizedProvider[],
	) => Promise<void>;
	isMutating: boolean;
};

const INSTALLABLE: { id: CustomizedProvider; label: string }[] = [
	{ id: "claude", label: "Claude (Anthropic SDK)" },
	{ id: "codex", label: "Codex (OpenAI SDK)" },
];

const VIEW_ONLY: { id: string; label: string }[] = [
	{ id: "cursor", label: "Cursor" },
];

function entryMatches(
	entries: ProviderConfigInspection["mcpServers"],
	id: string,
): boolean {
	const target = id.toLowerCase();
	return entries.some((entry) => entry.name.toLowerCase() === target);
}

export function useCustomizedData(): CustomizedData {
	const queryClient = useQueryClient();

	const loginQuery = useQuery({
		queryKey: helmorQueryKeys.agentLoginStatus,
		queryFn: getAgentLoginStatus,
	});
	const cliQuery = useQuery({
		queryKey: helmorQueryKeys.agentCliStatus,
		queryFn: getAgentCliStatus,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const inspectionQuery = useQuery({
		queryKey: helmorQueryKeys.providerConfigInspections,
		queryFn: inspectProviderConfigs,
		staleTime: 30_000,
	});
	const githubQuery = useQuery({
		queryKey: helmorQueryKeys.customizedGithubLogins,
		queryFn: () => listForgeLogins("github", "github.com"),
		staleTime: 60_000,
	});

	const inspections = inspectionQuery.data ?? [];
	const login = loginQuery.data;
	const cliStatus = cliQuery.data ?? [];

	const inspectionFor = useCallback(
		(provider: string): ProviderConfigInspection | null =>
			inspections.find((entry) => entry.provider === provider) ?? null,
		[inspections],
	);

	const readyFor = useCallback(
		(provider: string): boolean => {
			switch (provider) {
				case "claude":
					return Boolean(login?.claude);
				case "codex":
					return Boolean(login?.codex);
				case "cursor":
					return Boolean(login?.cursor);
				default:
					return (
						cliStatus.find((s) => s.provider === provider)?.installed ?? false
					);
			}
		},
		[login, cliStatus],
	);

	const providers: ConnectedProvider[] = [
		...INSTALLABLE.map((p) => {
			const inspection = inspectionFor(p.id);
			return {
				id: p.id,
				label: p.label,
				ready: readyFor(p.id),
				installable: true,
				skills: inspection?.skills ?? [],
				mcpServers: inspection?.mcpServers ?? [],
			};
		}),
		...VIEW_ONLY.map((p) => {
			const inspection = inspectionFor(p.id);
			return {
				id: p.id,
				label: p.label,
				ready: readyFor(p.id),
				installable: false,
				skills: inspection?.skills ?? [],
				mcpServers: inspection?.mcpServers ?? [],
			};
		}),
	];

	// "Installed overall": merge every loaded skill / MCP across the installable
	// providers, keyed by (kind, lowercased name), recording which providers have
	// it and linking the catalog entry when one matches by id.
	const catalogByKey = new Map(
		CATALOG.map((item) => [`${item.kind}:${item.id.toLowerCase()}`, item]),
	);
	const installedMap = new Map<string, InstalledEntry>();
	for (const p of INSTALLABLE) {
		const inspection = inspectionFor(p.id);
		if (!inspection) continue;
		const collect = (
			entries: ProviderConfigInspection["mcpServers"],
			kind: "mcp" | "skill",
		) => {
			for (const entry of entries) {
				const key = `${kind}:${entry.name.toLowerCase()}`;
				const existing = installedMap.get(key);
				if (existing) {
					if (!existing.providers.includes(p.id)) existing.providers.push(p.id);
					continue;
				}
				installedMap.set(key, {
					name: entry.name,
					kind,
					providers: [p.id],
					source: entry.source || entry.detail || null,
					catalogItem: catalogByKey.get(key) ?? null,
				});
			}
		};
		collect(inspection.mcpServers, "mcp");
		collect(inspection.skills, "skill");
	}
	const installedInventory = [...installedMap.values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	const isInstalled = useCallback(
		(item: CatalogItem, provider: CustomizedProvider): boolean => {
			const inspection = inspectionFor(provider);
			if (!inspection) return false;
			const entries =
				item.kind === "mcp" ? inspection.mcpServers : inspection.skills;
			return entryMatches(entries, item.id);
		},
		[inspectionFor],
	);

	const readyProvidersFor = useCallback(
		(item: CatalogItem): CustomizedProvider[] =>
			item.providers.filter((p) => readyFor(p)),
		[readyFor],
	);

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.providerConfigInspections,
		});
	}, [queryClient]);

	const installMutation = useMutation({
		mutationKey: ["customized", "install"],
		mutationFn: async ({
			item,
			providers: targets,
		}: {
			item: CatalogItem;
			providers: CustomizedProvider[];
		}) => {
			if (item.kind === "mcp") {
				await Promise.all(
					targets.map((provider) =>
						installMcpServer(provider, item.id, item.install.config),
					),
				);
				return;
			}
			await installCatalogSkill({
				skillId: item.id,
				providers: targets,
				remoteSource: item.install.remoteSource,
			});
		},
		onSettled: invalidate,
	});

	const uninstallMutation = useMutation({
		mutationKey: ["customized", "uninstall"],
		mutationFn: async ({
			item,
			providers: targets,
		}: {
			item: CatalogItem;
			providers: CustomizedProvider[];
		}) => {
			if (item.kind === "mcp") {
				await Promise.all(
					targets.map((provider) => uninstallMcpServer(provider, item.id)),
				);
				return;
			}
			await uninstallCatalogSkill(item.id, targets);
		},
		onSettled: invalidate,
	});

	return {
		isLoading:
			loginQuery.isLoading || cliQuery.isLoading || inspectionQuery.isLoading,
		providers,
		installedInventory,
		githubLogins: githubQuery.data ?? [],
		isInstalled,
		readyProvidersFor,
		install: (item, targets) =>
			installMutation.mutateAsync({ item, providers: targets }),
		uninstall: (item, targets) =>
			uninstallMutation.mutateAsync({ item, providers: targets }),
		isMutating: installMutation.isPending || uninstallMutation.isPending,
	};
}
