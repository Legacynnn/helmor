import { ListChecksIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlanBlockShell } from "./shell/plan-block-shell";

/**
 * `Steps` wraps step-by-step plan content. Children are rendered plan blocks;
 * for a simple step list, put a markdown ordered list inside `<Steps>`.
 */
export function Steps({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<PlanBlockShell
			accent="neutral"
			icon={ListChecksIcon}
			title="Steps"
			className={className}
		>
			{children}
		</PlanBlockShell>
	);
}
