import { MessageSquarePlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BlockComment } from "./feedback";
import type { PlanBlock } from "./mdx/parse";
import { parsePlanMdx } from "./mdx/parse";
import { renderBlock } from "./render-blocks";

/** Human-readable label for a block, used in the comment affordance and the
 *  feedback prompt. Component blocks use their MDX name; prose blocks fall back
 *  to their first heading text (if any) or a generic "Prose" label. */
function blockLabel(block: PlanBlock): string {
	if (block.kind === "component") {
		return block.name;
	}
	const heading = /^#{1,6}\s+(.+?)\s*$/m.exec(block.markdown);
	if (heading) {
		return heading[1].trim();
	}
	return "Prose";
}

/**
 * Presentational plan surface. Parses MDX content into ordered blocks and
 * renders each top-level block via {@link renderBlock} (prose as markdown,
 * components via the allowlisted registry, falling back to a placeholder). Each
 * block carries a comment affordance: clicking it opens an inline input that
 * collects a block-anchored note. The toolbar's "Request changes" gathers the
 * non-empty notes into {@link BlockComment}[] and hands them to
 * `onRequestChanges` (the container builds the prompt + submits to the agent).
 */
export function PlanView({
	content,
	status,
	onRequestChanges,
	onHandoff,
}: {
	content: string;
	status: string;
	onRequestChanges: (comments: BlockComment[]) => void;
	onHandoff: () => void;
}) {
	const { blocks } = useMemo(() => parsePlanMdx(content), [content]);
	// Note text keyed by block id. A block is "commented" once its entry is a
	// non-empty trimmed string.
	const [comments, setComments] = useState<Record<string, string>>({});
	// Which block ids currently show their inline comment input.
	const [openInputs, setOpenInputs] = useState<Record<string, boolean>>({});

	const labelById = useMemo(() => {
		const map: Record<string, string> = {};
		for (const block of blocks) {
			map[block.id] = blockLabel(block);
		}
		return map;
	}, [blocks]);

	const hasComments = useMemo(
		() => Object.values(comments).some((value) => value.trim().length > 0),
		[comments],
	);

	const toggleInput = useCallback((id: string) => {
		setOpenInputs((current) => ({ ...current, [id]: !current[id] }));
	}, []);

	const setComment = useCallback((id: string, value: string) => {
		setComments((current) => ({ ...current, [id]: value }));
	}, []);

	const handleRequestChanges = useCallback(() => {
		const collected: BlockComment[] = [];
		for (const [blockId, comment] of Object.entries(comments)) {
			if (comment.trim().length === 0) continue;
			collected.push({
				blockId,
				blockName: labelById[blockId] ?? blockId,
				comment: comment.trim(),
			});
		}
		onRequestChanges(collected);
		setComments({});
		setOpenInputs({});
	}, [comments, labelById, onRequestChanges]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-2">
				<span className="font-medium text-muted-foreground text-small">
					Plan · {status}
				</span>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={!hasComments}
						onClick={handleRequestChanges}
					>
						Request changes
					</Button>
					<Button size="sm" onClick={onHandoff}>
						Handoff
					</Button>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{blocks.map((block) => {
					const body = renderBlock(block);
					const isOpen = Boolean(openInputs[block.id]);
					const hasNote = (comments[block.id] ?? "").trim().length > 0;
					return (
						<div key={block.id} className="group relative">
							<div className="flex items-start gap-2">
								<div className="min-w-0 flex-1">{body}</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={`Comment on ${labelById[block.id]}`}
									title={`Comment on ${labelById[block.id]}`}
									className={cn(
										"shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
										(isOpen || hasNote) && "opacity-100",
										hasNote && "text-primary",
									)}
									onClick={() => toggleInput(block.id)}
								>
									<MessageSquarePlusIcon className="size-4" />
								</Button>
							</div>
							{isOpen ? (
								<Textarea
									autoFocus
									value={comments[block.id] ?? ""}
									placeholder={`Comment on “${labelById[block.id]}”…`}
									className="mt-1 mb-2 min-h-16 text-small"
									onChange={(event) => setComment(block.id, event.target.value)}
								/>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
