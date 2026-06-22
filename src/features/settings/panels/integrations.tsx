import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCcw, SquareArrowOutUpRight, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { LinearBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	connectIntegration,
	disconnectIntegration,
	getIntegrationStatus,
	type IntegrationProvider,
	type IntegrationStatus,
	setIntegrationTeam,
} from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { helmorQueryKeys } from "@/lib/query-client";
import {
	SettingsGroup,
	SettingsNotice,
	SettingsRow,
} from "../components/settings-row";
import {
	SettingsSelect,
	type SettingsSelectOption,
} from "../components/settings-select";

const LINEAR_API_KEYS_URL = "https://linear.app/settings/account/security";

export function IntegrationsPanel() {
	return (
		<SettingsGroup>
			<LinearIntegrationCard />
		</SettingsGroup>
	);
}

function LinearIntegrationCard() {
	const provider: IntegrationProvider = "linear";
	const queryClient = useQueryClient();
	const statusQuery = useQuery({
		queryKey: helmorQueryKeys.integrationStatus(provider),
		queryFn: () => getIntegrationStatus(provider),
	});
	const status = statusQuery.data;
	const connected = status?.connected ?? false;

	const [keyDraft, setKeyDraft] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Clear the draft once a connection succeeds (we never echo the stored key).
	useEffect(() => {
		if (connected) setKeyDraft("");
	}, [connected]);

	const setStatus = (next: IntegrationStatus) => {
		queryClient.setQueryData(helmorQueryKeys.integrationStatus(provider), next);
	};

	const connectMutation = useMutation({
		mutationFn: (apiKey: string) => connectIntegration(provider, apiKey),
		onSuccess: (next) => {
			setError(null);
			setKeyDraft("");
			setStatus(next);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : String(err));
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => disconnectIntegration(provider),
		onSuccess: () => {
			setError(null);
			void statusQuery.refetch();
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : String(err));
		},
	});

	const teamMutation = useMutation({
		mutationFn: (team: { id: string; name: string }) =>
			setIntegrationTeam(provider, team.id, team.name),
		onSuccess: () => void statusQuery.refetch(),
	});

	function commitKey() {
		const next = keyDraft.trim();
		if (!next || connectMutation.isPending) return;
		connectMutation.mutate(next);
	}

	const teamOptions: SettingsSelectOption<string>[] = (status?.teams ?? []).map(
		(team) => ({ value: team.id, label: `${team.key} · ${team.name}` }),
	);
	const busy =
		connectMutation.isPending ||
		disconnectMutation.isPending ||
		statusQuery.isFetching;

	return (
		<SettingsRow
			align="start"
			title={
				<span className="flex items-center gap-2">
					<LinearBrandIcon size={14} />
					Linear
				</span>
			}
			description={
				connected
					? `Connected${status?.orgName ? ` to ${status.orgName}` : ""}. Pick the team whose issues appear on the Tasks page.`
					: "Paste a personal API key to sync your Linear issues into the Tasks page. The key is stored in your macOS keychain."
			}
		>
			<div className="flex w-[320px] flex-col gap-2">
				{!connected ? (
					<>
						<div className="flex w-full items-center gap-2">
							<Input
								type="password"
								value={keyDraft}
								onChange={(event) => setKeyDraft(event.target.value)}
								onBlur={commitKey}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitKey();
									}
								}}
								placeholder="lin_api_…"
								className="h-8 min-w-0 flex-1 border-border/50 bg-muted/20 text-ui"
							/>
							<Button
								type="button"
								size="sm"
								disabled={!keyDraft.trim() || connectMutation.isPending}
								onClick={commitKey}
							>
								<Plug className="size-3.5" />
								Connect
							</Button>
						</div>
						{!keyDraft && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="self-start"
								onClick={() => void openUrl(LINEAR_API_KEYS_URL)}
							>
								Get your API key
								<SquareArrowOutUpRight className="size-3.5" />
							</Button>
						)}
					</>
				) : (
					<>
						<div className="flex w-full items-center gap-2">
							<SettingsSelect
								value={status?.selectedTeamId ?? teamOptions[0]?.value ?? ""}
								options={
									teamOptions.length
										? teamOptions
										: [{ value: "", label: "No teams" }]
								}
								onChange={(teamId) => {
									const team = status?.teams.find((t) => t.id === teamId);
									if (team)
										teamMutation.mutate({ id: team.id, name: team.name });
								}}
								disabled={busy || teamOptions.length === 0}
								triggerClassName="min-w-0 flex-1"
								ariaLabel="Linear team"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								aria-label="Refresh connection"
								disabled={busy}
								onClick={() => void statusQuery.refetch()}
							>
								<RefreshCcw
									className={
										statusQuery.isFetching
											? "size-3.5 animate-spin"
											: "size-3.5"
									}
								/>
							</Button>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="self-start text-destructive"
							disabled={disconnectMutation.isPending}
							onClick={() => disconnectMutation.mutate()}
						>
							<Unplug className="size-3.5" />
							Disconnect
						</Button>
						{status?.lastSyncedAt ? (
							<SettingsNotice tone="info">
								Last synced {new Date(status.lastSyncedAt).toLocaleString()}
							</SettingsNotice>
						) : null}
					</>
				)}
				{error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
			</div>
		</SettingsRow>
	);
}
