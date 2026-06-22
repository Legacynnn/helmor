import { ImageIcon, LayoutIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PlanBlockShell } from "../shell/plan-block-shell";
import { parseWireframe, type WireframeNode } from "./parse-wireframe";

function renderChildren(nodes: WireframeNode[]): ReactNode {
	return nodes.map((node, i) => (
		<WireframePiece key={`${node.type}-${i}-${node.label}`} node={node} />
	));
}

function WireframePiece({ node }: { node: WireframeNode }) {
	switch (node.type) {
		case "row":
			return (
				<div className="flex flex-wrap items-start gap-2">
					{renderChildren(node.children)}
				</div>
			);
		case "col":
			return (
				<div className="flex flex-col gap-2">
					{renderChildren(node.children)}
				</div>
			);
		case "box":
			return (
				<div className="rounded border border-border border-dashed p-2">
					{node.label ? (
						<div className="mb-1 text-micro text-muted-foreground">
							{node.label}
						</div>
					) : null}
					{renderChildren(node.children)}
				</div>
			);
		case "text":
			return <p className="text-small text-foreground">{node.label}</p>;
		case "input":
			return (
				<div className="rounded border border-border bg-muted/30 px-2 py-1 text-micro text-muted-foreground">
					{node.label || "Input"}
				</div>
			);
		case "button":
			return (
				<div className="inline-flex w-fit rounded bg-foreground/80 px-3 py-1 text-background text-micro">
					{node.label || "Button"}
				</div>
			);
		case "image":
			return (
				<div className="flex h-16 items-center justify-center gap-1 rounded border border-border bg-muted/30 text-micro text-muted-foreground">
					<ImageIcon className="size-4" />
					{node.label}
				</div>
			);
		case "divider":
			return <hr className="border-border" />;
	}
}

/**
 * `Wireframe` renders a static low-fidelity mockup from the wireframe line-DSL
 * (see {@link parseWireframe}). The optional `label` becomes the panel title.
 */
export function Wireframe({
	label,
	children = "",
}: {
	label?: string;
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
			<div className="flex flex-col gap-2">{renderChildren(nodes)}</div>
		</PlanBlockShell>
	);
}
