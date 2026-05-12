import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export const CONTENT_SEARCH_TOGGLE_EVENT = "helmor:content-search-toggle";

interface OpenOptions {
	focus?: boolean;
}

interface ControllerValue {
	isOpen: boolean;
	open: (opts?: OpenOptions) => void;
	close: () => void;
	toggle: () => void;
	query: string;
	setQuery: (next: string) => void;
	collapsed: Set<string>;
	toggleCollapsed: (relativePath: string) => void;
	clearWorkspaceState: () => void;
}

const Ctx = createContext<ControllerValue | null>(null);

/**
 * In-session, per-workspace state for the content-search sidebar. The
 * provider sits inside the same workspace scope as the rest of the app —
 * `clearWorkspaceState` is invoked when the workspace changes so results
 * from one repo don't appear in another.
 */
export function ContentSearchStateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [isOpen, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	const open = useCallback((_opts?: OpenOptions) => {
		setOpen(true);
	}, []);

	const close = useCallback(() => {
		setOpen(false);
	}, []);

	const toggle = useCallback(() => {
		setOpen((cur) => !cur);
	}, []);

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

	useEffect(() => {
		const onToggle = () => toggle();
		window.addEventListener(CONTENT_SEARCH_TOGGLE_EVENT, onToggle);
		return () =>
			window.removeEventListener(CONTENT_SEARCH_TOGGLE_EVENT, onToggle);
	}, [toggle]);

	const value = useMemo<ControllerValue>(
		() => ({
			isOpen,
			open,
			close,
			toggle,
			query,
			setQuery,
			collapsed,
			toggleCollapsed,
			clearWorkspaceState,
		}),
		[
			isOpen,
			open,
			close,
			toggle,
			query,
			collapsed,
			toggleCollapsed,
			clearWorkspaceState,
		],
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
