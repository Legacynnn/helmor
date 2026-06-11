import { useQuery } from "@tanstack/react-query";
import {
	type MouseEvent as ReactMouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	suspendTerminalFit,
	suspendTerminalWrites,
} from "@/components/terminal-output";
import { loadRepoScripts, type RepoScripts } from "@/lib/api";
import type { InspectorFileItem } from "@/lib/editor-session";
import { workspaceChangesQueryOptions } from "@/lib/query-client";
import {
	getInitialActiveTab,
	getInitialTabsHeight,
	getInitialTabsOpen,
	INSPECTOR_ACTIVE_TAB_STORAGE_KEY,
	INSPECTOR_SECTION_HEADER_HEIGHT,
	INSPECTOR_TABS_HEIGHT_STORAGE_KEY,
	INSPECTOR_TABS_OPEN_STORAGE_KEY,
} from "../layout";
import {
	getInitialPanelTab,
	INSPECTOR_PANEL_TAB_STORAGE_KEY,
	type PanelTabId,
} from "../panel/state";
import { getScriptState, startScript, stopScript } from "../script-store";

// Stable empty-array reference for the `changesQuery.data ?? ...` fallback.
const EMPTY_CHANGES: InspectorFileItem[] = [];

// Inspector layout model
// ----------------------
// Two vertically-stacked sections: the tabbed Panel (Files / Git / Search /
// Actions) and the Tabs section (Setup / Run / Terminal). Their bodies always
// sum to `bodyBudget = container - 2 * sectionHeader`. There is no CSS
// auto-fill — every body height is an explicit pixel value derived from:
//   - tabsOpen
//   - containerHeight (observed)
//   - storedTabsBody (user-resized value)
//
// The Panel is always the slack absorber: we never store an explicit size for
// it, which keeps the tabs toggle round-trip lossless.

const MIN_PANEL_BODY = 128;
const MIN_TABS_BODY = 160;
const DEFAULT_TABS_BODY = 160;

type ResizeState = {
	pointerY: number;
	initialTabsBody: number;
	bodyBudget: number;
	tabsOpen: boolean;
};

type SectionRefs = {
	panel: RefObject<HTMLElement | null>;
	tabsWrapper: RefObject<HTMLDivElement | null>;
};

// Inline `style.height` per section instead of CSS variables; CSS-var writes
// invalidate the whole subtree's computed style under WebKit.
function writeBodyHeights(
	refs: SectionRefs,
	sizes: DerivedSizes,
	options: { tabsOpen: boolean },
) {
	const panel = refs.panel.current;
	if (panel) {
		panel.style.height = `${INSPECTOR_SECTION_HEADER_HEIGHT + sizes.panelBody}px`;
	}
	const tabsWrapper = refs.tabsWrapper.current;
	if (tabsWrapper) {
		tabsWrapper.style.height = options.tabsOpen
			? `${INSPECTOR_SECTION_HEADER_HEIGHT + sizes.tabsBody}px`
			: `${INSPECTOR_SECTION_HEADER_HEIGHT}px`;
	}
}

type UseWorkspaceInspectorSidebarArgs = {
	workspaceRootPath?: string | null;
	workspaceId: string | null;
	repoId: string | null;
	/** Drives the auto-relocate-to-Run-tab heuristic on workspace switch.
	 * `null` until the workspace detail query resolves; nothing happens
	 * while loading. */
	workspaceState?: string | null;
	/** Persisted active-run-action id for this workspace (workspace row).
	 * `null` if the user hasn't picked one yet; the hook falls back to the
	 * first action returned by `loadRepoScripts`. Cmd+R uses whatever this
	 * resolves to. */
	workspaceActiveRunActionId?: string | null;
};

type DerivedSizes = {
	panelBody: number;
	tabsBody: number;
};

