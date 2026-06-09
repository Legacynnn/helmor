import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for top-level screen headers (Dashboard, Tasks, History…).
 *
 * Renders a toolbar bar that's visually lifted off the content canvas below:
 * a `bg-muted/40` tint (the canvas itself is `bg-background`) plus a bottom
 * border. `relative z-20` keeps it above the ScreenHost drag-region overlay
 * (`z-10`) so interactive controls receive clicks, while `data-tauri-drag-region`
 * lets the empty header space drag the window — `<button>`s aren't drag regions,
 * so they still click through.
 */
export function ScreenHeader({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<header
			data-tauri-drag-region
			className={cn(
				"relative z-20 flex items-center gap-3 border-border/60 border-b bg-muted/40 px-4 py-3 text-sm",
				className,
			)}
		>
			{children}
		</header>
	);
}
