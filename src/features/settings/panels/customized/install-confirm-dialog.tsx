import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { CustomizedProvider } from "@/lib/api";
import { SettingsNotice } from "../../components/settings-row";
import type { CatalogItem } from "./catalog";
import type { CustomizedData } from "./use-customized-data";

const PROVIDER_LABELS: Record<CustomizedProvider, string> = {
	claude: "Claude",
	codex: "Codex",
};

export function InstallConfirmDialog({
	item,
	data,
	open,
	onOpenChange,
}: {
	item: CatalogItem;
	data: CustomizedData;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	// Each supported provider toggles between installed/not. Initial state mirrors
	// the live inventory; confirm diffs against it.
	const [selected, setSelected] = useState<Record<string, boolean>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		const next: Record<string, boolean> = {};
		for (const provider of item.providers) {
			next[provider] = data.isInstalled(item, provider);
		}
		setSelected(next);
		setError(null);
	}, [open, item, data]);

	const confirm = async () => {
		setBusy(true);
		setError(null);
		const toInstall: CustomizedProvider[] = [];
		const toRemove: CustomizedProvider[] = [];
		for (const provider of item.providers) {
			const wanted = selected[provider] ?? false;
			const installed = data.isInstalled(item, provider);
			if (wanted && !installed) toInstall.push(provider);
			if (!wanted && installed) toRemove.push(provider);
		}
		try {
			if (toInstall.length > 0) await data.install(item, toInstall);
			if (toRemove.length > 0) await data.uninstall(item, toRemove);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const dirty = item.providers.some(
		(provider) =>
			(selected[provider] ?? false) !== data.isInstalled(item, provider),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{item.name}</DialogTitle>
					<DialogDescription>{item.description}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					<div className="text-small font-medium text-muted-foreground">
						Install globally for
					</div>
					{item.providers.map((provider) => {
						const ready = data.readyProvidersFor(item).includes(provider);
						const checked = selected[provider] ?? false;
						const controlId = `customized-install-${item.id}-${provider}`;
						return (
							<label
								key={provider}
								htmlFor={controlId}
								className="flex cursor-pointer items-center gap-3"
							>
								<Checkbox
									id={controlId}
									checked={checked}
									disabled={!ready && !data.isInstalled(item, provider)}
									onCheckedChange={(value) =>
										setSelected((prev) => ({
											...prev,
											[provider]: value === true,
										}))
									}
								/>
								<span className="text-ui text-foreground">
									{PROVIDER_LABELS[provider]}
								</span>
								{!ready ? (
									<span className="text-mini text-muted-foreground">
										not connected
									</span>
								) : null}
							</label>
						);
					})}
					<SettingsNotice tone="info">
						Installs are global and take effect on the next session.
					</SettingsNotice>
					{error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button type="button" onClick={confirm} disabled={busy || !dirty}>
						{busy ? "Applying…" : "Apply"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
