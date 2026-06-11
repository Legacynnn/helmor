import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchWorkspace, type WorkspaceSearchRequest } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

export type SearchParams = {
	query: string;
	caseSensitive: boolean;
	wholeWord: boolean;
	regex: boolean;
	/** Comma-separated glob lists, VS Code style ("src/**, *.ts"). */
	includeGlobs: string;
	excludeGlobs: string;
};

export const EMPTY_SEARCH_PARAMS: SearchParams = {
	query: "",
	caseSensitive: false,
	wholeWord: false,
	regex: false,
	includeGlobs: "",
	excludeGlobs: "",
};

const DEBOUNCE_MS = 300;

export function parseGlobList(value: string): string[] {
	return value
		.split(",")
		.map((glob) => glob.trim())
		.filter(Boolean);
}

export function buildSearchRequest(
	workspaceRootPath: string,
	params: SearchParams,
): WorkspaceSearchRequest {
	return {
		workspaceRootPath,
		query: params.query,
		caseSensitive: params.caseSensitive,
		wholeWord: params.wholeWord,
		regex: params.regex,
		includeGlobs: parseGlobList(params.includeGlobs),
		excludeGlobs: parseGlobList(params.excludeGlobs),
	};
}

function useDebounced<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

export function useWorkspaceSearch(
	workspaceRootPath: string | null,
	params: SearchParams,
) {
	const debounced = useDebounced(params, DEBOUNCE_MS);
	const enabled = !!workspaceRootPath && debounced.query.length > 0;

	return useQuery({
		queryKey: helmorQueryKeys.workspaceSearch(
			workspaceRootPath ?? "",
			JSON.stringify(debounced),
		),
		queryFn: () =>
			searchWorkspace(buildSearchRequest(workspaceRootPath ?? "", debounced)),
		enabled,
		staleTime: 0,
		retry: 0,
		// Keep the previous result on screen while the next keystroke's
		// search runs — no flicker to empty.
		placeholderData: keepPreviousData,
	});
}
