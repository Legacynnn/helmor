import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomizedProvider } from "@/lib/api";
import { InstallConfirmDialog } from "./install-confirm-dialog";
import type { CustomizedData, InstalledEntry } from "./use-customized-data";

const PROVIDER_LABELS: Record<CustomizedProvider, string> = {
	claude: "Claude",
	codex: "Codex",
};

function InstalledRow({
	entry,
	data,
}: {
	entry: InstalledEntry;
	data: CustomizedData;
}) {
	const [open, setOpen] = useState(false);
	return (
		<li className="flex items-center justify-between gap-3 px-3 py-2.5">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="truncate text-small font-medium text-foreground">
						{entry.name}
					</span>
					{entry.catalogItem ? (
						<Badge variant="secondary" className="text-mini">
							curated
						</Badge>
					) : null}
				</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
					{entry.providers.map((p) => (
						<Badge key={p} variant="outline" className="text-mini">
							{PROVIDER_LABELS[p]}
						</Badge>
					))}
					{entry.source ? (
						<span className="text-mini text-muted-foreground">
							{entry.source}
						</span>
					) : null}
				</div>
			</div>
			{entry.catalogItem ? (
				<>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setOpen(true)}
					>
						Manage
					</Button>
					<InstallConfirmDialog
						item={entry.catalogItem}
						data={data}
						open={open}
						onOpenChange={setOpen}
					/>
				</>
			) : null}
		</li>
	);
}

function Group({
	label,
	entries,
	data,
}: {
	label: string;
	entries: InstalledEntry[];
	data: CustomizedData;
}) {
	if (entries.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-mini font-medium uppercase tracking-wide text-muted-foreground">
				{label} ({entries.length})
			</div>
			<ul className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/15">
				{entries.map((entry) => (
					<InstalledRow
						key={`${entry.kind}:${entry.name}`}
						entry={entry}
						data={data}
					/>
				))}
			</ul>
		</div>
	);
}

export function InstalledOverview({
	data,
	query,
}: {
	data: CustomizedData;
	query: string;
}) {
	const q = query.trim().toLowerCase();
	const filtered = q
		? data.installedInventory.filter((e) => e.name.toLowerCase().includes(q))
		: data.installedInventory;
	const mcp = filtered.filter((e) => e.kind === "mcp");
	const skills = filtered.filter((e) => e.kind === "skill");

	if (data.installedInventory.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center text-small text-muted-foreground">
				Nothing installed yet. Switch to{" "}
				<span className="font-medium text-foreground">Browse</span> to add MCP
				servers and skills.
			</div>
		);
	}

	if (filtered.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center text-small text-muted-foreground">
				No installed items match “{query}”.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<Group label="MCP servers" entries={mcp} data={data} />
			<Group label="Skills" entries={skills} data={data} />
		</div>
	);
}
