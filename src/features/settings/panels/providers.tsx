import { useIsMutating, useQuery } from "@tanstack/react-query";
import { Bot, Hammer, Route, Terminal } from "lucide-react";
import type { ElementType } from "react";
import { useRef } from "react";
import {
	AmpIcon,
	ClaudeColorIcon,
	CursorIcon,
	GeminiCliIcon,
	GithubCopilotIcon,
	GooseIcon,
	KimiIcon,
	MiMoCodeIcon,
	OpenAIIcon,
	OpenCodeIcon,
	PiIcon,
	QwenIcon,
} from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	type AgentCliStatus,
	getAgentCliStatus,
	getAgentLoginStatus,
	inspectProviderConfigs,
	type ProviderConfigInspection,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { SettingsGroup } from "../components/settings-row";
import { AgentProxyPanel } from "./model-providers";
import {
	CLAUDE_ADAPTER,
	CODEX_ADAPTER,
	KIMI_CONFIG_ADAPTER,
	MIMO_CONFIG_ADAPTER,
	OPENCODE_CONFIG_ADAPTER,
} from "./providers/adapters";
import {
	CopilotModels,
	type CopilotModelsHandle,
} from "./providers/copilot-models";
import { CursorCardBody } from "./providers/cursor-card-body";
import { CustomProvidersList } from "./providers/custom-providers-list";
import { KimiModels } from "./providers/kimi-models";
import { LoginGate } from "./providers/login-gate";
import {
	SlugProviderModels,
	type SlugProviderModelsHandle,
} from "./providers/opencode-models";
import type { ProviderConfigAdapter } from "./providers/provider-config";
import { ProviderConfigRow, ProviderRow } from "./providers/provider-row";
import { ProviderConfigSection } from "./providers/provider-section";
import {
	MIMO_ADAPTER,
	OPENCODE_ADAPTER,
	type SlugProviderAdapter,
} from "./providers/slug-provider-adapter";
import { useKimiModelSync } from "./providers/use-kimi-model-sync";

