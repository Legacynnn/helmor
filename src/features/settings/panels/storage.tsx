import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatBytes } from "@/features/resources/format";
import {
	clearOldLogs,
	deleteWorkspaceStorage,
	type StorageBreakdown,
	vacuumDatabase,
} from "@/lib/api";
import {
	helmorQueryKeys,
	storageBreakdownQueryOptions,
} from "@/lib/query-client";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

const SEGMENT_COLORS = [
	"bg-chart-1",
	"bg-chart-2",
	"bg-chart-3",
	"bg-chart-4",
	"bg-chart-5",
];

function UsageBar({ breakdown }: { breakdown: StorageBreakdown }) {
	const workspaceBytes = breakdown.workspaces.reduce(
		(sum, w) => sum + (w.sizeBytes ?? 0),
		0,
	);
	const segments = [
		{ label: "Workspaces", bytes: workspaceBytes },
		{ label: "Database", bytes: breakdown.dbBytes },
		{ label: "Logs", bytes: breakdown.logsBytes },
		{ label: "Chats", bytes: breakdown.chatsBytes },
	].filter((s) => s.bytes > 0);
	const total = Math.max(breakdown.totalBytes, 1);
	return (
		<div className="space-y-2 pb-5">
			<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
				{segments.map((segment, i) => (
					<div
						key={segment.label}
						className={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
						style={{ width: `${(segment.bytes / total) * 100}%` }}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-mini text-muted-foreground">
				{segments.map((segment, i) => (
					<span key={segment.label} className="flex items-center gap-1">
						<span
							aria-hidden="true"
							className={`size-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
						/>
						{segment.label} · {formatBytes(segment.bytes)}
					</span>
				))}
			</div>
		</div>
	);
}

export function StoragePanel() {
	const queryClient = useQueryClient();
	const query = useQuery(storageBreakdownQueryOptions());
	const [confirm, setConfirm] = useState<{
		title: string;
		detail: string;
		action: () => void;
	} | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: helmorQueryKeys.storageBreakdown,
		});

	const deleteDirs = useMutation({
		mutationFn: deleteWorkspaceStorage,
		onSettled: invalidate,
	});
	const clearLogs = useMutation({
		mutationFn: () => clearOldLogs(7),
		onSettled: invalidate,
	});
	const vacuum = useMutation({
		mutationFn: vacuumDatabase,
		onSettled: invalidate,
	});

	const breakdown = query.data;
	const reclaimable = breakdown?.workspaces.filter((w) => w.reclaimable) ?? [];
	const reclaimableBytes = reclaimable.reduce(
		(sum, w) => sum + (w.sizeBytes ?? 0),
		0,
	);

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow
					title="Disk usage"
					description={
						breakdown
							? `Helmor is using ${formatBytes(breakdown.totalBytes)}`
							: "Scanning…"
					}
					align="start"
				>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Refresh storage info"
						onClick={() => void query.refetch()}
					>
						<RefreshCw className="size-3.5" />
					</Button>
				</SettingsRow>
				{breakdown ? <UsageBar breakdown={breakdown} /> : null}
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow
					title="Workspaces"
					description={
						reclaimable.length > 0
							? `${reclaimable.length} archived workspace folder(s) can be removed — frees ${formatBytes(reclaimableBytes)}`
							: "No reclaimable workspace folders"
					}
					align="start"
				>
					{reclaimable.length > 0 ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setConfirm({
									title: "Delete archived workspace folders?",
									detail: `Removes ${reclaimable.length} folder(s), freeing ${formatBytes(reclaimableBytes)}. Chat history and database records are kept.`,
									action: () => deleteDirs.mutate(reclaimable.map((w) => w.id)),
								})
							}
						>
							Clean up
						</Button>
					) : null}
				</SettingsRow>
				{breakdown ? (
					<div className="space-y-0.5 py-2">
						{breakdown.workspaces.map((workspace) => (
							<div
								key={workspace.id}
								className="flex items-center gap-2 py-1 text-small"
							>
								<span className="min-w-0 flex-1 truncate">
									{workspace.name}
								</span>
								{workspace.branch ? (
									<span className="truncate text-mini text-muted-foreground">
										{workspace.branch}
									</span>
								) : null}
								<span className="rounded bg-accent px-1 text-mini">
									{workspace.state}
								</span>
								<span className="w-16 text-right text-mini tabular-nums text-muted-foreground">
									{workspace.sizeBytes != null
										? formatBytes(workspace.sizeBytes)
										: "—"}
								</span>
								{workspace.reclaimable ? (
									<Button
										variant="ghost"
										size="sm"
										className="text-mini"
										onClick={() =>
											setConfirm({
												title: `Delete files for "${workspace.name}"?`,
												detail: `Frees ${formatBytes(workspace.sizeBytes ?? 0)}. Chat history is kept.`,
												action: () => deleteDirs.mutate([workspace.id]),
											})
										}
									>
										Delete files
									</Button>
								) : null}
							</div>
						))}
					</div>
				) : null}
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow
					title="Clear old logs"
					description={
						breakdown
							? `Logs use ${formatBytes(breakdown.logsBytes)} — removes files older than 7 days`
							: undefined
					}
				>
					<Button
						variant="outline"
						size="sm"
						disabled={clearLogs.isPending}
						onClick={() => clearLogs.mutate()}
					>
						Clear logs
					</Button>
				</SettingsRow>
				<SettingsRow
					title="Compact database"
					description={
						breakdown
							? `Database is ${formatBytes(breakdown.dbBytes)} — runs SQLite VACUUM`
							: undefined
					}
				>
					<Button
						variant="outline"
						size="sm"
						disabled={vacuum.isPending}
						onClick={() => vacuum.mutate()}
					>
						Compact
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => {
					if (!open) setConfirm(null);
				}}
				title={confirm?.title ?? ""}
				description={confirm?.detail ?? ""}
				confirmLabel="Delete"
				onConfirm={() => {
					confirm?.action();
					setConfirm(null);
				}}
			/>
		</div>
	);
}
