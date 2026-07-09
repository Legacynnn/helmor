import { useQuery } from "@tanstack/react-query";
import {
	Background,
	BackgroundVariant,
	type ColorMode,
	type Connection,
	Controls,
	type Edge,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	SelectionMode,
	type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CanvasState } from "@/lib/api";
import { convertFileSrc } from "@/lib/ipc";
import {
	canvasRepositoryStyleQueryOptions,
	canvasStateQueryOptions,
	workspaceDetailQueryOptions,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { resolveBackgroundUrl } from "./backgrounds";
import { resolvePanelBindings } from "./bindings/panel-bindings";
import { PanelBindingsContext } from "./bindings/panel-bindings-context";
import { usePanelBindingShortcuts } from "./bindings/use-panel-binding-shortcuts";
import { CableOverlay } from "./cable/cable-overlay";
import { CanvasActionsProvider } from "./canvas-actions-context";
import { useCanvasCreateStore } from "./canvas-create-store";
import { useCanvasInteractionStore } from "./canvas-interaction-store";
import { useCanvasViewStore } from "./canvas-view-store";
import {
	type CanvasWorkspaceInfo,
	CanvasWorkspaceProvider,
} from "./canvas-workspace-context";
import { CanvasCreateOverlay } from "./chrome/create-overlay";
import { CustomizePopover } from "./chrome/customize-popover";
import { CanvasLeftRail } from "./chrome/left-rail";
import { PanelsListPopover } from "./chrome/panels-list-popover";
import { CanvasRightRail } from "./chrome/right-rail";
import { CanvasSelectionToolbar } from "./chrome/selection-toolbar";
import { CanvasWorkspaceControls } from "./chrome/workspace-controls";
import {
	connectionMeta,
	useConnectionsStore,
} from "./connections/connections-store";
import { parsePanelConfig } from "./panel-config";
import { PanelNode } from "./panel-node";
import type { PanelNode as PanelNodeType } from "./types";
import { useCanvasCreateShortcuts } from "./use-canvas-create-shortcuts";
import { useCanvasGraph } from "./use-canvas-graph";
import { useCanvasSidebarStore } from "./use-canvas-sidebar-store";
import { usePinchZoom } from "./use-pinch-zoom";

const NODE_TYPES = { panel: PanelNode };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";
const EDGE_COLOR = "var(--xy-edge-stroke, #9ca3af)";

/** Full-bleed Infinite Canvas surface for one workspace (epic #61), on React
 * Flow. Replaces the 3-column chrome; loads the persisted canvas once and
 * keeps it in sync. */
export function CanvasSurface({
	workspaceId,
	onSelectWorkspace,
}: {
	workspaceId: string;
	onSelectWorkspace?: (workspaceId: string) => void;
}) {
	const { data, isLoading } = useQuery(canvasStateQueryOptions(workspaceId));

	if (isLoading || !data) {
		return (
			<div className="flex size-full items-center justify-center bg-app-base text-app-muted-foreground text-sm">
				Loading canvas…
			</div>
		);
	}

	return (
		<ReactFlowProvider>
			<CanvasInner
				workspaceId={workspaceId}
				onSelectWorkspace={onSelectWorkspace}
				initial={data}
			/>
		</ReactFlowProvider>
	);
}

function CanvasInner({
	workspaceId,
	onSelectWorkspace,
	initial,
}: {
	workspaceId: string;
	onSelectWorkspace?: (workspaceId: string) => void;
	initial: CanvasState;
}) {
	const { data: detail } = useQuery(workspaceDetailQueryOptions(workspaceId));
	const repoId = detail?.repoId ?? null;
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [customizeOpen, setCustomizeOpen] = useState(false);
	// The customize popover anchors next to the left rail's customize button, so
	// it tracks the rail when it shifts right to clear the open workspaces sidebar.
	const sidebarOpen = useCanvasSidebarStore((s) => s.open);
	const selectMode = useCanvasInteractionStore((s) => s.selectMode);
	const pendingType = useCanvasCreateStore((s) => s.pendingType);

	// Arming any create tool (from either rail) exits select mode.
	useEffect(() => {
		if (pendingType) useCanvasInteractionStore.getState().setSelectMode(false);
	}, [pendingType]);

	const workspaceInfo = useMemo<CanvasWorkspaceInfo>(
		() => ({
			workspaceId,
			repoId: detail?.repoId ?? null,
			workspaceRootPath: detail?.rootPath ?? null,
			// Match normal-mode terminal readiness (features/panel): ready unless
			// the workspace is still initializing. The stricter `=== "ready"` left
			// canvas terminals stuck on "Preparing workspace…" (PTY never spawns)
			// for every non-"ready" state the rest of the app treats as usable.
			workspaceReady: Boolean(detail && detail.state !== "initializing"),
		}),
		[workspaceId, detail?.repoId, detail?.rootPath, detail?.state],
	);

	// Hydrate the transient stores once from the initial snapshot. Camera is
	// per-workspace; appearance is per-repo and hydrated separately below.
	const hydrated = useRef(false);
	if (!hydrated.current) {
		hydrated.current = true;
		useConnectionsStore.getState().hydrate(workspaceId, initial.connections);
		useCanvasViewStore.getState().hydrateCamera(initial.viewState);
	}

	// The repo's shared appearance. Keyed per-repo, so every open workspace of
	// the repo reads one cache entry — a sibling's edit invalidates it and this
	// effect restyles the surface live (no reload).
	const { data: repoStyle } = useQuery(
		canvasRepositoryStyleQueryOptions(repoId),
	);
	useEffect(() => {
		if (repoId && repoStyle) {
			useCanvasViewStore.getState().hydrateAppearance(repoId, repoStyle);
		}
	}, [repoId, repoStyle]);

	const { nodes, onNodesChange, actions, reconcile } = useCanvasGraph(
		workspaceId,
		initial,
		wrapperRef,
	);

	// ⌘1–⌘9 focus a panel by its binding; ⌘/ toggles the panels list. Scoped to
	// the canvas via `data-focus-scope="canvas"` on the wrapper below.
	usePanelBindingShortcuts(nodes);
	// ⌘⌥C/N/D/E/G + ⌘⇧T arm the new-panel create flow (same as the rail buttons).
	useCanvasCreateShortcuts();

	// The canvas is its own surface: it never imports the workspace's existing
	// (normal-tab) conversations. A canvas only ever shows panels the user
	// created on it (persisted in `initial.panels`); a fresh canvas opens empty.
	// Conversations created on the canvas are hidden sessions, so they never
	// leak into the normal conversation tab strip either (see buildConfig).

	// Reconcile external (CLI) mutations when the query refetches.
	const { data: fresh } = useQuery(canvasStateQueryOptions(workspaceId));
	const reconciledFrom = useRef<CanvasState>(initial);
	useEffect(() => {
		if (fresh && fresh !== reconciledFrom.current) {
			reconciledFrom.current = fresh;
			reconcile(fresh);
		}
	}, [fresh, reconcile]);

	// Edges derived from the connections store.
	const connections = useConnectionsStore((s) => s.connections);
	const edges = useMemo<Edge[]>(
		() =>
			connections.map((c) => {
				const primary = connectionMeta(c).primary === true;
				return {
					id: c.id,
					source: c.fromPanelId,
					target: c.toPanelId,
					animated: primary,
					style: {
						stroke: primary ? SELECTED_COLOR : EDGE_COLOR,
						strokeWidth: primary ? 2.5 : 1.5,
						strokeDasharray: primary ? undefined : "6 4",
					},
				};
			}),
		[connections],
	);

	const onConnect = useCallback(
		(c: Connection) => {
			if (!c.source || !c.target) return;
			const from = nodes.find((n) => n.id === c.source);
			const to = nodes.find((n) => n.id === c.target);
			if (!from || !to) return;
			useConnectionsStore
				.getState()
				.addConnection(
					c.source,
					c.target,
					from.data.panelType,
					to.data.panelType,
				);
		},
		[nodes],
	);

	// Appearance from the view store. (Translucency is consumed per-panel in
	// PanelNode, where it fades only the panel surfaces — not their content.)
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	const theme = useCanvasViewStore((s) => s.backgroundTheme);
	const snapToGrid = useCanvasViewStore((s) => s.snapToGrid);
	const setCamera = useCanvasViewStore((s) => s.setCamera);
	const backgroundImage = useCanvasViewStore((s) => s.backgroundImage);
	const backgroundUrl = useMemo(
		() => resolveBackgroundUrl(backgroundImage, convertFileSrc),
		[backgroundImage],
	);

	// In select mode the whole panel is a drag target (header-only dragging is
	// near-impossible when zoomed out). Stripping `dragHandle` lets React Flow
	// move a panel grabbed anywhere on its body; the body also drops `nodrag`
	// (see PanelNode). Out of select mode, panels keep header-drag + interactive
	// bodies so users can type/scroll inside them.
	const rfNodes = useMemo(
		() =>
			selectMode ? nodes.map((n) => ({ ...n, dragHandle: undefined })) : nodes,
		[nodes, selectMode],
	);

	// Effective ⌘-digit focus binding per panel, shared with every PanelNode via
	// context so each can show its own shortcut on hover (mirrors the panels list).
	const panelBindings = useMemo(
		() =>
			resolvePanelBindings(
				nodes.map((n) => ({
					id: n.id,
					binding: parsePanelConfig(n.data.config).binding,
				})),
			),
		[nodes],
	);

	const onMoveEnd = useCallback(
		(_e: unknown, vp: Viewport) => setCamera(vp.x, vp.y, vp.zoom),
		[setCamera],
	);

	// Parallax background. The custom image lives in an oversized layer that
	// drifts at a fraction of the canvas pan and scales gently with zoom, so it
	// reads as a deep backdrop the panels float above — reinforcing that the
	// canvas continues past the viewport edges. Driven imperatively from
	// `onMove` (fires every frame while panning/zooming) to avoid re-renders.
	const bgRef = useRef<HTMLDivElement>(null);
	const applyParallax = useCallback((vp: Viewport) => {
		const el = bgRef.current;
		if (!el) return;
		const FACTOR = 0.18; // background travels at 18% of the pan
		const MAX = 120; // clamp the drift well inside the -inset-40 (160px) overhang
		const tx = Math.max(-MAX, Math.min(MAX, vp.x * FACTOR));
		const ty = Math.max(-MAX, Math.min(MAX, vp.y * FACTOR));
		// Never scale below 1, or the layer would shrink under the viewport and
		// expose an edge when the user pans far toward a corner.
		const scale = Math.max(1, Math.min(1.5, 1 + (vp.zoom - 1) * 0.14));
		el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
	}, []);
	const onMove = useCallback(
		(_e: unknown, vp: Viewport) => applyParallax(vp),
		[applyParallax],
	);
	// Seed the transform from the persisted viewport before the first pan.
	useEffect(() => {
		applyParallax({
			x: initial.viewState.panX,
			y: initial.viewState.panY,
			zoom: initial.viewState.zoom || 1,
		});
	}, [applyParallax, backgroundUrl, initial.viewState]);

	// WebKit (Tauri webview) delivers trackpad pinch as `gesture*` events, which
	// React Flow ignores. Drive zoom from them ourselves and persist on release.
	const onPinchCommit = useCallback(
		(vp: Viewport) => setCamera(vp.x, vp.y, vp.zoom),
		[setCamera],
	);
	usePinchZoom(wrapperRef, {
		minZoom: MIN_ZOOM,
		maxZoom: MAX_ZOOM,
		onCommit: onPinchCommit,
	});

	const onEdgesDelete = useCallback((deleted: Edge[]) => {
		const store = useConnectionsStore.getState();
		for (const e of deleted) store.disconnect(e.id);
	}, []);

	return (
		<CanvasWorkspaceProvider value={workspaceInfo}>
			<CanvasActionsProvider value={actions}>
				<div
					ref={wrapperRef}
					// Activates the `canvas` shortcut scope (⌘1–⌘9, ⌘/) while focus is
					// inside the surface, so they don't double-fire with chat shortcuts.
					data-focus-scope="canvas"
					// Plain neutral canvas surface (black in dark, white in light) —
					// intentionally NOT the themed `bg-background`, which picks up the
					// active theme's tint. Keeps the empty canvas monochrome.
					className="relative size-full overflow-hidden bg-white dark:bg-neutral-950"
					// The canvas accent (selected-panel border, resize handles,
					// connection cables, selection toolbar) reads `--color-selected`,
					// which is otherwise undefined and falls back to a hardcoded blue.
					// Bind it — and React Flow's own `--xy-resize-background-color` (the
					// resize-handle fill) — to the app's primary token so nothing in the
					// canvas renders that off-brand blue.
					style={
						{
							"--color-selected": "var(--primary)",
							"--xy-resize-background-color": "var(--primary)",
						} as CSSProperties
					}
				>
					{backgroundUrl ? (
						<>
							{/* Oversized parallax layer: drifts at a fraction of the pan and
							    scales with zoom (driven imperatively via `onMove`). The
							    -inset margin gives the transform room before an edge shows. */}
							<div
								ref={bgRef}
								className="pointer-events-none absolute -inset-40 z-0 origin-center bg-center bg-cover will-change-transform"
								style={{ backgroundImage: `url("${backgroundUrl}")` }}
							>
								<div className="absolute inset-0 bg-black/25" />
							</div>
						</>
					) : null}
					<PanelBindingsContext.Provider value={panelBindings}>
						<ReactFlow<PanelNodeType>
							nodes={rfNodes}
							edges={edges}
							style={
								backgroundUrl ? { backgroundColor: "transparent" } : undefined
							}
							onNodesChange={onNodesChange}
							onConnect={onConnect}
							onEdgesDelete={onEdgesDelete}
							onMove={onMove}
							onMoveEnd={onMoveEnd}
							nodeTypes={NODE_TYPES}
							colorMode={theme as ColorMode}
							snapToGrid={snapToGrid}
							snapGrid={[16, 16]}
							defaultViewport={{
								x: initial.viewState.panX,
								y: initial.viewState.panY,
								zoom: initial.viewState.zoom || 1,
							}}
							minZoom={MIN_ZOOM}
							maxZoom={MAX_ZOOM}
							proOptions={{ hideAttribution: true }}
							deleteKeyCode={["Backspace", "Delete"]}
							panOnScroll
							zoomOnScroll={false}
							panOnDrag={selectMode ? [1, 2] : true}
							selectionOnDrag={selectMode}
							selectNodesOnDrag={false}
							selectionMode={SelectionMode.Partial}
						>
							{pattern !== "blank" ? (
								<Background
									variant={
										pattern === "lines"
											? BackgroundVariant.Lines
											: BackgroundVariant.Dots
									}
									gap={16}
								/>
							) : null}
							<Controls showInteractive={false} />
							<MiniMap pannable zoomable />
						</ReactFlow>
					</PanelBindingsContext.Provider>
					<CanvasCreateOverlay />
					<TooltipProvider delayDuration={300}>
						<CanvasWorkspaceControls
							workspaceId={workspaceId}
							onSelectWorkspace={onSelectWorkspace}
						/>
						<CanvasLeftRail
							customizeOpen={customizeOpen}
							onCustomize={() => setCustomizeOpen((v) => !v)}
						/>
						<CanvasRightRail />
						<CanvasSelectionToolbar />
						<CableOverlay />
						<PanelsListPopover nodes={nodes} />
					</TooltipProvider>
					<CustomizePopover
						repositoryId={repoId}
						open={customizeOpen}
						onOpenChange={setCustomizeOpen}
						anchor={
							<span
								className={cn(
									"-translate-y-1/2 pointer-events-none absolute top-1/2 block h-0 w-0 transition-[left] duration-200 ease-out",
									sidebarOpen ? "left-[328px]" : "left-14",
								)}
							/>
						}
					/>
				</div>
			</CanvasActionsProvider>
		</CanvasWorkspaceProvider>
	);
}
