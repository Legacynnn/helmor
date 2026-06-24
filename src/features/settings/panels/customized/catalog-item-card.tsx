import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomizedProvider } from "@/lib/api";
import type { CatalogItem } from "./catalog";
import { InstallConfirmDialog } from "./install-confirm-dialog";
import type { CustomizedData } from "./use-customized-data";

const PROVIDER_LABELS: Record<CustomizedProvider, string> = {
	claude: "Claude",
	codex: "Codex",
};

export function CatalogItemCard({
	item,
	data,
}: {
	item: CatalogItem;
	data: CustomizedData;
}) {
	const [open, setOpen] = useState(false);
	const installedOn = item.providers.filter((p) => data.isInstalled(item, p));
	const anyInstalled = installedOn.length > 0;

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{item.name}
					</div>
					<div className="mt-0.5 flex flex-wrap gap-1">
						{item.providers.map((p) => (
							<Badge key={p} variant="secondary" className="text-mini">
								{PROVIDER_LABELS[p]}
							</Badge>
						))}
					</div>
				</div>
				<Button
					type="button"
					size="sm"
					variant={anyInstalled ? "outline" : "default"}
					onClick={() => setOpen(true)}
				>
					{anyInstalled ? "Manage" : "Install"}
				</Button>
			</div>
			<p className="text-small leading-snug text-muted-foreground">
				{item.description}
			</p>
			{anyInstalled ? (
				<div className="text-mini text-emerald-500">
					Installed on {installedOn.map((p) => PROVIDER_LABELS[p]).join(", ")}
				</div>
			) : null}
			<InstallConfirmDialog
				item={item}
				data={data}
				open={open}
				onOpenChange={setOpen}
			/>
		</div>
	);
}
