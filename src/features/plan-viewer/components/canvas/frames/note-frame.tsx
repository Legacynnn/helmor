import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { renderBlocks } from "../../../render-blocks";
import type { FrameData } from "../build-graph";
import { frameTheme, solidSurface } from "../theme-modes";
import { FrameChrome } from "./frame-chrome";

/** A sticky-note frame: pinned rationale / markdown. Uses a SOLID `bg-card`
 * surface with an accent border (never translucent) so it reads as a real note
 * on any theme. Also the back-compat renderer for old mind-map nodes. */
export function NoteFrame({ data }: NodeProps) {
	const d = data as unknown as FrameData;
	const theme = frameTheme(d.theme, d.accent);
	return (
		<FrameChrome title={d.title} device={d.device} badge="Note" theme={theme}>
			<div
				className={cn(
					"h-full overflow-auto rounded-md px-3 py-2 text-micro text-muted-foreground",
					solidSurface(d.theme, d.accent),
				)}
			>
				{d.bodyBlocks.length > 0 ? renderBlocks(d.bodyBlocks) : null}
			</div>
		</FrameChrome>
	);
}
