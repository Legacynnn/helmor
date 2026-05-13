import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export const CONTENT_SEARCH_TOGGLE_EVENT = "helmor:content-search-toggle";

interface ControllerValue {
	query: string;
	setQuery: (next: string) => void;
	collapsed: Set<string>;
	toggleCollapsed: (relativePath: string) => void;
	clearWorkspaceState: () => void;
}

const Ctx = createContext<ControllerValue | null>(null);

/**
 * In-session, per-workspace state for the content-search panel. The
 * provider sits inside the same workspace scope as the rest of the app —
 * `clearWorkspaceState` is invoked when the workspace changes so results
 * from one repo don't appear in another. Visibility is owned by the right
 * sidebar (see `WorkspaceRightSidebarMode === "search"` in `App.tsx`).
 */
export function ContentSearchStateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	const toggleCollapsed = useCallback((relativePath: string) => {
		setCollapsed((cur) => {
			const next = new Set(cur);
			if (next.has(relativePath)) next.delete(relativePath);
			else next.add(relativePath);
			return next;
		});
	}, []);

	const clearWorkspaceState = useCallback(() => {
		setQuery("");
		setCollapsed(new Set());
	}, []);

	const value = useMemo<ControllerValue>(
		() => ({
			query,
			setQuery,
			collapsed,
			toggleCollapsed,
			clearWorkspaceState,
		}),
		[query, collapsed, toggleCollapsed, clearWorkspaceState],
	);

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContentSearchController(): ControllerValue {
	const ctx = useContext(Ctx);
	if (!ctx) {
		throw new Error(
			"useContentSearchController must be used inside <ContentSearchStateProvider>",
		);
	}
	return ctx;
}
