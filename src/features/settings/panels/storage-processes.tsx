import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { killResourceProcess, type ProcessInfo } from "@/lib/api";
import {
	helmorQueryKeys,
	resourceSnapshotQueryOptions,
} from "@/lib/query-client";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

/** Agent processes with no matching active stream — candidates for cleanup. */
export function findStuckAgents(
	processes: ProcessInfo[],
	activeWorkspaceIds: Set<string>,
): ProcessInfo[] {
	return processes.filter(
		(process) =>
			process.kind === "agent" &&
			process.killable &&
			(process.workspaceId === null ||
				!activeWorkspaceIds.has(process.workspaceId)),
	);
}

export function StorageProcessesSection({
	activeWorkspaceIds,
}: {
	activeWorkspaceIds: Set<string>;
}) {
	const queryClient = useQueryClient();
	const snapshot = useQuery(resourceSnapshotQueryOptions(5000));
	const kill = useMutation({
		mutationFn: (process: ProcessInfo) =>
			killResourceProcess(process.pid, process.startTime),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.resourceSnapshot,
			}),
		onError: (error) =>
			toast.error("Couldn't kill process", {
				description: error instanceof Error ? error.message : String(error),
			}),
	});

	const stuck = findStuckAgents(
		snapshot.data?.processes ?? [],
		activeWorkspaceIds,
	);
	if (stuck.length === 0) return null;

	return (
		<SettingsGroup>
			<SettingsRow
				title="Idle agent processes"
				description={`${stuck.length} agent process(es) running with no active stream`}
				align="start"
			>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						for (const process of stuck) {
							kill.mutate(process);
						}
					}}
				>
					Kill all
				</Button>
			</SettingsRow>
			{stuck.map((process) => (
				<div
					key={process.pid}
					className="flex items-center gap-2 py-1 text-small"
				>
					<span className="min-w-0 flex-1 truncate">{process.name}</span>
					<span className="text-mini tabular-nums text-muted-foreground">
						PID {process.pid}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="text-mini"
						onClick={() => kill.mutate(process)}
					>
						Kill
					</Button>
				</div>
			))}
		</SettingsGroup>
	);
}
