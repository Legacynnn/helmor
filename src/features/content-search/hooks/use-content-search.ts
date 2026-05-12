import { useEffect, useRef, useState } from "react";

import { type ContentSearchResult, searchWorkspaceContent } from "@/lib/api";

const DEBOUNCE_MS = 150;
const MIN_QUERY_CHARS = 3;

export interface ContentSearchState {
	status: "idle" | "loading" | "ready" | "error";
	result: ContentSearchResult | null;
	error: string | null;
	tooShort: boolean;
}

const INITIAL: ContentSearchState = {
	status: "idle",
	result: null,
	error: null,
	tooShort: false,
};

/**
 * Debounced content search with request-id discard. Below `MIN_QUERY_CHARS`
 * the hook returns an idle state with `tooShort: true` so the UI can show
 * a hint without firing the backend.
 */
export function useContentSearch(
	workspaceRootPath: string | null,
	query: string,
	enabled: boolean,
): ContentSearchState {
	const [state, setState] = useState<ContentSearchState>(INITIAL);
	const requestId = useRef(0);
	const timer = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled || !workspaceRootPath) {
			requestId.current++;
			setState(INITIAL);
			return;
		}
		const trimmed = query.trim();
		if (trimmed.length < MIN_QUERY_CHARS) {
			requestId.current++;
			setState({
				status: "idle",
				result: null,
				error: null,
				tooShort: trimmed.length > 0,
			});
			return;
		}

		const id = ++requestId.current;
		setState((s) => ({
			...s,
			status: "loading",
			error: null,
			tooShort: false,
		}));

		if (timer.current !== null) {
			window.clearTimeout(timer.current);
		}
		timer.current = window.setTimeout(async () => {
			try {
				const result = await searchWorkspaceContent(workspaceRootPath, trimmed);
				if (id !== requestId.current) return;
				setState({
					status: "ready",
					result,
					error: null,
					tooShort: false,
				});
			} catch (err) {
				if (id !== requestId.current) return;
				setState({
					status: "error",
					result: null,
					error: err instanceof Error ? err.message : "Search failed",
					tooShort: false,
				});
			}
		}, DEBOUNCE_MS);

		return () => {
			if (timer.current !== null) {
				window.clearTimeout(timer.current);
				timer.current = null;
			}
		};
	}, [workspaceRootPath, query, enabled]);

	return state;
}
