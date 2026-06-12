import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/settings";
import { SettingsGroup, SettingsRow } from "../components/settings-row";
import {
	SettingsSelect,
	type SettingsSelectOption,
} from "../components/settings-select";

/// Stringly-typed Select values — `SettingsSelect` only speaks strings,
/// so the numeric `autoCleanLogsDays` setting round-trips through these.
type LogRetention = "0" | "7" | "14" | "30";

const LOG_RETENTION_OPTIONS: readonly SettingsSelectOption<LogRetention>[] = [
	{ value: "0", label: "Off" },
	{ value: "7", label: "7 days" },
	{ value: "14", label: "14 days" },
	{ value: "30", label: "30 days" },
];

function toLogRetention(days: number): LogRetention {
	const value = String(days) as LogRetention;
	return LOG_RETENTION_OPTIONS.some((o) => o.value === value) ? value : "0";
}

/** "Auto-cleanup" group on the Storage panel — policy knobs consumed by
 *  the backend's daily cleanup task (`resources::auto_cleanup`). */
export function StorageAutoCleanupSection() {
	const { settings, updateSettings } = useSettings();

	return (
		<SettingsGroup>
			<SettingsRow
				title="Auto-prune logs"
				description="Delete log files older than the selected age, once a day"
			>
				<SettingsSelect<LogRetention>
					value={toLogRetention(settings.autoCleanLogsDays)}
					options={LOG_RETENTION_OPTIONS}
					onChange={(next) =>
						updateSettings({ autoCleanLogsDays: Number(next) })
					}
					ariaLabel="Auto-prune logs"
				/>
			</SettingsRow>
			<SettingsRow
				title="Auto-delete dead workspace files"
				description="When a workspace is archived with files left on disk, remove them during daily cleanup"
			>
				<Switch
					checked={settings.autoDeleteDeadWorkspaceFiles}
					onCheckedChange={(checked) =>
						updateSettings({ autoDeleteDeadWorkspaceFiles: checked })
					}
				/>
			</SettingsRow>
		</SettingsGroup>
	);
}
