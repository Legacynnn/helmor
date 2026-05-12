import type { ResourceHelmorRollup, ResourceSystemTotals } from "@/lib/api";
import { formatBytes, formatCpu, formatPercent } from "./format";

export function ResourceSummary({
	helmor,
	system,
}: {
	helmor: ResourceHelmorRollup | undefined;
	system: ResourceSystemTotals | undefined;
}) {
	return (
		<div className="grid grid-cols-3 gap-2 px-4 pb-3 pt-1">
			<Column label="CPU" value={helmor ? formatCpu(helmor.cpuPercent) : "—"} />
			<Column
				label="Memory"
				value={helmor ? formatBytes(helmor.memoryBytes) : "—"}
			/>
			<Column
				label="RAM share"
				value={
					helmor && system && system.totalMemoryBytes > 0
						? formatPercent(helmor.ramShare)
						: "—"
				}
			/>
		</div>
	);
}

function Column({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/80">
				{label}
			</span>
			<span className="text-[15px] font-semibold tabular-nums text-foreground/95">
				{value}
			</span>
		</div>
	);
}
