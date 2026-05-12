import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

export interface EditorOpenInput {
	absolutePath: string;
	relativePath: string;
	fileName: string;
	line?: number;
	column?: number;
}

export interface RecentFile {
	absolutePath: string;
	relativePath: string;
	fileName: string;
	openedAt: number;
}

interface EditorActionsValue {
	openFile: (input: EditorOpenInput) => void;
	recents: RecentFile[];
	clearRecents: () => void;
}

const EditorActionsContext = createContext<EditorActionsValue | null>(null);

const RECENTS_MAX = 10;
const RECENTS_DEBOUNCE_MS = 250;

interface ProviderProps {
	children: ReactNode;
	workspaceRootPath: string | null;
	/**
	 * App-level tab opener. The context wraps this so all callers — palette,
	 * content search, file-browser tree — go through one path that also
	 * updates the recents LRU. `line`/`column` flow through to the editor
	 * session so palette / content-search can jump straight to a match.
	 */
	onOpenFileTab: (input: {
		absolutePath: string;
		relativePath: string;
		fileName: string;
		line?: number;
		column?: number;
	}) => void;
}

function recentsKey(root: string): string {
	return `helmor.editor.recents:${root}`;
}

function loadRecents(root: string | null): RecentFile[] {
	if (!root || typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(recentsKey(root));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(item): item is RecentFile =>
					typeof item === "object" &&
					item !== null &&
					typeof item.absolutePath === "string" &&
					typeof item.relativePath === "string" &&
					typeof item.fileName === "string" &&
					typeof item.openedAt === "number",
			)
			.slice(0, RECENTS_MAX);
	} catch {
		return [];
	}
}

export function EditorActionsProvider({
	children,
	workspaceRootPath,
	onOpenFileTab,
}: ProviderProps) {
	const [recents, setRecents] = useState<RecentFile[]>(() =>
		loadRecents(workspaceRootPath),
	);
	const writeTimer = useRef<number | null>(null);

	// Reload recents whenever the active workspace changes. Per-workspace
	// scoping is the entire point — recents from repo A in repo B would
	// be noise.
	useEffect(() => {
		setRecents(loadRecents(workspaceRootPath));
	}, [workspaceRootPath]);

	const persist = useCallback(
		(next: RecentFile[]) => {
			if (!workspaceRootPath || typeof window === "undefined") return;
			if (writeTimer.current !== null) {
				window.clearTimeout(writeTimer.current);
			}
			writeTimer.current = window.setTimeout(() => {
				try {
					window.localStorage.setItem(
						recentsKey(workspaceRootPath),
						JSON.stringify(next),
					);
				} catch {
					// Quota or private-mode failures are non-fatal — recents are
					// a convenience layer, not authoritative state.
				}
			}, RECENTS_DEBOUNCE_MS);
		},
		[workspaceRootPath],
	);

	const openFile = useCallback(
		(input: EditorOpenInput) => {
			onOpenFileTab({
				absolutePath: input.absolutePath,
				relativePath: input.relativePath,
				fileName: input.fileName,
				line: input.line,
				column: input.column,
			});
			setRecents((current) => {
				const filtered = current.filter(
					(r) => r.absolutePath !== input.absolutePath,
				);
				const next: RecentFile[] = [
					{
						absolutePath: input.absolutePath,
						relativePath: input.relativePath,
						fileName: input.fileName,
						openedAt: Date.now(),
					},
					...filtered,
				].slice(0, RECENTS_MAX);
				persist(next);
				return next;
			});
		},
		[onOpenFileTab, persist],
	);

	const clearRecents = useCallback(() => {
		setRecents([]);
		if (workspaceRootPath && typeof window !== "undefined") {
			try {
				window.localStorage.removeItem(recentsKey(workspaceRootPath));
			} catch {
				/* ignore */
			}
		}
	}, [workspaceRootPath]);

	const value = useMemo<EditorActionsValue>(
		() => ({ openFile, recents, clearRecents }),
		[openFile, recents, clearRecents],
	);

	return (
		<EditorActionsContext.Provider value={value}>
			{children}
		</EditorActionsContext.Provider>
	);
}

export function useEditorActions(): EditorActionsValue {
	const ctx = useContext(EditorActionsContext);
	if (!ctx) {
		throw new Error(
			"useEditorActions must be used inside <EditorActionsProvider>",
		);
	}
	return ctx;
}

/** Non-throwing variant — for components that may render outside the provider
 *  (test rigs, isolated stories). Returns `null` when no provider is mounted. */
export function useEditorActionsOptional(): EditorActionsValue | null {
	return useContext(EditorActionsContext);
}