// SettingsDialog renders outside AppShell's TooltipProvider, so wrap our own.
export function ProvidersPanel() {
	const statusQuery = useQuery({
		queryKey: helmorQueryKeys.agentLoginStatus,
		queryFn: getAgentLoginStatus,
	});
	const status = statusQuery.data;
	const cliStatusQuery = useQuery({
		queryKey: helmorQueryKeys.agentCliStatus,
		queryFn: getAgentCliStatus,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const cliStatus = cliStatusQuery.data ?? [];
	const statusFor = (provider: string) =>
		cliStatus.find((status) => status.provider === provider) ?? null;
	const inspectionQuery = useQuery({
		queryKey: helmorQueryKeys.providerConfigInspections,
		queryFn: inspectProviderConfigs,
		staleTime: 30_000,
	});
	const inspections = inspectionQuery.data ?? [];
	const inspectionFor = (provider: string) =>
		inspections.find((inspection) => inspection.provider === provider) ?? null;
	const copilotModelsRef = useRef<CopilotModelsHandle | null>(null);

	// First status fetch in flight → show "Connecting…" instead of a premature
	// "Log in". opencode-protocol providers also stay connecting while a model
	// sync (server boot) runs, since their readiness is derived from that
	// fetch's cache.
	const statusLoading = statusQuery.isLoading;
	const copilotSyncing =
		useIsMutating({ mutationKey: ["copilotModelSync"] }) > 0;
	// Kimi's isSyncing is already global (useIsMutating inside the hook), so a
	// sync from any panel spins this row too; sync after login so the models
	// panel isn't empty until a manual Sync.
	const { sync: syncKimiModels, isSyncing: kimiSyncing } = useKimiModelSync();

	const refetchStatus = () => {
		void statusQuery.refetch();
	};

	return (
		<TooltipProvider>
			<SettingsGroup>
				<SlugProviderRow
					adapter={OPENCODE_ADAPTER}
					configAdapter={OPENCODE_CONFIG_ADAPTER}
					icon={OpenCodeIcon}
					cliStatus={statusFor("opencode")}
					inspection={inspectionFor("opencode")}
					ready={Boolean(status?.opencode)}
					statusLoading={statusLoading}
					onRefetchStatus={refetchStatus}
				/>
				<SlugProviderRow
					adapter={MIMO_ADAPTER}
					configAdapter={MIMO_CONFIG_ADAPTER}
					icon={MiMoCodeIcon}
					cliStatus={statusFor("mimo")}
					inspection={inspectionFor("mimo")}
					ready={Boolean(status?.mimo)}
					statusLoading={statusLoading}
					onRefetchStatus={refetchStatus}
				/>
				<ProviderRow
					icon={ClaudeColorIcon}
					name="Claude Code"
					description="Anthropic's local coding agent. Supports GUI chat sessions and live terminal sessions."
					binaryName={statusFor("claude")?.binary}
					version={statusFor("claude")?.version}
					cliSource={statusFor("claude")?.source}
					binaryPath={statusFor("claude")?.path}
					installUrl={statusFor("claude")?.installUrl}
					installCommands={statusFor("claude")?.installCommands}
					inspection={inspectionFor("claude")}
					ready={Boolean(status?.claude)}
					connecting={statusLoading}
					loginProvider="claude"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigSection adapter={CLAUDE_ADAPTER} />
				</ProviderRow>
				<ProviderRow
					icon={OpenAIIcon}
					name="Codex"
					description="OpenAI's local coding agent. Supports GUI chat sessions and live terminal sessions."
					binaryName={statusFor("codex")?.binary}
					version={statusFor("codex")?.version}
					cliSource={statusFor("codex")?.source}
					binaryPath={statusFor("codex")?.path}
					installUrl={statusFor("codex")?.installUrl}
					installCommands={statusFor("codex")?.installCommands}
					inspection={inspectionFor("codex")}
					ready={Boolean(status?.codex)}
					connecting={statusLoading}
					loginProvider="codex"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigSection adapter={CODEX_ADAPTER} />
				</ProviderRow>
				<ProviderRow
					icon={KimiIcon}
					name="Kimi"
					description="Moonshot's Kimi coding agent over ACP with configurable model providers."
					binaryName={statusFor("kimi")?.binary}
					version={statusFor("kimi")?.version}
					cliSource={statusFor("kimi")?.source}
					binaryPath={statusFor("kimi")?.path}
					installUrl={statusFor("kimi")?.installUrl}
					installCommands={statusFor("kimi")?.installCommands}
					inspection={inspectionFor("kimi")}
					ready={Boolean(status?.kimi)}
					connecting={statusLoading || kimiSyncing}
					loginProvider="kimi"
					onLoginExit={() => {
						refetchStatus();
						void syncKimiModels().catch(() => {});
					}}
					collapsible
				>
					{/* Kimi runs over ACP, which rejects every session until you sign in
					    — even custom providers. Lock the whole section until then. */}
					<LoginGate
						locked={!statusLoading && !status?.kimi}
						message="Sign in to Kimi to use it — even custom providers require login. Use the “Log in” button above."
					>
						<ProviderConfigRow
							label="Models"
							description="Pick which Kimi models appear in the composer's picker."
						>
							<KimiModels />
						</ProviderConfigRow>
						<ProviderConfigRow
							label="Custom Providers"
							description={KIMI_CONFIG_ADAPTER.customProvidersDescription}
						>
							<CustomProvidersList adapter={KIMI_CONFIG_ADAPTER} />
						</ProviderConfigRow>
					</LoginGate>
				</ProviderRow>
				<ProviderRow
					icon={GithubCopilotIcon}
					name="GitHub Copilot"
					description="GitHub Copilot models routed through Helmor's chat UI."
					binaryName={statusFor("copilot")?.binary}
					cliSource={statusFor("copilot")?.source}
					inspection={inspectionFor("copilot")}
					ready={Boolean(status?.copilot)}
					connecting={statusLoading || copilotSyncing}
					loginProvider="copilot"
					onLoginExit={() => {
						refetchStatus();
						copilotModelsRef.current?.refresh();
					}}
					collapsible
				>
					<ProviderConfigRow
						label="Models"
						description="Pick which models appear in the composer's picker."
					>
						<CopilotModels ref={copilotModelsRef} />
					</ProviderConfigRow>
				</ProviderRow>
				<ProviderRow
					icon={CursorIcon}
					name="Cursor"
					description="Cursor model access configured with an API key in Helmor."
					binaryName={statusFor("cursor")?.binary}
					cliSource={statusFor("cursor")?.source}
					inspection={inspectionFor("cursor")}
					ready={Boolean(status?.cursor)}
					loginProvider={null}
					collapsible
				>
					<ProviderConfigRow description="Add your API key, then pick which models appear in the composer's picker.">
						<CursorCardBody />
					</ProviderConfigRow>
				</ProviderRow>
				<AgentProxyPanel />
				<TerminalCliRows statuses={cliStatus} inspectionFor={inspectionFor} />
			</SettingsGroup>
		</TooltipProvider>
	);
}

// Row for an opencode-protocol provider (OpenCode / MiMo Code): Models picker
// + Custom Providers editor, wired through the provider's adapter.
function SlugProviderRow({
	adapter,
	configAdapter,
	icon,
	cliStatus,
	inspection,
	ready,
	statusLoading,
	onRefetchStatus,
}: {
	adapter: SlugProviderAdapter;
	configAdapter: ProviderConfigAdapter;
	icon: ElementType<{ className?: string }>;
	cliStatus: AgentCliStatus | null;
	inspection: ProviderConfigInspection | null;
	ready: boolean;
	statusLoading: boolean;
	onRefetchStatus: () => void;
}) {
	const modelsRef = useRef<SlugProviderModelsHandle | null>(null);
	const syncing =
		useIsMutating({ mutationKey: [...adapter.modelSyncMutationKey] }) > 0;

	return (
		<ProviderRow
			icon={icon}
			name={adapter.displayName}
			description={
				adapter.provider === "opencode"
					? "OpenCode-compatible coding agent with provider models from its local config."
					: "MiMo Code, an OpenCode-compatible coding agent with provider models from its local config."
			}
			binaryName={cliStatus?.binary}
			version={cliStatus?.version}
			cliSource={cliStatus?.source}
			binaryPath={cliStatus?.path}
			installUrl={cliStatus?.installUrl}
			installCommands={cliStatus?.installCommands}
			inspection={inspection}
			ready={ready}
			connecting={statusLoading || syncing}
			loginProvider={adapter.provider}
			onLoginExit={() => {
				onRefetchStatus();
				modelsRef.current?.refresh();
			}}
			collapsible
		>
			<ProviderConfigRow
				label="Models"
				description="Pick which models appear in the composer's picker."
			>
				<SlugProviderModels adapter={adapter} ref={modelsRef} />
			</ProviderConfigRow>
			<ProviderConfigRow
				label="Custom Providers"
				description={configAdapter.customProvidersDescription}
			>
				<CustomProvidersList adapter={configAdapter} />
			</ProviderConfigRow>
		</ProviderRow>
	);
}

function TerminalCliRows({
	statuses,
	inspectionFor,
}: {
	statuses: readonly AgentCliStatus[];
	inspectionFor: (provider: string) => ProviderConfigInspection | null;
}) {
	const terminalStatuses = statuses.filter((status) =>
		[
			"pi",
			"amp",
			"aider",
			"gemini",
			"qwen",
			"goose",
			"crush",
			"plandex",
		].includes(status.provider),
	);
	if (terminalStatuses.length === 0) return null;
	return (
		<div className="py-6">
			<div className="mb-3 pl-1">
				<div className="text-ui font-medium leading-snug text-foreground">
					Terminal CLIs
				</div>
				<div className="mt-1 max-w-[62ch] text-small leading-snug text-muted-foreground">
					Direct terminal sessions for agents that run only as command-line
					tools.
				</div>
			</div>
			<div className="divide-y divide-border/40 rounded-md border border-border/60 bg-muted/15 px-3">
				{terminalStatuses.map((status) => (
					<ProviderRow
						key={status.provider}
						icon={TERMINAL_PROVIDER_ICONS[status.provider] ?? Terminal}
						name={status.label}
						description={TERMINAL_PROVIDER_DESCRIPTIONS[status.provider]}
						binaryName={status.binary}
						version={status.version}
						cliSource={status.source}
						binaryPath={status.path}
						installUrl={status.installUrl}
						installCommands={status.installCommands}
						inspection={inspectionFor(status.provider)}
						detailsVariant="expanded"
						ready={status.installed}
						loginProvider={null}
						collapsible
					/>
				))}
			</div>
		</div>
	);
}

const TERMINAL_PROVIDER_ICONS: Record<
	string,
	ElementType<{ className?: string }>
> = {
	pi: PiIcon,
	amp: AmpIcon,
	gemini: GeminiCliIcon,
	qwen: QwenIcon,
	goose: GooseIcon,
	aider: Bot,
	crush: Hammer,
	plandex: Route,
};

const TERMINAL_PROVIDER_DESCRIPTIONS: Record<string, string> = {
	pi: "Terminal-only coding CLI.",
	amp: "Amp's terminal coding agent.",
	aider: "Terminal coding assistant for pair-programming in a repository.",
	gemini: "Google Gemini's terminal coding agent.",
	qwen: "Qwen Code terminal agent.",
	goose: "Block's Goose terminal automation agent.",
	crush: "Charmbracelet's terminal coding agent.",
	plandex: "Terminal planning and implementation agent.",
};
