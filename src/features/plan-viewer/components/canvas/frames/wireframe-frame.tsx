import type { NodeProps } from "@xyflow/react";
import { parseWireframe } from "../../wireframe/parse-wireframe";
import { renderChildren } from "../../wireframe/primitives";
import { WireframeFrame as WireframeDeviceFrame } from "../../wireframe/surface-frame";
import type { FrameData } from "../build-graph";
import { frameTheme } from "../theme-modes";
import { FrameChrome } from "./frame-chrome";

/** A frame holding a low-fidelity wireframe. Reuses the existing wireframe DSL
 * parser + primitive renderer inside the existing device/window chrome — that
 * chrome IS the frame's surface, so the frame itself stays card-less. */
export function WireframeFrame({ data }: NodeProps) {
	const d = data as unknown as FrameData;
	const nodes = parseWireframe(d.wireframeSource);
	const theme = frameTheme(d.theme, d.accent);
	return (
		<FrameChrome
			title={d.title}
			device={d.device}
			badge="Wireframe"
			theme={theme}
		>
			<div className="h-full overflow-auto">
				<WireframeDeviceFrame surface={d.device}>
					{renderChildren(nodes, false, true)}
				</WireframeDeviceFrame>
			</div>
		</FrameChrome>
	);
}
