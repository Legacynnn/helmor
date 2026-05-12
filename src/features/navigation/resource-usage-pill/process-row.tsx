import { Bot, Box, Cpu, Monitor, Terminal, Wrench } from "lucide-react";
import type { ResourceProcessKind, ResourceProcessNode } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytesShort, formatCpu } from "./format";
import type { MetricMode } from "./types";

export function ProcessRow({
	node,
	metric,
	indent = 2,
}: {
	node: ResourceProcessNode;
	metric: MetricMode;
	indent?: number;
}) {
	return (
		<div
			className="flex items-center gap-2 py-[3px] pr-4 text-[11px] text-muted-foreground/85"
			style={{ paddingLeft: 16 + indent * 14 }}
		>
			<KindIcon kind={node.kind} />
			<span className="flex-1 truncate font-medium tabular-nums text-foreground/85">
				{node.name}
				<span className="ml-1 text-muted-foreground/55">#{node.pid}</span>
			</span>
			<span className="w-14 shrink-0 text-right tabular-nums">
				{metric === "memory"
					? formatBytesShort(node.memoryBytes)
					: formatCpu(node.cpuPercent)}
			</span>
		</div>
	);
}

function KindIcon({ kind }: { kind: ResourceProcessKind }) {
	const className = "size-3 shrink-0 text-muted-foreground/55";
	switch (kind.type) {
		case "main":
			return (
				<Cpu className={cn(className, "text-foreground/65")} strokeWidth={2} />
			);
		case "renderer":
			return <Monitor className={className} strokeWidth={2} />;
		case "sidecar":
			return (
				<Box className={cn(className, "text-foreground/65")} strokeWidth={2} />
			);
		case "cli":
			return <Bot className={className} strokeWidth={2} />;
		case "script":
			return <Wrench className={className} strokeWidth={2} />;
		case "pty":
			return <Terminal className={className} strokeWidth={2} />;
		default:
			return <Box className={className} strokeWidth={2} />;
	}
}
