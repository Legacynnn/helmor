import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FrameDevice } from "../frame-kinds";
import type { FrameThemeClasses } from "../theme-modes";

/** Hidden connection handles. Flows enter on the left, leave on the right —
 * which draws clean horizontal arrows for the common left→right journey. */
const HANDLE =
	"!h-2 !w-2 !min-h-0 !min-w-0 !rounded-full !border-0 !bg-border opacity-0";

const DEVICE_LABEL: Record<FrameDevice, string> = {
	browser: "Web",
	app: "App",
	mobile: "Mobile",
	panel: "Panel",
	popover: "Popover",
};

/**
 * Figma-style frame shell. There is intentionally NO card around the frame —
 * just a small floating title label above the content and hidden edge handles,
 * so the embedded UI (a live preview, a device wireframe, a sticky note) floats
 * freely on the canvas and provides its own surface. The greyscale body filter
 * (wireframe theme) wraps the content.
 */
export function FrameChrome({
	title,
	device,
	badge,
	theme,
	children,
}: {
	title: string;
	device: FrameDevice;
	badge?: string;
	theme: FrameThemeClasses;
	children: ReactNode;
}) {
	return (
		<div className="relative flex h-full w-full flex-col gap-1.5">
			<Handle type="target" position={Position.Left} className={HANDLE} />
			<div className="flex shrink-0 items-center gap-1.5 px-0.5">
				<span
					className={cn(
						"min-w-0 flex-1 truncate font-medium text-mini",
						theme.header,
					)}
				>
					{title}
				</span>
				<span
					className={cn(
						"shrink-0 rounded border bg-card px-1 py-px text-nano uppercase tracking-wide",
						theme.badge,
					)}
				>
					{badge ?? DEVICE_LABEL[device]}
				</span>
			</div>
			<div className={cn("min-h-0 flex-1 overflow-hidden", theme.bodyFilter)}>
				{children}
			</div>
			<Handle type="source" position={Position.Right} className={HANDLE} />
		</div>
	);
}
