import { useQuery } from "@tanstack/react-query";
import { getIntegrationStatus, type IntegrationProvider } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

export function useIntegrationStatus(provider: IntegrationProvider) {
	return useQuery({
		queryKey: helmorQueryKeys.integrationStatus(provider),
		queryFn: () => getIntegrationStatus(provider),
	});
}
