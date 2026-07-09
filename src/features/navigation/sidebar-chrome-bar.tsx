import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { cn } from "@/lib/utils";

/**
 * The shared chrome strip at the very top of BOTH sidebars (Threads / normal and
 * Canvas), so the two spaces present an identical header: macOS traffic-light
 * room, back/forward affordances, a sidebar-collapse toggle, and a draggable
 * filler that moves the window. Keeping it in one component is what guarantees
 * the two headers stay pixel-identical.
 *
 * The back/forward arrows are intentionally inert for now — they reserve the
 * spot and set the visual language; history navigation gets wired in later.
 */
export function SidebarChromeBar({
	onToggleCollapse,
	collapseLabel = "Collapse sidebar",
	collapseShortcut,
	trafficLightWidth = 94,
	className,
}: {
	onToggleCollapse: () => void;
	collapseLabel?: string;
	collapseShortcut?: string | null;
	trafficLightWidth?: number;
	className?: string;
}) {
	return (
		<div
			data-slot="window-safe-top"
			className={cn("flex h-9 shrink-0 items-center gap-0.5 pr-2", className)}
		>
			{/* Fullscreen has no traffic lights — reclaim the reserved space. */}
			<TrafficLightSpacer
				side="left"
				width={trafficLightWidth}
				className="[.app-fullscreen_&]:!w-0"
			/>
			{/* Control cluster — back / forward / collapse stay grouped together.
			 *  Windowed: sits on the left, right after the macOS controls.
			 *  Fullscreen (no traffic lights): `order-last` drops the whole cluster
			 *  after the flex-1 drag filler, pinning it to the sidebar's right edge. */}
			<div className="flex items-center gap-0.5 [.app-fullscreen_&]:order-last">
				<NavArrow Icon={ArrowLeft} label="Back" />
				<NavArrow Icon={ArrowRight} label="Forward" />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							aria-label={collapseLabel}
							onClick={onToggleCollapse}
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
						>
							<PanelLeft className="size-4" strokeWidth={1.8} />
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side="bottom"
						className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
					>
						<span>{collapseLabel}</span>
						{collapseShortcut ? (
							<InlineShortcutDisplay
								hotkey={collapseShortcut}
								className="text-background/60"
							/>
						) : null}
					</TooltipContent>
				</Tooltip>
			</div>
			<div data-tauri-drag-region className="h-full flex-1" />
		</div>
	);
}

/** Inert back/forward affordance — disabled until history nav is wired. */
function NavArrow({ Icon, label }: { Icon: typeof ArrowLeft; label: string }) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled
			tabIndex={-1}
			className="flex size-6 items-center justify-center rounded-sm text-muted-foreground/45"
		>
			<Icon className="size-4" strokeWidth={1.8} />
		</button>
	);
}
