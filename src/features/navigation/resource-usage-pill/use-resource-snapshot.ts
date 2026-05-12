import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { getResourceSnapshot } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

const OPEN_INTERVAL_MS = 3_000;
const CLOSED_INTERVAL_MS = 60_000;

export function useResourceSnapshot(options: { open: boolean }) {
	const queryClient = useQueryClient();

	// React Query only re-evaluates `refetchInterval` after the next tick of
	// the current timer, so a 60s→3s transition would otherwise leave the
	// dropdown stale for up to 60s after opening. Force an immediate refetch
	// on transition; the new interval takes over from there.
	useEffect(() => {
		if (options.open) {
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.resourceSnapshot,
			});
		}
	}, [options.open, queryClient]);

	return useQuery({
		queryKey: helmorQueryKeys.resourceSnapshot,
		queryFn: getResourceSnapshot,
		refetchInterval: options.open ? OPEN_INTERVAL_MS : CLOSED_INTERVAL_MS,
		// Keep ticking even if the window loses focus while the dropdown is
		// open (e.g. the user alt-tabs to Activity Monitor to compare).
		refetchIntervalInBackground: true,
		staleTime: 0,
		placeholderData: keepPreviousData,
	});
}
