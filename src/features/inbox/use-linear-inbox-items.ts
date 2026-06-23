import { useQuery } from "@tanstack/react-query";
import { getIntegrationStatus, listLinearInboxItems } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

/** Linear issues for the sidebar (assigned to me + the selected team's issues),
 *  gated on the Linear integration being connected. */
export function useLinearInboxItems() {
	const statusQuery = useQuery({
		queryKey: helmorQueryKeys.integrationStatus("linear"),
		queryFn: () => getIntegrationStatus("linear"),
	});
	const connected = statusQuery.data?.connected ?? false;
	const itemsQuery = useQuery({
		queryKey: helmorQueryKeys.linearInboxItems(),
		queryFn: () => listLinearInboxItems(),
		enabled: connected,
		staleTime: 60_000,
	});
	return {
		connected,
		statusLoading: statusQuery.isLoading,
		items: itemsQuery.data?.items ?? [],
		isLoading: itemsQuery.isLoading,
		isError: itemsQuery.isError,
		error: itemsQuery.error,
		refetch: itemsQuery.refetch,
	};
}
