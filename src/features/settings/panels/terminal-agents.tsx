import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { terminalAgentIconByKey } from "@/features/terminals/agent-meta";
import type { TerminalAgentDetectedItem, TerminalAgentInfo } from "@/lib/api";
import {
	helmorQueryKeys,
	terminalAgentDetailsQueryOptions,
	terminalAgentsQueryOptions,
} from "@/lib/query-client";
import { SettingsGroup } from "../components/settings-row";

/** Terminal agents panel: every registry agent with detection state
 * (installed + version), live-status tier, and detected skills /
 * extensions / plugins. */
export function TerminalAgentsPanel() {
	const queryClient = useQueryClient();
	const agentsQuery = useQuery(terminalAgentsQueryOptions());
	const agents = agentsQuery.data ?? [];

	return (
		<SettingsGroup>
			<div className="flex items-center justify-between px-1 pb-1">
				<p className="text-small text-muted-foreground">
					Agent CLIs Helmor can run as terminal sessions. Installed agents
					appear in the panel's new-session menu.
				</p>
				<Button
					aria-label="Refresh detection"
					variant="ghost"
					size="icon-sm"
					className="shrink-0 text-muted-foreground hover:text-foreground"
					onClick={() => {
						void queryClient.invalidateQueries({
							queryKey: helmorQueryKeys.terminalAgents,
						});
						void queryClient.invalidateQueries({
							predicate: (query) =>
								query.queryKey[0] === "terminalAgentDetails",
						});
					}}
				>
					<RefreshCw className="size-3.5" strokeWidth={1.8} />
				</Button>
			</div>
			<div className="flex flex-col gap-1">
				{agents.map((agent) => (
					<TerminalAgentRow key={agent.id} agent={agent} />
				))}
				{agentsQuery.isPending ? (
					<p className="px-1 py-2 text-small text-muted-foreground">
						Detecting installed agents…
					</p>
				) : null}
			</div>
		</SettingsGroup>
	);
}

function TerminalAgentRow({ agent }: { agent: TerminalAgentInfo }) {
	const [expanded, setExpanded] = useState(false);
	const Icon = terminalAgentIconByKey(agent.iconKey);
	const detectedCount =
		agent.skillCount + agent.extensionCount + agent.pluginCount;
	const detailsQuery = useQuery({
		...terminalAgentDetailsQueryOptions(agent.id),
		enabled: expanded,
	});
	const details = detailsQuery.data;

	return (
		<div className="rounded-lg border border-border/60 bg-card/40">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left"
			>
				{expanded ? (
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="size-3 shrink-0 text-muted-foreground" />
				)}
				<Icon className="size-4 shrink-0" />
				<span className="min-w-0 flex-1 truncate text-ui font-medium">
					{agent.displayName}
				</span>
				{agent.firstClass ? (
					<span className="shrink-0 rounded-sm bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
						Live status via hooks
					</span>
				) : null}
				{detectedCount > 0 ? (
					<span className="shrink-0 rounded-sm bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
						{detectedCount} add-ons
					</span>
				) : null}
				<span className="shrink-0 text-small text-muted-foreground">
					{agent.installed ? (agent.version ?? "Installed") : "Not installed"}
				</span>
			</button>
			{expanded ? (
				<div className="flex flex-col gap-2 border-t border-border/40 px-3 py-2.5">
					{agent.binaryPath ? (
						<p className="truncate font-mono text-[11px] text-muted-foreground">
							{agent.binaryPath}
						</p>
					) : null}
					{details ? (
						<>
							<DetectedItemList label="Skills" items={details.skills} />
							<DetectedItemList label="Extensions" items={details.extensions} />
							<DetectedItemList label="Plugins" items={details.plugins} />
							{details.skills.length === 0 &&
							details.extensions.length === 0 &&
							details.plugins.length === 0 ? (
								<p className="text-small text-muted-foreground">
									No skills, extensions, or plugins detected.
								</p>
							) : null}
						</>
					) : detailsQuery.isPending ? (
						<p className="text-small text-muted-foreground">Scanning…</p>
					) : null}
					<a
						href={agent.docsUrl}
						target="_blank"
						rel="noreferrer"
						className="flex w-fit cursor-pointer items-center gap-1 text-small text-muted-foreground hover:text-foreground"
					>
						<ExternalLink className="size-3" strokeWidth={1.8} />
						Documentation
					</a>
				</div>
			) : null}
		</div>
	);
}

function DetectedItemList({
	label,
	items,
}: {
	label: string;
	items: TerminalAgentDetectedItem[];
}) {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{label} ({items.length})
			</p>
			<div className="flex flex-wrap gap-1">
				{items.map((item) => (
					<span
						key={item.path + item.name}
						title={item.path}
						className="rounded-sm bg-accent/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
					>
						{item.name}
					</span>
				))}
			</div>
		</div>
	);
}
