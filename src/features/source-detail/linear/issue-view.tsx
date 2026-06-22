import { useQuery } from "@tanstack/react-query";
import { getLinearInboxItemDetail } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import {
	GitHubDetailPage,
	type SourceDetailProps,
	toRefreshControl,
} from "../common";

export function LinearIssueView({
	card,
	appendContextTarget,
}: SourceDetailProps) {
	// Linear cards have no forge `detailRef`; the issue id lives on the
	// card's `externalId`, so we query by that directly rather than
	// routing through `useInboxItemDetailQuery`.
	const detailQuery = useQuery({
		queryKey: helmorQueryKeys.linearInboxItemDetail(card.externalId),
		queryFn: () => getLinearInboxItemDetail(card.externalId),
		staleTime: 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});
	const detail =
		detailQuery.data?.type === "linear" ? detailQuery.data.data : null;

	return (
		<GitHubDetailPage
			card={card}
			appendContextTarget={appendContextTarget}
			description={detail?.description ?? undefined}
			error={detailQuery.error}
			headerLabel={card.subtitle ?? undefined}
			isLoading={detailQuery.isLoading}
			kindLabel="issue"
			refresh={toRefreshControl(detailQuery)}
		/>
	);
}
