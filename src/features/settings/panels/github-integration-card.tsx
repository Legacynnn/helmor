import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCcw, Unplug } from "lucide-react";
import { GithubBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import {
	connectIntegration,
	disconnectIntegration,
	getIntegrationStatus,
	type IntegrationProvider,
	type IntegrationStatus,
	setIntegrationTeam,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { SettingsNotice, SettingsRow } from "../components/settings-row";
import {
	SettingsSelect,
	type SettingsSelectOption,
} from "../components/settings-select";

/**
 * GitHub tasks integration. Unlike Linear there is NO API key: GitHub
 * "connects" on top of the app's existing `gh` sign-in. Connect just
 * validates that auth (via an empty-key `connectIntegration`), then the
 * user picks a repository (`owner/repo`) whose issues drive the Tasks page.
 */
export function GitHubIntegrationCard() {
	const provider: IntegrationProvider = "github";
	const queryClient = useQueryClient();
	const statusQuery = useQuery({
		queryKey: helmorQueryKeys.integrationStatus(provider),
		queryFn: () => getIntegrationStatus(provider),
	});
	const status = statusQuery.data;
	const connected = status?.connected ?? false;

	const setStatus = (next: IntegrationStatus) => {
		queryClient.setQueryData(helmorQueryKeys.integrationStatus(provider), next);
	};

	const connectMutation = useMutation({
		// Empty key — GitHub rides the app's existing `gh` auth.
		mutationFn: () => connectIntegration(provider, ""),
		onSuccess: (next) => setStatus(next),
	});

	const disconnectMutation = useMutation({
		mutationFn: () => disconnectIntegration(provider),
		onSuccess: () => void statusQuery.refetch(),
	});

	const teamMutation = useMutation({
		mutationFn: (team: { id: string; name: string }) =>
			setIntegrationTeam(provider, team.id, team.name),
		onSuccess: () => void statusQuery.refetch(),
	});

	const repoOptions: SettingsSelectOption<string>[] = (status?.teams ?? []).map(
		(team) => ({ value: team.id, label: team.name }),
	);
	const busy =
		connectMutation.isPending ||
		disconnectMutation.isPending ||
		statusQuery.isFetching;

	const error = connectMutation.error ?? disconnectMutation.error;
	const errorText = error
		? error instanceof Error
			? error.message
			: String(error)
		: null;

	return (
		<SettingsRow
			align="start"
			title={
				<span className="flex items-center gap-2">
					<GithubBrandIcon size={14} />
					GitHub
				</span>
			}
			description={
				connected
					? `Connected${status?.orgName ? ` to ${status.orgName}` : ""}. Pick the repository whose issues appear on the Tasks page.`
					: "Helmor uses your existing GitHub sign-in. Connect to sync issues from a repository into the Tasks page."
			}
		>
			<div className="flex w-[320px] flex-col gap-2">
				{!connected ? (
					<Button
						type="button"
						size="sm"
						className="self-start"
						disabled={connectMutation.isPending}
						onClick={() => connectMutation.mutate()}
					>
						<Plug className="size-3.5" />
						Connect
					</Button>
				) : (
					<>
						<div className="flex w-full items-center gap-2">
							<SettingsSelect
								value={status?.selectedTeamId ?? repoOptions[0]?.value ?? ""}
								options={
									repoOptions.length
										? repoOptions
										: [{ value: "", label: "No repositories" }]
								}
								onChange={(repoId) => {
									const repo = status?.teams.find((t) => t.id === repoId);
									if (repo)
										teamMutation.mutate({ id: repo.id, name: repo.name });
								}}
								disabled={busy || repoOptions.length === 0}
								triggerClassName="min-w-0 flex-1"
								ariaLabel="GitHub repository"
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
				{errorText ? (
					<SettingsNotice tone="error">{errorText}</SettingsNotice>
				) : null}
			</div>
		</SettingsRow>
	);
}
