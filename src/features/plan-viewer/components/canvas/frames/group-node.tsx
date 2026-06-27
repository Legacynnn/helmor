import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { accentClasses, type PlanAccent } from "../../shell/accent";
import type { CanvasTheme } from "../theme-modes";

export type GroupData = {
	title: string;
	accent: PlanAccent;
	theme: CanvasTheme;
};

/** A section background that visually frames a set of member frames. It sits
 * behind the frames and ignores pointer events so the frames stay interactive. */
export function GroupNode({ data }: NodeProps) {
	const d = data as unknown as GroupData;
	const styles = accentClasses(d.theme === "wireframe" ? "neutral" : d.accent);
	return (
		<div
			className={cn(
				// No fill — just a faint dashed outline so the section frames its
				// members without caging them in a solid box.
				"pointer-events-none relative h-full w-full rounded-2xl border border-dashed",
				styles.badge,
				"bg-transparent opacity-70",
			)}
		>
			{d.title ? (
				<span
					className={cn(
						"absolute top-2 left-3 inline-flex items-center font-medium text-nano uppercase tracking-wide",
						styles.header,
					)}
				>
					{d.title}
				</span>
			) : null}
		</div>
	);
}
