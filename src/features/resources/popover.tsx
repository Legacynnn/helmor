import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Cpu, Server, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	killResourceProcess,
	type ProcessInfo,
	type ProcessKind,
	type ResourceSnapshot,
} from "@/lib/api";
import {
	helmorQueryKeys,
	workspaceGroupsQueryOptions,
} from "@/lib/query-client";
import { publishShellEvent } from "@/shell/event-bus";
import { formatBytes, formatCpu } from "./format";
import type { ResourceSample } from "./hooks/history";

const KIND_ICONS: Record<ProcessKind, typeof Cpu> = {
	app: Cpu,
	sidecar: Server,
	agent: Bot,
	devServer: Server,
	shell: SquareTerminal,
	other: Cpu,
};

function Sparkline({ values }: { values: number[] }) {
	if (values.length < 2) return null;
	const max = Math.max(...values, 1);
	const points = values
		.map((v, i) => `${(i / (values.length - 1)) * 100},${24 - (v / max) * 22}`)
		.join(" ");
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 100 24"
			className="h-6 w-full"
			preserveAspectRatio="none"
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function ProcessRow({ process }: { process: ProcessInfo }) {
	const [confirming, setConfirming] = useState(false);
	const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (confirmTimeoutRef.current !== null) {
				clearTimeout(confirmTimeoutRef.current);
			}
		},
		[],
	);
	const queryClient = useQueryClient();
	const kill = useMutation({
		mutationFn: () => killResourceProcess(process.pid, process.startTime),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.resourceSnapshot,
			}),
	});
	const Icon = KIND_ICONS[process.kind];
	return (
		<div className="flex items-center gap-2 px-3 py-1 text-small">
			<Icon
				aria-hidden="true"
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
			<span className="min-w-0 flex-1 truncate">{process.name}</span>
			<span className="text-mini tabular-nums text-muted-foreground">
				{process.pid}
			</span>
			<span className="w-10 text-right text-mini tabular-nums">
				{formatCpu(process.cpuPercent)}
			</span>
			<span className="w-14 text-right text-mini tabular-nums">
				{formatBytes(process.memoryBytes)}
			</span>
			{process.killable ? (
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={
						confirming ? `Confirm kill ${process.name}` : `Kill ${process.name}`
					}
					className={confirming ? "text-red-500" : "text-muted-foreground"}
					onClick={() => {
						if (confirmTimeoutRef.current !== null) {
							clearTimeout(confirmTimeoutRef.current);
							confirmTimeoutRef.current = null;
						}
						if (confirming) {
							kill.mutate();
							setConfirming(false);
						} else {
							setConfirming(true);
							confirmTimeoutRef.current = setTimeout(
								() => setConfirming(false),
								3000,
							);
						}
					}}
				>
					<X className="size-3" />
				</Button>
			) : (
				<span className="w-6" />
			)}
		</div>
	);
}

export function ResourcePopoverContent({
	snapshot,
	history,
	isError,
	onClose,
}: {
	snapshot: ResourceSnapshot | undefined;
	history: ResourceSample[];
	isError: boolean;
	onClose: () => void;
}) {
	// Cheap: served from the already-populated sidebar cache (+ initialData).
	const { data: workspaceGroups } = useQuery(workspaceGroupsQueryOptions());
	const workspaceNames = new Map<string, string>();
	for (const group of workspaceGroups) {
		for (const row of group.rows) {
			workspaceNames.set(row.id, row.title);
		}
	}

	if (isError || !snapshot) {
		return (
			<div className="p-4 text-small text-muted-foreground">
				Resource data unavailable.
			</div>
		);
	}

	const groups = new Map<string, ProcessInfo[]>();
	for (const process of snapshot.processes) {
		const key = process.workspaceId ?? "__core__";
		groups.set(key, [...(groups.get(key) ?? []), process]);
	}

	return (
		<div className="flex max-h-[420px] flex-col">
			<div className="border-b px-3 py-2">
				<div className="flex items-baseline justify-between text-small">
					<span className="font-medium">Helmor</span>
					<span className="tabular-nums text-muted-foreground">
						{formatCpu(snapshot.totalCpuPercent)} ·{" "}
						{formatBytes(snapshot.totalMemoryBytes)}
					</span>
				</div>
				<div className="text-muted-foreground/60">
					<Sparkline values={history.map((s) => s.cpuPercent)} />
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				{[...groups.entries()].map(([workspaceId, processes]) => (
					<div key={workspaceId}>
						<div className="px-3 pb-0.5 pt-1.5 text-mini font-medium text-muted-foreground">
							{workspaceId === "__core__"
								? "Helmor core"
								: (workspaceNames.get(workspaceId) ?? workspaceId)}
						</div>
						{processes.map((process) => (
							<ProcessRow key={process.pid} process={process} />
						))}
					</div>
				))}
				{snapshot.processes.length === 0 ? (
					<div className="px-3 py-2 text-small text-muted-foreground">
						No active agents
					</div>
				) : null}
				<div className="px-3 pb-0.5 pt-1.5 text-mini font-medium text-muted-foreground">
					Ports
				</div>
				{snapshot.portsUnavailable ? (
					<div className="px-3 py-1 text-small text-muted-foreground">
						Ports unavailable
					</div>
				) : snapshot.ports.length === 0 ? (
					<div className="px-3 py-1 text-small text-muted-foreground">
						No open ports
					</div>
				) : (
					snapshot.ports.map((port) => (
						<button
							key={port.port}
							type="button"
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-small hover:bg-accent"
							onClick={() =>
								navigator.clipboard.writeText(`localhost:${port.port}`)
							}
						>
							<span className="tabular-nums font-medium">:{port.port}</span>
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								{port.processName ?? "unknown"}
								{port.pid != null ? ` (${port.pid})` : ""}
							</span>
							{port.workspaceId ? (
								<span className="rounded bg-accent px-1 text-mini">
									{workspaceNames.get(port.workspaceId) ?? port.workspaceId}
								</span>
							) : null}
							<Copy
								aria-hidden="true"
								className="size-3 text-muted-foreground"
							/>
						</button>
					))
				)}
			</div>
			<button
				type="button"
				className="cursor-pointer border-t px-3 py-2 text-left text-small text-muted-foreground hover:text-foreground"
				onClick={() => {
					onClose();
					publishShellEvent({ type: "open-settings", section: "storage" });
				}}
			>
				Storage &amp; cleanup…
			</button>
		</div>
	);
}
