import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { cn } from "@/lib/utils";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";

/** Which screen edge the enclosing rail is pinned to. Tooltips open toward the
 * canvas interior (away from the edge), so a right-edge rail tooltips left. */
const RailSideContext = createContext<"left" | "right">("left");

/** Vertically-centered Apple liquid-glass rail pinned to a screen edge. The
 * optional `className` is merged last, so callers can override the edge inset
 * (e.g. shift a left rail right to clear the floating workspaces sidebar). */
export function GlassRail({
	side,
	className,
	children,
}: {
	side: "left" | "right";
	className?: string;
	children: ReactNode;
}) {
	return (
		<RailSideContext.Provider value={side}>
			<div
				className={cn(
					"-translate-y-1/2 pointer-events-auto absolute top-1/2 z-10 flex flex-col gap-1 rounded-[20px] p-1.5 transition-[left] duration-200 ease-out",
					"border border-white/15 bg-app-base/40 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl",
					side === "left" ? "left-3" : "right-3",
					className,
				)}
			>
				{children}
			</div>
		</RailSideContext.Provider>
	);
}

/** One icon button inside a GlassRail. */
export function RailButton({
	icon: Icon,
	label,
	armed = false,
	disabled = false,
	shortcut,
	onClick,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	armed?: boolean;
	disabled?: boolean;
	/** Resolved hotkey string (e.g. "Mod+Alt+C") shown in the tooltip. */
	shortcut?: string | null;
	onClick?: () => void;
}) {
	const railSide = useContext(RailSideContext);
	const tooltipSide = railSide === "right" ? "left" : "right";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-pressed={armed}
					disabled={disabled}
					onClick={onClick}
					className={cn(
						"flex size-9 cursor-pointer items-center justify-center rounded-[14px] text-app-foreground/80 transition-colors hover:bg-white/10 hover:text-app-foreground",
						disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
					)}
					style={
						armed
							? {
									backgroundColor: `color-mix(in oklab, ${SELECTED_COLOR} 18%, transparent)`,
									color: SELECTED_COLOR,
									boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${SELECTED_COLOR} 45%, transparent)`,
								}
							: undefined
					}
				>
					<Icon className="size-4.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side={tooltipSide} className="flex items-center gap-2">
				<span>{label}</span>
				{shortcut ? (
					<InlineShortcutDisplay
						hotkey={shortcut}
						className="text-background/60"
					/>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
