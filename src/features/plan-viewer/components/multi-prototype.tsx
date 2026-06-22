import { LayersIcon } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
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
	// Scope the animated tab indicator's layoutId to this instance so multiple
	// MultiPrototype blocks on one plan don't share (and fight over) it.
	const indicatorId = useId();
	if (variants.length === 0) {
		return null;
	}
	const current = variants[Math.min(active, variants.length - 1)];
	// Tabs live in the shell's trailing slot so the block has a single header row
	// (icon + "Prototypes" + variant tabs) instead of stacking a separate tab bar
	// and an inner bordered surface.
	const tabs = (
		<div
			className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5"
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
						"relative cursor-pointer rounded px-2.5 py-1 text-micro transition-colors",
						i === active
							? "text-primary-foreground"
							: "text-muted-foreground hover:bg-muted",
					)}
				>
					{i === active ? (
						<motion.span
							layoutId={`prototype-tab-${indicatorId}`}
							className="absolute inset-0 rounded bg-primary"
							transition={{ type: "spring", stiffness: 520, damping: 36 }}
						/>
					) : null}
					<span className={cn("relative z-10", i === active && "font-medium")}>
						{variant.label}
						{variant.recommended ? <span aria-hidden="true"> ★</span> : null}
					</span>
				</button>
			))}
		</div>
	);
	return (
		<PlanBlockShell
			accent="neutral"
			icon={LayersIcon}
			title="Prototypes"
			badge={tabs}
		>
			<motion.div
				key={current.id}
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
			>
				{renderBlocks(current.body)}
			</motion.div>
		</PlanBlockShell>
	);
}
