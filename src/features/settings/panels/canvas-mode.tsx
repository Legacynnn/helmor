import { LayoutGrid } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/lib/settings";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

/// Settings → Experimental panel for Infinite Canvas mode (epic #61). When on,
/// a "Canvas mode" control appears in each workspace's header so it can be
/// toggled into the free-form spatial canvas. Off hides it everywhere and
/// forces any canvas-active workspace back to the normal 3-column layout.
export function CanvasModePanel({
	settings,
	updateSettings,
}: {
	settings: AppSettings;
	updateSettings: (patch: Partial<AppSettings>) => void;
}) {
	return (
		<SettingsGroup>
			<SettingsRow
				align="start"
				title={
					<span className="flex items-center gap-1.5">
						<LayoutGrid
							className="size-3.5 text-muted-foreground"
							strokeWidth={1.8}
						/>
						<span>Infinite Canvas (experimental)</span>
					</span>
				}
				description="Toggle a workspace into a free-form spatial canvas — place, size, and connect conversation, terminal, notes, drawing, file, and editor panels. Layout persists per workspace."
			>
				<Switch
					checked={settings.canvasModeEnabled}
					onCheckedChange={(checked) =>
						updateSettings({ canvasModeEnabled: checked })
					}
					aria-label="Infinite Canvas (experimental)"
				/>
			</SettingsRow>
		</SettingsGroup>
	);
}
