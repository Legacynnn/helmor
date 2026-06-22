import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { accentClasses, type PlanAccent } from "./accent";

export type PlanBlockShellProps = {
	/** Semantic accent driving border/header/background. Defaults to neutral. */
	accent?: PlanAccent;
	/** Optional leading header icon. */
	icon?: LucideIcon;
	/** Optional header title. When omitted (with no icon/badge) the header row
	 * is not rendered at all. */
	title?: ReactNode;
	/** Optional trailing chip pinned to the right of the header. */
	badge?: ReactNode;
	/** Extra classes for the outer <section>. */
	className?: string;
	/** Extra classes for the body wrapper (e.g. "p-0" for full-bleed lists). */
	bodyClassName?: string;
	children?: ReactNode;
};

/**
 * Shared container for every plan block. Provides a consistent rounded border,
 * an optional accent-colored header row (icon + title + trailing badge), and a
 * padded body. Components compose this instead of hand-rolling card markup so
 * the whole Plan view shares one visual language.
 */
export function PlanBlockShell({
	accent = "neutral",
	icon: Icon,
	title,
	badge,
	className,
	bodyClassName,
	children,
}: PlanBlockShellProps) {
	const styles = accentClasses(accent);
	const hasHeader = Icon != null || title != null || badge != null;

	return (
		<section
			className={cn(
				"my-4 overflow-hidden rounded-lg border",
				styles.container,
				className,
			)}
		>
			{hasHeader ? (
				<div
					className={cn(
						"flex items-center gap-2 border-b border-border/50 px-3 py-2 font-medium text-small",
						styles.header,
					)}
				>
					{Icon ? <Icon className="size-4 shrink-0" /> : null}
					{title != null ? <span>{title}</span> : null}
					{badge != null ? <span className="ml-auto">{badge}</span> : null}
				</div>
			) : null}
			<div className={cn("p-4", bodyClassName)}>{children}</div>
		</section>
	);
}