function clamp(value: number, min: number, max: number): number {
	if (max < min) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/**
 * Pure layout derivation. Heights always sum to `bodyBudget`, except in the
 * pathological case where the container is smaller than the minimums — there
 * the panel just compresses below its minimum and the UI absorbs it.
 */
function deriveSizes({
	bodyBudget,
	tabsOpen,
	storedTabsBody,
}: {
	bodyBudget: number;
	tabsOpen: boolean;
	storedTabsBody: number;
}): DerivedSizes {
	const tabsBody = tabsOpen
		? clamp(
				storedTabsBody,
				MIN_TABS_BODY,
				Math.max(MIN_TABS_BODY, bodyBudget - MIN_PANEL_BODY),
			)
		: 0;
	const panelBody = Math.max(MIN_PANEL_BODY, bodyBudget - tabsBody);
	return { panelBody, tabsBody };
}

export function useWorkspaceInspectorSidebar({
	workspaceRootPath,
	workspaceId,
	repoId,
	workspaceState,
	workspaceActiveRunActionId,
}: UseWorkspaceInspectorSidebarArgs) {
	const [tabsOpen, setTabsOpen] = useState(getInitialTabsOpen);
	const [activeTab, setActiveTab] = useState(getInitialActiveTab);
	const [panelTab, setPanelTab] = useState<PanelTabId>(getInitialPanelTab);

	// On workspace switch, default the Setup/Run tab to whichever phase the
	// workspace is currently in: `setup_pending` → "setup" so the user sees
	// the script auto-running; anything else (`ready`, `archived`) → "run"
	// because setup is already past. Only overrides when the active tab is
	// already Setup/Run — leaves Terminal sub-tabs alone. Refs #460.
	const lastWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspaceId) return;
		if (lastWorkspaceIdRef.current === workspaceId) return;
		// Wait until the parent has loaded workspaceState so we don't
		// flip tabs based on a stale `null`.
		if (workspaceState === null || workspaceState === undefined) return;
		lastWorkspaceIdRef.current = workspaceId;
		setActiveTab((current) => {
			if (current !== "setup" && current !== "run") return current;
			const target = workspaceState === "setup_pending" ? "setup" : "run";
			return current === target ? current : target;
		});
	}, [workspaceId, workspaceState]);

	const [containerHeight, setContainerHeight] = useState(0);
	const [storedTabsBody, setStoredTabsBody] = useState(() =>
		getInitialTabsHeight(DEFAULT_TABS_BODY),
	);
	const [resizeState, setResizeState] = useState<ResizeState | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLElement>(null);
	const tabsWrapperRef = useRef<HTMLDivElement>(null);
	const sectionRefsRef = useRef<SectionRefs>({
		panel: panelRef,
		tabsWrapper: tabsWrapperRef,
	});

	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		setContainerHeight(element.getBoundingClientRect().height);
	}, []);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		let frameId: number | null = null;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			if (frameId !== null) cancelAnimationFrame(frameId);
			frameId = requestAnimationFrame(() => {
				frameId = null;
				setContainerHeight(entry.contentRect.height);
			});
		});

		observer.observe(element);
		return () => {
			if (frameId !== null) cancelAnimationFrame(frameId);
			observer.disconnect();
		};
	}, []);

	const bodyBudget = Math.max(
		0,
		containerHeight - 2 * INSPECTOR_SECTION_HEADER_HEIGHT,
	);

	const { panelBody, tabsBody } = useMemo(
		() =>
			deriveSizes({
				bodyBudget,
				tabsOpen,
				storedTabsBody,
			}),
		[bodyBudget, tabsOpen, storedTabsBody],
	);

	// Gate so the non-drag effect doesn't clobber the live ref-written
	// heights during mousemove.
	const isResizingRef = useRef(false);
	useLayoutEffect(() => {
		if (isResizingRef.current) return;
		writeBodyHeights(
			sectionRefsRef.current,
			{ panelBody, tabsBody },
			{ tabsOpen },
		);
	}, [panelBody, tabsBody, tabsOpen]);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				INSPECTOR_TABS_OPEN_STORAGE_KEY,
				String(tabsOpen),
			);
		} catch (error) {
			console.error(
				`[helmor] tabs open save failed for "${INSPECTOR_TABS_OPEN_STORAGE_KEY}"`,
				error,
			);
		}
	}, [tabsOpen]);

	useEffect(() => {
		try {
			window.localStorage.setItem(INSPECTOR_ACTIVE_TAB_STORAGE_KEY, activeTab);
		} catch (error) {
			console.error(
				`[helmor] active tab save failed for "${INSPECTOR_ACTIVE_TAB_STORAGE_KEY}"`,
				error,
			);
		}
	}, [activeTab]);

	useEffect(() => {
		try {
			window.localStorage.setItem(INSPECTOR_PANEL_TAB_STORAGE_KEY, panelTab);
		} catch (error) {
			console.error(
				`[helmor] panel tab save failed for "${INSPECTOR_PANEL_TAB_STORAGE_KEY}"`,
				error,
			);
		}
	}, [panelTab]);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				INSPECTOR_TABS_HEIGHT_STORAGE_KEY,
				String(storedTabsBody),
			);
		} catch (error) {
			console.error(
				`[helmor] tabs height save failed for "${INSPECTOR_TABS_HEIGHT_STORAGE_KEY}"`,
				error,
			);
		}
	}, [storedTabsBody]);

	const repoScriptsQuery = useQuery({
		queryKey: ["repoScripts", repoId, workspaceId],
		queryFn: () => loadRepoScripts(repoId!, workspaceId),
		enabled: !!repoId,
		staleTime: 0,
	});
	const repoScripts: RepoScripts | null = repoScriptsQuery.data ?? null;
	const scriptsLoaded = repoScriptsQuery.isFetched;

	// Cmd+R toggle: idle/exited → start; running → stop. Tab visibility
	// unchanged — the user can open the Run tab later to replay output.
	//
	// With multiple run actions, the shortcut always targets the *active*
	// one (the dropdown's checked entry). Falls back to the first action
	// when the workspace hasn't pinned an active id yet, or when the pinned
	// id no longer exists (e.g. user deleted it from settings).
	const runActions = repoScripts?.runActions ?? [];
	const resolvedActiveId =
		runActions.find((a) => a.id === workspaceActiveRunActionId)?.id ??
		runActions[0]?.id ??
		null;
	useEffect(() => {
		const handler = () => {
			if (!repoId || !workspaceId) return;
			if (!resolvedActiveId) return;
			const state = getScriptState(workspaceId, "run", resolvedActiveId);
			if (state?.status === "running") {
				stopScript(repoId, "run", workspaceId, resolvedActiveId);
			} else {
				startScript(repoId, "run", workspaceId, resolvedActiveId);
			}
		};
		window.addEventListener("helmor:run-script", handler);
		return () => window.removeEventListener("helmor:run-script", handler);
	}, [repoId, workspaceId, resolvedActiveId]);

	const isTabsResizing = resizeState !== null;
	const isResizing = isTabsResizing;

	// Skip while the worktree isn't fully materialised. During
	// `Initializing`, `git worktree add` is mid-checkout: `git diff`
	// against the half-populated tree returns every tracked file as a
	// phantom delete, and the inspector's auto-expanded tree stalls the
	// JS thread for seconds. `Archived` has no worktree at all.
	const changesQueryEnabled =
		!!workspaceRootPath &&
		workspaceState !== "initializing" &&
		workspaceState !== "archived";
	const changesQuery = useQuery({
		...workspaceChangesQueryOptions(workspaceRootPath ?? "", workspaceId),
		enabled: changesQueryEnabled,
	});
	const changes: InspectorFileItem[] = changesQuery.data ?? EMPTY_CHANGES;
	const changesLoaded = changesQueryEnabled && changesQuery.data !== undefined;

	const prevChangesRef = useRef<Map<string, string> | null>(null);
	const prevRootPathRef = useRef(workspaceRootPath);
	const prevWorkspaceIdRef = useRef(workspaceId);
	if (
		prevRootPathRef.current !== workspaceRootPath ||
		prevWorkspaceIdRef.current !== workspaceId
	) {
		prevRootPathRef.current = workspaceRootPath;
		prevWorkspaceIdRef.current = workspaceId;
		prevChangesRef.current = null;
	}
	const nextChangesSnapshot = useMemo(() => {
		const snapshot = new Map<string, string>();
		for (const item of changes) {
			// Flashing key includes all three areas — any line-count change
			// in any area should trigger the flash.
			snapshot.set(
				item.path,
				`${item.stagedInsertions}:${item.stagedDeletions}:${item.unstagedInsertions}:${item.unstagedDeletions}:${item.committedInsertions}:${item.committedDeletions}:${item.status}`,
			);
		}
		return snapshot;
	}, [changes]);
	const flashingPaths = useMemo(() => {
		const previous = prevChangesRef.current;
		if (previous === null || !changesLoaded) {
			return new Set<string>();
		}

		const flashing = new Set<string>();
		for (const item of changes) {
			const nextKey = nextChangesSnapshot.get(item.path);
			if (!nextKey) {
				continue;
			}
			const previousKey = previous.get(item.path);
			if (previousKey === undefined || previousKey !== nextKey) {
				flashing.add(item.path);
			}
		}
		return flashing;
	}, [changes, changesLoaded, nextChangesSnapshot]);
	useEffect(() => {
		if (!changesLoaded) return;
		prevChangesRef.current = nextChangesSnapshot;
	}, [changesLoaded, nextChangesSnapshot]);

	const handleToggleTabs = useCallback(() => {
		setTabsOpen((open) => !open);
	}, []);

	useEffect(() => {
		if (!resizeState) {
			return;
		}

		isResizingRef.current = true;
		// Vertical section resize can pause terminal work; horizontal shell
		// resize stays live so the sidebar never appears frozen.
		const releaseFitSuspend = suspendTerminalFit();
		const releaseWriteSuspend = suspendTerminalWrites();

		const captured = resizeState;
		const refs = sectionRefsRef.current;

		let pendingMove: globalThis.MouseEvent | null = null;
		let animationFrameId: number | null = null;
		let lastStoredTabs: number = captured.initialTabsBody;

		const flush = () => {
			animationFrameId = null;
			const event = pendingMove;
			pendingMove = null;
			if (!event) return;
			const deltaY = event.clientY - captured.pointerY;

			// Drag down → tabs shrinks, the panel grows.
			const max = Math.max(MIN_TABS_BODY, captured.bodyBudget - MIN_PANEL_BODY);
			lastStoredTabs = clamp(
				captured.initialTabsBody - deltaY,
				MIN_TABS_BODY,
				max,
			);

			// Drag-time inline writes — bypass React render + CSS-var
			// invalidation.
			const sizes = deriveSizes({
				bodyBudget: captured.bodyBudget,
				tabsOpen: captured.tabsOpen,
				storedTabsBody: lastStoredTabs,
			});
			writeBodyHeights(refs, sizes, { tabsOpen: captured.tabsOpen });
		};

		const handleMouseMove = (event: globalThis.MouseEvent) => {
			pendingMove = event;
			if (animationFrameId === null) {
				animationFrameId = window.requestAnimationFrame(flush);
			}
		};

		const handleMouseUp = () => {
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
			}
			flush();
			// Commit the final value back to React state for localStorage
			// persistence and any external consumers. Same-value setState is a no-op.
			isResizingRef.current = false;
			if (lastStoredTabs !== captured.initialTabsBody) {
				setStoredTabsBody(lastStoredTabs);
			}
			setResizeState(null);
		};

		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.cursor = "ns-resize";
		document.body.style.userSelect = "none";

		// Hit-test absorber so WebKit's `:hover` recompute doesn't cascade
		// through the panel subtree on every mousemove.
		const overlay = document.createElement("div");
		overlay.style.position = "fixed";
		overlay.style.inset = "0";
		overlay.style.zIndex = "2147483647";
		overlay.style.cursor = "ns-resize";
		overlay.setAttribute("data-helmor-resize-overlay", "");
		overlay.setAttribute("aria-hidden", "true");
		document.body.appendChild(overlay);

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}
			isResizingRef.current = false;
			releaseFitSuspend();
			releaseWriteSuspend();
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			overlay.remove();
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [resizeState]);

	const handleTabsResizeStart = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();
			setResizeState({
				pointerY: event.clientY,
				initialTabsBody: storedTabsBody,
				bodyBudget,
				tabsOpen,
			});
		},
		[storedTabsBody, bodyBudget, tabsOpen],
	);

	return {
		activeTab,
		changes,
		changesLoaded,
		containerRef,
		flashingPaths,
		handleTabsResizeStart,
		handleToggleTabs,
		isResizing,
		isTabsResizing,
		panelRef,
		panelTab,
		repoScripts,
		scriptsLoaded,
		setActiveTab,
		setPanelTab,
		tabsOpen,
		tabsWrapperRef,
	};
}
