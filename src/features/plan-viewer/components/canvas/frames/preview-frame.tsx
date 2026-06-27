import type { NodeProps } from "@xyflow/react";
import { LiveCodePreview } from "../../preview/live-code-preview";
import type { FrameData } from "../build-graph";
import { frameTheme } from "../theme-modes";
import { FrameChrome } from "./frame-chrome";

/** A frame hosting a live React/Tailwind preview. The preview mounts live —
 * React Flow's `onlyRenderVisibleElements` keeps off-screen frames from mounting
 * their sandboxed iframe until they scroll into view, so this stays smooth. */
export function PreviewFrame({ data }: NodeProps) {
	const d = data as unknown as FrameData;
	const theme = frameTheme(d.theme, d.accent);
	return (
		<FrameChrome title={d.title} device={d.device} badge="Live" theme={theme}>
			{d.previewCode.length > 0 ? (
				<LiveCodePreview code={d.previewCode} />
			) : null}
		</FrameChrome>
	);
}
