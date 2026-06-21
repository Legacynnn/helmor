import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * `Steps` wraps step-by-step plan content. Children are rendered plan blocks
 * (prose, or — under the recursive renderer — nested components). For a simple
 * step list, put a markdown (ordered/numbered) list inside `<Steps>`.
 */
export function Steps({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"my-4 rounded-lg border border-border/70 bg-muted/20 p-4",
				className,
			)}
		>
			{children}
		</div>
	);
}
