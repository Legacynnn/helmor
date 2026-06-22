import { ScaleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanBlock } from "../mdx/parse";
import { renderBlocks } from "../render-blocks";
import { accentClasses } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type DecisionOption = {
	id: string;
	title: string;
	recommended: boolean;
	body: PlanBlock[];
};

function extractOptions(childBlocks: PlanBlock[]): DecisionOption[] {
	const options: DecisionOption[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Option") {
			continue;
		}
		options.push({
			id: block.id,
			title: block.props.title?.trim() || "Option",
			recommended: block.props.recommended === "true",
			body: block.childBlocks,
		});
	}
	return options;
}

/**
 * `Decision` presents 2–4 candidate approaches as cards. The option marked
 * `recommended` is accent-highlighted with a badge.
 */
export function Decision({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const options = extractOptions(childBlocks);
	if (options.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={ScaleIcon} title="Decision">
			<div className="grid gap-3 sm:grid-cols-2">
				{options.map((option) => {
					const styles = accentClasses(
						option.recommended ? "success" : "neutral",
					);
					return (
						<div
							key={option.id}
							className={cn("rounded-md border p-3", styles.container)}
						>
							<div className="mb-1 flex items-center gap-2">
								<span className="font-medium text-small">{option.title}</span>
								{option.recommended ? (
									<span
										className={cn(
											"ml-auto rounded border px-1.5 py-0.5 text-micro uppercase",
											styles.badge,
										)}
									>
										Recommended
									</span>
								) : null}
							</div>
							<div className="text-small text-muted-foreground">
								{renderBlocks(option.body)}
							</div>
						</div>
					);
				})}
			</div>
		</PlanBlockShell>
	);
}
