import { ChevronDown, Cpu, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	DropdownMenu as MetricMenu,
	DropdownMenuContent as MetricMenuContent,
	DropdownMenuItem as MetricMenuItem,
	DropdownMenuTrigger as MetricMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ResourceSnapshot, SIDECAR_AGENTS_REPO_ID } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytesShort, formatRelativeAge } from "./format";
import { RepositorySection } from "./repository-section";
import { ResourceSummary } from "./resource-summary";
import type { MetricMode } from "./types";
import { useResourceSnapshot } from "./use-resource-snapshot";

/**
 * Lightweight pill in the left sidebar's bottom control row that opens
 * a translucent resource readout. Shows Helmor's own process tree
 * (renderers, sidecar, agent CLIs, script runners) grouped by repo and
 * workspace, with real CPU / memory readings polled from a `sysinfo`-
 * backed collector in the Rust backend.
 */
export function ResourceUsagePill() {
	const [open, setOpen] = useState(false);
	const query = useResourceSnapshot({ open });
	const data = query.data as ResourceSnapshot | undefined;

	const triggerLabel = data ? formatBytesShort(data.helmor.memoryBytes) : "—";

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Open resource usage panel"
					className={cn(
						"group/resource flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-sidebar-border/45 bg-sidebar-foreground/[0.025] px-2 text-[11px] font-medium text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] transition-[background-color,border-color,color,box-shadow] hover:border-sidebar-border/70 hover:bg-sidebar-foreground/[0.055] hover:text-foreground",
						"data-[state=open]:border-sidebar-border/80 data-[state=open]:bg-sidebar-foreground/[0.065] data-[state=open]:text-foreground data-[state=open]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]",
					)}
				>
					<span className="flex size-3.5 items-center justify-center rounded-[5px] bg-sidebar-foreground/[0.045] text-muted-foreground ring-1 ring-sidebar-border/45 transition-colors group-hover/resource:text-foreground group-data-[state=open]/resource:text-foreground">
						<Cpu className="size-2.5" strokeWidth={1.9} />
					</span>
					<span className="tabular-nums text-foreground/85">
						{triggerLabel}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				side="top"
				sideOffset={8}
				className="w-[392px] border-white/10 bg-popover/70 p-0 backdrop-blur-xl"
			>
				<ResourcePanel
					data={data}
					isLoading={query.isPending}
					isError={query.isError}
					onRefresh={() => query.refetch()}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ResourcePanel({
	data,
	isLoading,
	isError,
	onRefresh,
}: {
	data: ResourceSnapshot | undefined;
	isLoading: boolean;
	isError: boolean;
	onRefresh: () => void;
}) {
	const [metric, setMetric] = useState<MetricMode>("memory");
	const [expandedRepos, setExpandedRepos] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		initial.add(SIDECAR_AGENTS_REPO_ID);
		return initial;
	});

	// Auto-expand the sidecar bucket the first time it appears with data.
	useEffect(() => {
		if (!data) return;
		const hasSidecar = data.repositories.some(
			(r) => r.repoId === SIDECAR_AGENTS_REPO_ID && r.workspaces.length > 0,
		);
		if (hasSidecar) {
			setExpandedRepos((prev) => {
				if (prev.has(SIDECAR_AGENTS_REPO_ID)) return prev;
				const next = new Set(prev);
				next.add(SIDECAR_AGENTS_REPO_ID);
				return next;
			});
		}
	}, [data]);

	const toggleRepo = useCallback((repoId: string) => {
		setExpandedRepos((prev) => {
			const next = new Set(prev);
			if (next.has(repoId)) next.delete(repoId);
			else next.add(repoId);
			return next;
		});
	}, []);

	const ageLabel = useMemo(() => {
		if (!data) return null;
		return formatRelativeAge(data.capturedAtMs, Date.now());
	}, [data]);

	return (
		<div className="flex flex-col">
			<header className="flex items-center justify-between px-4 pb-2 pt-3">
				<span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
					Resource usage
				</span>
				<div className="flex items-center gap-1 text-muted-foreground/80">
					<MetricMenu>
						<MetricMenuTrigger asChild>
							<button
								type="button"
								className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium hover:bg-foreground/[0.06] hover:text-foreground"
							>
								<span>{metric === "memory" ? "Memory" : "CPU"}</span>
								<ChevronDown className="size-3" strokeWidth={2} />
							</button>
						</MetricMenuTrigger>
						<MetricMenuContent align="end" className="min-w-[120px]">
							<MetricMenuItem onSelect={() => setMetric("memory")}>
								Memory
							</MetricMenuItem>
							<MetricMenuItem onSelect={() => setMetric("cpu")}>
								CPU
							</MetricMenuItem>
						</MetricMenuContent>
					</MetricMenu>
					<button
						type="button"
						aria-label="Refresh resource usage"
						onClick={onRefresh}
						className="flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/[0.06] hover:text-foreground"
					>
						<RotateCw className="size-3.5" strokeWidth={1.8} />
					</button>
				</div>
			</header>

			<ResourceSummary helmor={data?.helmor} system={data?.system} />

			<div className="max-h-[360px] overflow-y-auto border-t border-white/5">
				{isError ? (
					<div className="px-4 py-4 text-[11px] text-destructive/85">
						Failed to read process tree. Click refresh to retry.
					</div>
				) : isLoading && !data ? (
					<SkeletonRows />
				) : data && data.repositories.length === 0 ? (
					<div className="px-4 py-4 text-[11px] text-muted-foreground/65">
						No tracked processes yet. Run a script or send an agent prompt to
						populate.
					</div>
				) : data ? (
					data.repositories.map((repo) => (
						<RepositorySection
							key={repo.repoId}
							repo={repo}
							metric={metric}
							expanded={expandedRepos.has(repo.repoId)}
							onToggle={() => toggleRepo(repo.repoId)}
						/>
					))
				) : null}
			</div>

			<footer className="border-t border-white/5 px-4 py-1.5 text-[10.5px] text-muted-foreground/55">
				{ageLabel ? `Updated ${ageLabel}` : "Waiting for first sample…"}
			</footer>
		</div>
	);
}

function SkeletonRows() {
	return (
		<div className="flex flex-col gap-1 px-4 py-3">
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					className="h-4 animate-pulse rounded bg-foreground/[0.05]"
					style={{ width: `${100 - i * 18}%` }}
				/>
			))}
		</div>
	);
}
