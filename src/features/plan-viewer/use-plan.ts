import { useQuery } from "@tanstack/react-query";
import { listPlans, readPlan } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

/**
 * Read a single MDX plan document for a session, keyed by (sessionId, slug).
 * Disabled until both ids are present so callers can pass nullable values
 * straight through. The `planFileChanged` ui-sync event invalidates this key.
 */
export function usePlan(sessionId: string | null, slug: string | null) {
	return useQuery({
		queryKey: helmorQueryKeys.plan(sessionId ?? "", slug ?? ""),
		queryFn: () => readPlan(sessionId as string, slug as string),
		enabled: Boolean(sessionId) && Boolean(slug),
		staleTime: 0,
	});
}

/**
 * List every plan document for a session. Disabled until `sessionId` is
 * present. Invalidated by the `planFileChanged` ui-sync event.
 */
export function usePlanList(sessionId: string | null) {
	return useQuery({
		queryKey: helmorQueryKeys.planList(sessionId ?? ""),
		queryFn: () => listPlans(sessionId as string),
		enabled: Boolean(sessionId),
		staleTime: 0,
	});
}
