import { cn } from "@/lib/utils";
import { PlanMarkdown } from "./plan-markdown";

/**
 * `Steps` wraps step-by-step plan content. The flat MDX parser does not
 * recurse into nested components, so `Steps` simply renders its raw markdown
 * children. Nested `<Step>` components are a v2 follow-up; for v1 put a
 * markdown (ordered/numbered) list inside `<Steps>`.
 */
export function Steps({
	children = "",
	className,
}: {
	children?: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"my-4 rounded-lg border border-border/70 bg-muted/20 p-4",
				className,
			)}
		>
			<PlanMarkdown>{children}</PlanMarkdown>
		</div>
	);
}
