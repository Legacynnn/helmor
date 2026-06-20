import { cn } from "@/lib/utils";
import { PlanMarkdown } from "./plan-markdown";

/**
 * `Steps` wraps step-by-step plan content. The flat MDX parser does not
 * recurse into nested components, so `Steps` simply renders its raw markdown
 * children. Nested `<Step>` parsing is a v2 follow-up; for now author steps as
 * an ordered/numbered markdown list inside `<Steps>`.
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

/**
 * Standalone titled step. Rendered when authored as a top-level component;
 * not recursed into from `Steps` in v1.
 */
export function Step({
	title,
	children = "",
}: {
	title?: string;
	children?: string;
}) {
	return (
		<div className="my-3">
			{title ? (
				<div className="mb-1 font-medium text-small">{title}</div>
			) : null}
			<PlanMarkdown>{children}</PlanMarkdown>
		</div>
	);
}
