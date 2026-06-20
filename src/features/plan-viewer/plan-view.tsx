import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { UnsupportedBlock } from "./components/placeholder";
import { PlanMarkdown } from "./components/plan-markdown";
import { parsePlanMdx } from "./mdx/parse";
import { PLAN_COMPONENTS } from "./mdx/registry";

/**
 * Presentational plan surface. Parses MDX content into ordered blocks and
 * renders prose via {@link PlanMarkdown} and components via the allowlisted
 * {@link PLAN_COMPONENTS} map (falling back to {@link UnsupportedBlock}). The
 * toolbar exposes the three lifecycle actions as plain callbacks so this stays
 * data-source agnostic — the container wires them to real mutations.
 */
export function PlanView({
	content,
	status,
	onRequestChanges,
	onApprove,
	onHandoff,
}: {
	content: string;
	status: string;
	onRequestChanges: () => void;
	onApprove: () => void;
	onHandoff: () => void;
}) {
	const { blocks } = useMemo(() => parsePlanMdx(content), [content]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-2">
				<span className="font-medium text-muted-foreground text-small">
					Plan · {status}
				</span>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={onRequestChanges}>
						Request changes
					</Button>
					<Button variant="outline" size="sm" onClick={onApprove}>
						Approve
					</Button>
					<Button size="sm" onClick={onHandoff}>
						Handoff
					</Button>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{blocks.map((block) => {
					if (block.kind === "prose") {
						return <PlanMarkdown key={block.id}>{block.markdown}</PlanMarkdown>;
					}
					const Cmp = PLAN_COMPONENTS[block.name];
					if (!Cmp) {
						return <UnsupportedBlock key={block.id} name={block.name} />;
					}
					return (
						<Cmp key={block.id} {...block.props}>
							{block.children}
						</Cmp>
					);
				})}
			</div>
		</div>
	);
}
