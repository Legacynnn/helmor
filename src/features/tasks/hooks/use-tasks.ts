import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import {
	type IntegrationProvider,
	listTasks,
	syncTasks,
	type Task,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

/** Auto-resync if the last sync is older than this (ms). */
const STALE_AFTER_MS = 2 * 60 * 1000;

export function useTasks(
	provider: IntegrationProvider,
	teamId: string | null,
	enabled: boolean,
) {
	return useQuery({
		queryKey: helmorQueryKeys.tasks(provider, teamId),
		queryFn: () => listTasks(provider, teamId),
		enabled,
	});
}

export function useSyncTasks(
	provider: IntegrationProvider,
	teamId: string | null,
) {
	return useMutation({
		mutationFn: () => syncTasks(provider, teamId),
		// The `tasksChanged` UiMutationEvent invalidates the list query, so no
		// explicit invalidation here.
	});
}

/**
 * Kick a one-shot sync when the connection's `lastSyncedAt` is missing or
 * stale. Returns nothing; relies on the sync mutation + UI-sync bridge to
 * refresh the list. Guarded so it fires at most once per (provider, team).
 */
export function useAutoSync({
	provider,
	teamId,
	connected,
	lastSyncedAt,
	sync,
}: {
	provider: IntegrationProvider;
	teamId: string | null;
	connected: boolean;
	lastSyncedAt: string | null | undefined;
	sync: () => void;
}) {
	const firedFor = useRef<string | null>(null);
	const key = `${provider}:${teamId ?? ""}`;
	if (!connected || !teamId || firedFor.current === key) return;

	const stale =
		!lastSyncedAt ||
		Date.now() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;
	if (stale) {
		firedFor.current = key;
		sync();
	}
}

export type { Task };
