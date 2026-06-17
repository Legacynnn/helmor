// WorkspaceSimulatorSurface: the in-app simulator preview surface (peer to the
// browser surface). Mirrors `features/browser/index.tsx` structure — a chrome
// bar with the device picker + Close, the polled `ScreenshotHost`, and the
// reused `AgentControlBanner` (Phase 2) shown while an agent controls it.
//
// On mount it opens the simulator surface (registering the agent-control driver
// in the Rust broker); on unmount it closes it. All IPC is guarded for jsdom.
import { useEffect, useState } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import { AgentControlBanner } from "@/features/browser/agent-control-banner";
import type { SimSurfaceKind } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DevicePicker } from "./device-picker";
import { ScreenshotHost } from "./screenshot-host";

const SIMULATOR_CHROME_BACKGROUND_CLASS = "bg-editor-chrome";

type WorkspaceSimulatorSurfaceProps = {
	/** Owning workspace; scopes the agent-control surface registration. */
	workspaceId: string;
	kind: SimSurfaceKind;
	/** Initially focused device udid. */
	udid: string;
	onExit: () => void;
};

export function WorkspaceSimulatorSurface({
	workspaceId,
	kind,
	udid,
	onExit,
}: WorkspaceSimulatorSurfaceProps) {
	const [selectedUdid, setSelectedUdid] = useState<string>(udid);

	// Open the surface once a real device is selected (registers the broker
	// driver) + close on unmount. With no pre-selected device the surface still
	// renders its chrome + picker; it only goes live once a udid exists, so the
	// surface is reachable (and the picker can auto-select a booted device)
	// without an up-front device id.
	useEffect(() => {
		if (selectedUdid) {
			void (async () => {
				try {
					const { simulatorOpenSurface } = await import("@/lib/api");
					await simulatorOpenSurface(workspaceId, kind, selectedUdid);
				} catch {
					// No-op under jsdom / when the Tauri bridge is unavailable.
				}
			})();
		}
		return () => {
			void (async () => {
				try {
					const { simulatorCloseSurface } = await import("@/lib/api");
					await simulatorCloseSurface(workspaceId);
				} catch {
					// No-op.
				}
			})();
		};
		// Re-open when the device changes so the broker driver targets it.
	}, [workspaceId, kind, selectedUdid]);

	// Esc closes the simulator surface (mirrors the browser surface in Navigate).
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onExit();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onExit]);

	return (
		<section
			aria-label="Workspace simulator surface"
			data-focus-scope="simulator"
			className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground focus:outline-none"
		>
			<div
				className={cn(
					"flex h-9 items-center gap-2 px-2",
					SIMULATOR_CHROME_BACKGROUND_CLASS,
				)}
				data-tauri-drag-region
			>
				<TrafficLightSpacer side="left" width={86} />
				<div className="flex min-w-0 flex-1 items-center">
					<DevicePicker
						kind={kind}
						selectedUdid={selectedUdid}
						onSelect={setSelectedUdid}
					/>
				</div>
				<div className="flex shrink-0 items-center pr-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onExit}
						aria-label="Close simulator view"
						className="gap-1 px-1.5 text-muted-foreground hover:text-foreground"
					>
						<span>Close</span>
					</Button>
				</div>
			</div>

			<div className="relative flex min-h-0 flex-1">
				<AgentControlBanner workspaceId={workspaceId} />
				<ScreenshotHost />
			</div>
		</section>
	);
}
