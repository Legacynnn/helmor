import { LayersIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Variant = {
	id: string;
	label: string;
	recommended: boolean;
	body: PlanBlock[];
};

function extractVariants(childBlocks: PlanBlock[]): Variant[] {
	const variants: Variant[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Variant") {
			continue;
		}
		variants.push({
			id: block.id,
			label:
				block.props.label?.trim() ||
				block.props.name?.trim() ||
				`Variant ${variants.length + 1}`,
			recommended: block.props.recommended === "true",
			body: block.childBlocks,
		});
	}
	return variants;
}

/**
 * `MultiPrototype` compares 2–4 prototype `<Variant>`s in tabs, showing one at a
 * time. The variant marked `recommended` is starred.
 */
export function MultiPrototype({
	childBlocks = [],
}: {
	childBlocks?: PlanBlock[];
}) {
	const variants = extractVariants(childBlocks);
	const [active, setActive] = useState(0);
	if (variants.length === 0) {
		return null;
	}
	const current = variants[Math.min(active, variants.length - 1)];
	return (
		<PlanBlockShell accent="neutral" icon={LayersIcon} title="Prototypes">
			<div
				className="mb-3 inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5"
				role="tablist"
				aria-label="Prototype variants"
			>
				{variants.map((variant, i) => (
					<button
						key={variant.id}
						type="button"
						role="tab"
						aria-selected={i === active}
						onClick={() => setActive(i)}
						className={cn(
							"cursor-pointer rounded px-2.5 py-1 text-micro transition-colors",
							i === active
								? "bg-primary font-medium text-primary-foreground"
								: "text-muted-foreground hover:bg-muted",
						)}
					>
						{variant.label}
						{variant.recommended ? <span aria-hidden="true"> ★</span> : null}
					</button>
				))}
			</div>
			<div className="rounded-md border border-border bg-background p-3">
				{renderBlocks(current.body)}
			</div>
		</PlanBlockShell>
	);
}
