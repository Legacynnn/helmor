import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { WireframeNode } from "./parse-wireframe";

/** Render a list of wireframe nodes, keyed stably by position + type + label. */
export function renderChildren(nodes: WireframeNode[]): ReactNode {
	return nodes.map((node, i) => (
		<WireframePiece key={`${node.type}-${i}-${node.label}`} node={node} />
	));
}

/**
 * Render a single wireframe primitive. Everything is themed via `--*` tokens
 * (never hardcoded white/hex) so the mockup reads correctly in light and dark,
 * and surfaces stay flat + bordered (no shadows). Containers (`row`/`col`/`box`)
 * recurse; the rest are leaves.
 */
function WireframePiece({ node }: { node: WireframeNode }) {
	switch (node.type) {
		case "row":
			return (
				<div className="flex flex-wrap items-center gap-2">
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
				<div className="rounded-md border border-border bg-background p-2.5">
					{node.label ? (
						<div className="mb-1.5 font-medium text-foreground text-micro">
							{node.label}
						</div>
					) : null}
					<div className="flex flex-col gap-2">
						{renderChildren(node.children)}
					</div>
				</div>
			);
		case "heading":
			return (
				<div className="font-semibold text-foreground text-small">
					{node.label}
				</div>
			);
		case "text":
			return (
				<p className="text-micro text-muted-foreground leading-relaxed">
					{node.label}
				</p>
			);
		case "field":
			// A mockup field, not a real form control — a plain div avoids the
			// label-without-control a11y rule while reading as a labeled input.
			return (
				<div className="flex flex-col gap-1">
					{node.label ? (
						<span className="text-muted-foreground text-nano uppercase tracking-wide">
							{node.label}
						</span>
					) : null}
					<span className="rounded border border-border bg-muted/40 px-2 py-1.5 text-micro text-muted-foreground">
						{" "}
					</span>
				</div>
			);
		case "input":
			return (
				<div className="rounded border border-border bg-muted/40 px-2 py-1.5 text-micro text-muted-foreground">
					{node.label || "Input"}
				</div>
			);
		case "pill":
			return (
				<span className="inline-flex w-fit items-center rounded-full border border-border bg-background px-2 py-0.5 text-foreground text-nano">
					{node.label || "Tag"}
				</span>
			);
		case "button":
			return (
				<span className="inline-flex w-fit items-center rounded-md bg-primary px-3 py-1 font-medium text-micro text-primary-foreground">
					{node.label || "Button"}
				</span>
			);
		case "image":
			return (
				<div className="flex h-16 items-center justify-center gap-1 rounded-md border border-border border-dashed bg-muted/40 text-micro text-muted-foreground">
					<ImageIcon className="size-4" />
					{node.label}
				</div>
			);
		case "divider":
			return <hr className="border-border" />;
	}
}
