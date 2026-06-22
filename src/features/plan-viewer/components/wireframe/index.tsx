import { LayoutIcon } from "lucide-react";
import { PlanBlockShell } from "../shell/plan-block-shell";
import { parseWireframe } from "./parse-wireframe";
import { renderChildren } from "./primitives";
import { normalizeSurface, WireframeFrame } from "./surface-frame";

/**
 * `Wireframe` renders a static low-fidelity mockup from the wireframe line-DSL
 * (see {@link parseWireframe}) inside device/window chrome chosen by `surface`
 * (`browser` | `app` | `mobile` | `panel` | `popover`). The optional `label`
 * becomes the panel title.
 */
export function Wireframe({
	label,
	surface,
	children = "",
}: {
	label?: string;
	surface?: string;
	children?: string;
}) {
	const nodes = parseWireframe(children);
	if (nodes.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell
			accent="neutral"
			icon={LayoutIcon}
			title={label || "Wireframe"}
		>
			<WireframeFrame surface={normalizeSurface(surface)}>
				{renderChildren(nodes, false, true)}
			</WireframeFrame>
		</PlanBlockShell>
	);
}
