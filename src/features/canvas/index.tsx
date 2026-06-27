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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CanvasState } from "@/lib/api";
import { convertFileSrc } from "@/lib/ipc";
import {
	canvasStateQueryOptions,
	workspaceDetailQueryOptions,
} from "@/lib/query-client";
import { resolveBackgroundUrl } from "./backgrounds";
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
import { CanvasRightRail } from "./chrome/right-rail";
import { CanvasSelectionToolbar } from "./chrome/selection-toolbar";
import { CanvasWorkspaceControls } from "./chrome/workspace-controls";
import {
	connectionMeta,
	useConnectionsStore,
} from "./connections/connections-store";
import { PanelNode } from "./panel-node";
import type { PanelNode as PanelNodeType } from "./types";
import { useCanvasGraph } from "./use-canvas-graph";
import { useSessionImport } from "./use-session-import";

const NODE_TYPES = { panel: PanelNode };

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
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [customizeOpen, setCustomizeOpen] = useState(false);
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
			workspaceReady: detail?.state === "ready",
		}),
		[workspaceId, detail?.repoId, detail?.rootPath, detail?.state],
	);

	// Hydrate the transient stores once from the initial snapshot.
	const hydrated = useRef(false);
	if (!hydrated.current) {
		hydrated.current = true;
		useConnectionsStore.getState().hydrate(workspaceId, initial.connections);
		useCanvasViewStore.getState().hydrate(initial.viewState);
	}

	const { nodes, onNodesChange, actions, reconcile } = useCanvasGraph(
		workspaceId,
		initial,
		wrapperRef,
	);

	// First entry to an empty canvas seeds the workspace's existing sessions as
	// conversation panels.
	useSessionImport(
		workspaceId,
		initial.panels.length > 0,
		nodes,
		actions.addPanel,
	);

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

	// Appearance from the view store.
	const translucency = useCanvasViewStore((s) => s.translucency);
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	const theme = useCanvasViewStore((s) => s.backgroundTheme);
	const snapToGrid = useCanvasViewStore((s) => s.snapToGrid);
	const setCamera = useCanvasViewStore((s) => s.setCamera);
	const backgroundImage = useCanvasViewStore((s) => s.backgroundImage);
	const backgroundUrl = useMemo(
		() => resolveBackgroundUrl(backgroundImage, convertFileSrc),
		[backgroundImage],
	);

	const onMoveEnd = useCallback(
		(_e: unknown, vp: Viewport) => setCamera(vp.x, vp.y, vp.zoom),
		[setCamera],
	);

	const onEdgesDelete = useCallback((deleted: Edge[]) => {
		const store = useConnectionsStore.getState();
		for (const e of deleted) store.disconnect(e.id);
	}, []);

	return (
		<CanvasWorkspaceProvider value={workspaceInfo}>
			<CanvasActionsProvider value={actions}>
				<div
					ref={wrapperRef}
					className="relative size-full overflow-hidden bg-app-base"
					style={
						{ "--canvas-panel-opacity": translucency } as React.CSSProperties
					}
				>
					{backgroundUrl ? (
						<div
							className="pointer-events-none absolute inset-0 z-0 bg-center bg-cover"
							style={{ backgroundImage: `url("${backgroundUrl}")` }}
						>
							<div className="absolute inset-0 bg-app-base/40" />
						</div>
					) : null}
					<ReactFlow<PanelNodeType>
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onConnect={onConnect}
						onEdgesDelete={onEdgesDelete}
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
						minZoom={0.1}
						maxZoom={2}
						proOptions={{ hideAttribution: true }}
						deleteKeyCode={["Backspace", "Delete"]}
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
					<CanvasCreateOverlay />
					<TooltipProvider delayDuration={300}>
						<CanvasWorkspaceControls
							workspaceId={workspaceId}
							onSelectWorkspace={onSelectWorkspace}
						/>
						<CanvasLeftRail
							workspaceId={workspaceId}
							customizeOpen={customizeOpen}
							onCustomize={() => setCustomizeOpen((v) => !v)}
						/>
						<CanvasRightRail />
						<CanvasSelectionToolbar />
					</TooltipProvider>
					<CustomizePopover
						workspaceId={workspaceId}
						open={customizeOpen}
						onOpenChange={setCustomizeOpen}
						anchor={
							<span className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-14 block h-0 w-0" />
						}
					/>
				</div>
			</CanvasActionsProvider>
		</CanvasWorkspaceProvider>
	);
}
