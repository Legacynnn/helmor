/**
 * Reads the displayed session's thread and returns the subagents that are
 * running right now. Self-sufficient (takes only a `sessionId`) so the strip
 * can mount in the composer's overlay zone without threading a messages array
 * down — it reads the same React Query cache the panel already populates.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ThreadMessageLike } from "@/lib/api";
import { sessionThreadMessagesQueryOptions } from "@/lib/query-client";
import {
	extractRunningSubagents,
	type RunningSubagent,
} from "./extract-subagents";

const EMPTY_MESSAGES: readonly ThreadMessageLike[] = [];

export function useRunningSubagents(
	sessionId: string | null,
): RunningSubagent[] {
	const { data } = useQuery({
		...sessionThreadMessagesQueryOptions(sessionId ?? "__none__"),
		enabled: Boolean(sessionId),
	});
	const messages = data ?? EMPTY_MESSAGES;
	return useMemo(() => extractRunningSubagents(messages), [messages]);
}
