import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Clock3 } from "lucide-react";
import { Suspense } from "react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { SourceIcon } from "@/features/inbox/source-icon";
import { type LinearIssueDetail, linearGetTask } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
	formatRelativeTime,
	SourceDetailActions,
	type SourceDetailProps,
	StatePill,
} from "../common";

/** Strip the `linear:` prefix the inbox sidebar uses for card ids so we
 *  recover the Linear UUID expected by `linear_get_task`. */
function linearIdFromCardId(cardId: string): string | null {
	const idx = cardId.indexOf(":");
	if (idx === -1) return null;
	const tail = cardId.slice(idx + 1);
	return tail.length > 0 ? tail : null;
}

export function LinearIssueView({
	card,
	appendContextTarget,
}: SourceDetailProps) {
	const linearId = linearIdFromCardId(card.id);
	const detailQuery = useQuery<LinearIssueDetail>({
		queryKey: linearId
			? ["tasks", "detail", "linear", linearId]
			: ["tasks", "detail", "linear", "missing", card.id],
		queryFn: () => linearGetTask(linearId as string),
		enabled: linearId !== null,
		staleTime: 5 * 60_000,
	});

	const description = detailQuery.data?.description ?? "";
	const markdownBody = description.trim() || "No description provided.";
	const isLoading = detailQuery.isLoading;
	const error = detailQuery.error;

	return (
		<article className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-4 [contain:content] [scrollbar-gutter:stable]">
			<header className="shrink-0 py-1.5">
				<div className="flex min-w-0 items-center justify-between gap-4">
					<div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
						{card.state ? <StatePill state={card.state} /> : null}
						<button
							type="button"
							onClick={() => void openUrl(card.externalUrl)}
							className="cursor-pointer font-medium text-foreground/80 hover:underline"
						>
							{card.externalId}
						</button>
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<SourceIcon source="linear" size={13} className="shrink-0" />
							task
						</span>
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<Clock3 className="size-[13px]" strokeWidth={1.8} />
							Updated {formatRelativeTime(card.lastActivityAt)}
						</span>
					</div>
					<SourceDetailActions
						card={card}
						appendContextTarget={appendContextTarget}
						markdownBody={markdownBody}
						copyDisabled={isLoading || Boolean(error)}
					/>
				</div>
			</header>

			<div
				className={cn(
					"min-h-0 flex-1",
					isLoading || error ? "flex items-center justify-center" : "py-4",
				)}
			>
				{isLoading ? (
					<HelmorLogoAnimated size={42} className="opacity-30" />
				) : error ? (
					<div className="text-center text-[13px] text-muted-foreground">
						{error instanceof Error ? error.message : "Couldn't load task."}
					</div>
				) : (
					<div className="max-w-3xl break-words">
						<h1 className="mb-3 text-pretty font-semibold text-[18px] leading-tight text-foreground">
							{card.title}
						</h1>
						<div className="conversation-markdown break-words text-[13px] leading-6 text-foreground after:block after:h-24 after:content-['']">
							<Suspense
								fallback={
									<div className="conversation-streamdown whitespace-pre-wrap break-words">
										{markdownBody}
									</div>
								}
							>
								<LazyStreamdown
									className="conversation-streamdown"
									mode="static"
								>
									{markdownBody}
								</LazyStreamdown>
							</Suspense>
						</div>
					</div>
				)}
			</div>
		</article>
	);
}
