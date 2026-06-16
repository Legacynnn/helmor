// Booted-device picker for the simulator surface. Lists devices from
// `simulatorListDevices(kind)`, sorting booted ones first. Booted devices are
// selectable; shutdown ones show a "Boot" affordance that calls `simulatorBoot`
// and refreshes the list.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SimDevice, SimSurfaceKind } from "@/lib/api";

type DevicePickerProps = {
	kind: SimSurfaceKind;
	selectedUdid: string | null;
	onSelect: (udid: string) => void;
};

/** Booted devices first, then shutdown — stable within each group. */
function sortDevices(devices: SimDevice[]): SimDevice[] {
	return [...devices].sort((a, b) => Number(b.booted) - Number(a.booted));
}

export function DevicePicker({
	kind,
	selectedUdid,
	onSelect,
}: DevicePickerProps) {
	const [devices, setDevices] = useState<SimDevice[]>([]);

	const refresh = useCallback(() => {
		void (async () => {
			try {
				const { simulatorListDevices } = await import("@/lib/api");
				const list = await simulatorListDevices(kind);
				setDevices(sortDevices(list));
			} catch {
				// No-op under jsdom / when the Tauri bridge is unavailable.
			}
		})();
	}, [kind]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const boot = useCallback(
		(udid: string) => {
			void (async () => {
				try {
					const { simulatorBoot } = await import("@/lib/api");
					await simulatorBoot(udid);
					refresh();
				} catch {
					// No-op.
				}
			})();
		},
		[refresh],
	);

	return (
		<div className="flex items-center gap-2">
			<select
				aria-label="Simulator device"
				className="cursor-pointer rounded border border-border/40 bg-transparent px-2 py-1 text-sm"
				value={selectedUdid ?? ""}
				onChange={(e) => onSelect(e.target.value)}
			>
				<option value="" disabled>
					Select a device
				</option>
				{devices.map((d) => (
					<option key={d.udid} value={d.udid} disabled={!d.booted}>
						{d.name}
						{d.booted ? "" : " (shutdown)"}
					</option>
				))}
			</select>
			{devices
				.filter((d) => !d.booted)
				.slice(0, 1)
				.map((d) => (
					<Button
						key={d.udid}
						type="button"
						size="sm"
						variant="ghost"
						className="cursor-pointer text-xs"
						onClick={() => boot(d.udid)}
					>
						Boot {d.name}
					</Button>
				))}
		</div>
	);
}
