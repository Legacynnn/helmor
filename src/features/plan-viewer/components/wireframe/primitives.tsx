import { ImageIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WireframeNode } from "./parse-wireframe";

/** Labels that read as a round avatar rather than a rectangular image. */
const AVATAR_RE = /\b(avatar|profile|user|me|account)\b/i;

/** Static column classes (Tailwind can't see dynamically-built class names). */
const GRID_COLS: Record<number, string> = {
	1: "grid-cols-1",
	2: "grid-cols-2",
	3: "grid-cols-3",
	4: "grid-cols-4",
};

/**
 * Render a list of wireframe nodes, keyed stably by position + type + label.
 * `inline` is true when the nodes sit in a horizontal `row`, so leaves with a
 * block default (notably `image`) render compactly. `stagger` wraps each node in
 * a one-shot entrance animation (used only for the top-level frame body) so a
 * mockup eases in instead of popping.
 */
export function renderChildren(
	nodes: WireframeNode[],
	inline = false,
	stagger = false,
): ReactNode {
	return nodes.map((node, i) => {
		const piece = (
			<WireframePiece
				key={`${node.type}-${i}-${node.label}`}
				node={node}
				inline={inline}
			/>
		);
		if (!stagger) {
			return piece;
		}
		const style: CSSProperties = {
			animationDuration: "320ms",
			animationDelay: `${Math.min(i, 8) * 45}ms`,
			animationFillMode: "both",
		};
		return (
			<div
				key={`stagger-${node.type}-${i}-${node.label}`}
				className="animate-in fade-in-0 slide-in-from-bottom-2"
				style={style}
			>
				{piece}
			</div>
		);
	});
}

/**
 * Render a single wireframe primitive. Everything is themed via `--*` tokens
 * (never hardcoded white/hex) so the mockup reads correctly in light and dark,
 * and surfaces stay flat + bordered (no shadows). Containers (`row`/`col`/`grid`
 * /`section`/`box`) recurse; the rest are leaves. `inline` lets a leaf adapt to
 * a horizontal row.
 */
function WireframePiece({
	node,
	inline = false,
}: {
	node: WireframeNode;
	inline?: boolean;
}) {
	switch (node.type) {
		case "row":
			// A row lays its children out horizontally → render them inline.
			return (
				<div className="flex flex-wrap items-center gap-2">
					{renderChildren(node.children, true)}
				</div>
			);
		case "col":
			return (
				<div className="flex min-w-0 flex-col gap-2">
					{renderChildren(node.children)}
				</div>
			);
		case "grid": {
			// `grid` or `grid <n>` (2–4 columns; defaults to 2) for dense layouts.
			const cols = Math.min(
				Math.max(Number.parseInt(node.label, 10) || 2, 1),
				4,
			);
			return (
				<div className={cn("grid gap-2.5", GRID_COLS[cols])}>
					{renderChildren(node.children)}
				</div>
			);
		}
		case "section":
			// A labelled group: a quiet caption above its content, no heavy border.
			return (
				<div className="flex min-w-0 flex-col gap-1.5">
					{node.label ? (
						<div className="font-medium text-muted-foreground text-nano uppercase tracking-wide">
							{node.label}
						</div>
					) : null}
					<div className="flex flex-col gap-2">
						{renderChildren(node.children)}
					</div>
				</div>
			);
		case "box":
			// A card: optional header bar with a divider, then padded content — reads
			// like a real panel rather than a loose bordered stack.
			return (
				<div
					className={cn(
						"overflow-hidden rounded-md border border-border bg-background",
						inline ? "min-w-0" : "w-full",
					)}
				>
					{node.label ? (
						<div className="border-border/60 border-b bg-muted/30 px-2.5 py-1.5 font-medium text-foreground text-micro">
							{node.label}
						</div>
					) : null}
					<div className="flex flex-col gap-2 p-2.5">
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
				<div className={cn("flex flex-col gap-1", inline && "min-w-[8rem]")}>
					{node.label ? (
						<span className="text-muted-foreground text-nano uppercase tracking-wide">
							{node.label}
						</span>
					) : null}
					<span className="block h-6 rounded border border-border bg-muted/40" />
				</div>
			);
		case "input":
			return (
				<div
					className={cn(
						"rounded border border-border bg-muted/40 px-2 py-1.5 text-micro text-muted-foreground",
						inline && "min-w-[8rem]",
					)}
				>
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
		case "spacer":
			// Elastic gap: pushes the siblings on either side apart (e.g. logo left,
			// actions right in a top bar).
			return <div aria-hidden="true" className="min-w-2 flex-1" />;
		case "image": {
			// Inline (in a row) → a compact avatar/icon tile so it doesn't blow out
			// the row height; round it when the label reads like an avatar. Block
			// (in a col/box) → a full-width banner placeholder.
			if (inline) {
				return (
					<span
						title={node.label || "image"}
						className={cn(
							"flex size-9 shrink-0 items-center justify-center border border-border border-dashed bg-muted/40 text-muted-foreground",
							AVATAR_RE.test(node.label) ? "rounded-full" : "rounded-md",
						)}
					>
						<ImageIcon className="size-4" />
					</span>
				);
			}
			return (
				<div className="flex h-20 w-full items-center justify-center gap-1 rounded-md border border-border border-dashed bg-muted/40 text-micro text-muted-foreground">
					<ImageIcon className="size-4" />
					{node.label}
				</div>
			);
		}
		case "divider":
			return <hr className="border-border" />;
		default: {
			// Exhaustiveness guard: adding a type to `WireframeNode["type"]`
			// without a case here becomes a compile error instead of a silent
			// blank render.
			const _exhaustive: never = node.type;
			return _exhaustive;
		}
	}
}
