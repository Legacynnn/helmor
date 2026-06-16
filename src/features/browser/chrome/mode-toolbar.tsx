// Inspector mode toolbar for the browser surface. One mode is active at a time;
// clicking a button sets the bridge mode via `onSetMode`, and Esc snaps back to
// Navigate (`"none"`). Draw is rendered but disabled (Phase 4). An optional
// Console toggle reveals the buffered console/network panel without changing the
// active inspector mode. When Draw is active the surface renders the
// DrawToolPalette alongside. Purely presentational — all state lives upstream.
import {
	Circle,
	MessageSquare,
	MousePointer2,
	Pencil,
	Terminal,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BridgeMode } from "../bridge/channel";
import type { ViewportPresetId } from "../viewport/presets";
import { ViewportPresets } from "../viewport/viewport-presets";

type ModeButton = {
	mode: BridgeMode;
	label: string;
	icon: typeof MessageSquare;
	disabled?: boolean;
	disabledHint?: string;
};

const MODE_BUTTONS: ModeButton[] = [
	{ mode: "none", label: "Navigate", icon: MousePointer2 },
	{ mode: "comment", label: "Comment", icon: MessageSquare },
	{ mode: "pick", label: "Pick", icon: MousePointer2 },
	{
		mode: "draw",
		label: "Draw",
		icon: Pencil,
	},
];

type ModeToolbarProps = {
	mode: BridgeMode;
	onSetMode: (mode: BridgeMode) => void;
	/** Whether the console/network panel is visible. */
	consoleOpen?: boolean;
	/** Toggle the console/network panel. When omitted the button is hidden. */
	onToggleConsole?: () => void;
	/** Active device viewport preset. When omitted the picker is hidden. */
	viewportPreset?: ViewportPresetId;
	/** Change the active device viewport preset. */
	onViewportPresetChange?: (id: ViewportPresetId) => void;
	/** Whether flow recording is active. */
	flowRecording?: boolean;
	/** Toggle flow recording. When omitted the button is hidden. */
	onToggleFlowRecording?: () => void;
};

export function ModeToolbar({
	mode,
	onSetMode,
	consoleOpen,
	onToggleConsole,
	viewportPreset,
	onViewportPresetChange,
	flowRecording,
	onToggleFlowRecording,
}: ModeToolbarProps) {
	// Esc returns to Navigate, mirroring inspector tools elsewhere.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (mode === "none") return;
			onSetMode("none");
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [mode, onSetMode]);

	return (
		<div
			role="toolbar"
			aria-label="Inspector mode"
			className="flex items-center gap-0.5"
		>
			{MODE_BUTTONS.map((button) => {
				const Icon = button.icon;
				const active = !button.disabled && mode === button.mode;
				return (
					<Tooltip key={button.label}>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								disabled={button.disabled}
								aria-label={button.label}
								aria-pressed={active}
								onClick={() => onSetMode(button.mode)}
								className={cn(
									"text-muted-foreground hover:text-foreground",
									active && "bg-accent/70 text-foreground",
								)}
							>
								<Icon className="size-3.5" strokeWidth={1.8} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{button.disabled
								? (button.disabledHint ?? button.label)
								: button.label}
						</TooltipContent>
					</Tooltip>
				);
			})}

			{viewportPreset && onViewportPresetChange ? (
				<ViewportPresets
					value={viewportPreset}
					onChange={onViewportPresetChange}
				/>
			) : null}

			{onToggleFlowRecording ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Record flow"
							aria-pressed={Boolean(flowRecording)}
							onClick={onToggleFlowRecording}
							className={cn(
								"text-muted-foreground hover:text-foreground",
								flowRecording && "bg-accent/70 text-destructive",
							)}
						>
							<Circle
								className={cn("size-3.5", flowRecording && "fill-current")}
								strokeWidth={1.8}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{flowRecording ? "Stop recording flow" : "Record flow"}
					</TooltipContent>
				</Tooltip>
			) : null}

			{onToggleConsole ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Console"
							aria-pressed={Boolean(consoleOpen)}
							onClick={onToggleConsole}
							className={cn(
								"text-muted-foreground hover:text-foreground",
								consoleOpen && "bg-accent/70 text-foreground",
							)}
						>
							<Terminal className="size-3.5" strokeWidth={1.8} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Console</TooltipContent>
				</Tooltip>
			) : null}
		</div>
	);
}
