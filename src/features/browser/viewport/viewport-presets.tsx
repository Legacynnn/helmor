import { Button } from "@/components/ui/button";
import { DEVICE_PRESETS, type ViewportPresetId } from "./presets";

type ViewportPresetsProps = {
	value: ViewportPresetId;
	onChange: (id: ViewportPresetId) => void;
};

/** Toolbar control: pick a device viewport preset (mobile/tablet/desktop). */
export function ViewportPresets({ value, onChange }: ViewportPresetsProps) {
	return (
		<div className="flex items-center gap-1" aria-label="Device viewport">
			{DEVICE_PRESETS.map((preset) => (
				<Button
					key={preset.id}
					type="button"
					size="sm"
					variant={value === preset.id ? "secondary" : "ghost"}
					aria-pressed={value === preset.id}
					className="cursor-pointer"
					onClick={() => onChange(preset.id)}
				>
					{preset.label}
				</Button>
			))}
		</div>
	);
}
