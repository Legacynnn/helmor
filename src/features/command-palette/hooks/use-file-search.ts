import { useEffect, useRef, useState } from "react";

import { type PathSearchHit, searchWorkspacePaths } from "@/lib/api";

const DEBOUNCE_MS = 120;

interface State {
	loading: boolean;
	hits: PathSearchHit[];
	error: string | null;
}

const INITIAL: State = { loading: false, hits: [], error: null };

/**
 * Debounced fuzzy path search. Each new query bumps a request id; late
 * results from prior queries are discarded — no backend cancellation
 * needed for sub-second searches.
 */
export function useFileSearch(
	workspaceRootPath: string | null,
	query: string,
	enabled: boolean,
): State {
	const [state, setState] = useState<State>(INITIAL);
	const requestId = useRef(0);
	const timer = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled || !workspaceRootPath || query.trim().length === 0) {
			requestId.current++;
			setState(INITIAL);
			return;
		}
		const id = ++requestId.current;
		setState((s) => ({ ...s, loading: true, error: null }));
		if (timer.current !== null) {
			window.clearTimeout(timer.current);
		}
		timer.current = window.setTimeout(async () => {
			try {
				const hits = await searchWorkspacePaths(workspaceRootPath, query);
				if (id !== requestId.current) return;
				setState({ loading: false, hits, error: null });
			} catch (err) {
				if (id !== requestId.current) return;
				setState({
					loading: false,
					hits: [],
					error: err instanceof Error ? err.message : "Search failed",
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
