import { lazy, Suspense } from "react";
import type { PlanBlock } from "../../mdx/parse";

const PlanCanvasSurface = lazy(() => import("./plan-canvas-surface"));

export type PlanCanvasProps = {
	childBlocks?: PlanBlock[];
	direction?: string;
};

/** Entry registered in the plan component registry (structured child mode). */
export function PlanCanvas({ childBlocks = [], direction }: PlanCanvasProps) {
	return (
		<Suspense
			fallback={
				<div className="h-[460px] w-full animate-pulse border-border border-b bg-background" />
			}
		>
			<PlanCanvasSurface childBlocks={childBlocks} direction={direction} />
		</Suspense>
	);
}
