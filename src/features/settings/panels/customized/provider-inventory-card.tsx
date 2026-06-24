import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ProviderConfigEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ConnectedProvider } from "./use-customized-data";

function StatusBadge({ ready }: { ready: boolean }) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-mini font-medium",
				ready
					? "bg-emerald-500/10 text-emerald-500"
					: "bg-muted text-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					ready ? "bg-emerald-500" : "bg-muted-foreground/50",
				)}
			/>
			{ready ? "Ready" : "Not connected"}
		</span>
	);
}

function EntrySection({
	label,
	entries,
}: {
	label: string;
	entries: ProviderConfigEntry[];
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="text-mini font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			{entries.length === 0 ? (
				<div className="text-small italic text-muted-foreground/70">
					None loaded
				</div>
			) : (
				<ul className="flex flex-col divide-y divide-border/40 rounded-md border border-border/50 bg-app-base/40">
					{entries.map((entry) => (
						<li
							key={`${entry.name}-${entry.source}`}
							className="flex items-center justify-between gap-3 px-3 py-1.5"
						>
							<span className="truncate text-small text-foreground">
								{entry.name}
							</span>
							{entry.source ? (
								<span className="shrink-0 text-mini text-muted-foreground">
									{entry.source}
								</span>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function ProviderInventoryCard({
	provider,
	extra,
	defaultOpen = false,
}: {
	provider: ConnectedProvider;
	/** Optional view-only inventory line (e.g. GitHub accounts). */
	extra?: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border border-border/60 bg-muted/15"
		>
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 p-4 text-left">
				<ChevronRight
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="text-ui font-medium text-foreground">
					{provider.label}
				</span>
				<span className="flex-1" />
				{!provider.installable ? (
					<Badge variant="secondary" className="text-mini">
						view-only
					</Badge>
				) : null}
				<Badge variant="secondary" className="text-mini">
					{provider.skills.length} skills
				</Badge>
				<Badge variant="secondary" className="text-mini">
					{provider.mcpServers.length} MCP
				</Badge>
				<StatusBadge ready={provider.ready} />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="flex flex-col gap-4 px-4 pb-4 pl-10">
					<EntrySection label="Skills" entries={provider.skills} />
					<EntrySection label="MCP servers" entries={provider.mcpServers} />
					{extra}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
