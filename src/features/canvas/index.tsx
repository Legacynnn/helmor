import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Editor, type TLComponents, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import {
	canvasStateQueryOptions,
	workspaceDetailQueryOptions,
} from "@/lib/query-client";
import { CanvasCreateToolbar } from "./canvas-create-toolbar";
import { useCanvasViewStore } from "./canvas-view-store";
import {
	type CanvasWorkspaceInfo,
	CanvasWorkspaceProvider,
} from "./canvas-workspace-context";
import { CanvasGrid } from "./chrome/canvas-grid";
import { CanvasManageRail } from "./chrome/manage-rail";
import { CanvasSelectionToolbar } from "./chrome/selection-toolbar";
import { CanvasWorkspaceControls } from "./chrome/workspace-controls";
import { CanvasZoomCluster } from "./chrome/zoom-cluster";
import { useConnectionsStore } from "./connections/connections-store";
import { CanvasEdgesLayer } from "./connections/edges-layer";
import { PanelShapeUtil } from "./shapes/panel-shape";
import { attachCanvasSync } from "./use-canvas-sync";

const SHAPE_UTILS = [PanelShapeUtil];
const COMPONENTS: TLComponents = {
	OnTheCanvas: CanvasEdgesLayer,
	Grid: CanvasGrid,
};

/** Full-bleed Infinite Canvas surface for one workspace (epic #61).
 *
 * Replaces the 3-column chrome when canvas mode is active. Loads the persisted
 * canvas once, mounts a tldraw editor, bridges it to persistence via
 * {@link attachCanvasSync}, and floats the fixed control regions (workspace /
 * manage / create / selection / zoom) above the spatial surface. Keyed by
 * workspace id upstream so switching workspaces remounts a fresh editor. */
export function CanvasSurface({
	workspaceId,
	onSelectWorkspace,
}: {
	workspaceId: string;
	onSelectWorkspace?: (workspaceId: string) => void;
}) {
	const { data, isLoading } = useQuery(canvasStateQueryOptions(workspaceId));
	const { data: detail } = useQuery(workspaceDetailQueryOptions(workspaceId));
	const [editor, setEditor] = useState<Editor | null>(null);

	const workspaceInfo = useMemo<CanvasWorkspaceInfo>(
		() => ({
			workspaceId,
			repoId: detail?.repoId ?? null,
			workspaceRootPath: detail?.rootPath ?? null,
			workspaceReady: detail?.state === "ready",
		}),
		[workspaceId, detail?.repoId, detail?.rootPath, detail?.state],
	);
	const handleRef = useRef<ReturnType<typeof attachCanvasSync> | null>(null);
	const stateRef = useRef(data);
	stateRef.current = data;
	// The state object used to hydrate at mount — later query refetches (after a
	// CLI `CanvasChanged`) produce a fresh object that we reconcile in.
	const hydratedFrom = useRef<typeof data | null>(null);

	const handleMount = useCallback(
		(mounted: Editor) => {
			setEditor(mounted);
			const initial = stateRef.current;
			if (!initial) return;
			useConnectionsStore.getState().hydrate(workspaceId, initial.connections);
			useCanvasViewStore.getState().hydrate(initial.viewState);
			handleRef.current = attachCanvasSync(mounted, workspaceId, initial);
			hydratedFrom.current = initial;
		},
		[workspaceId],
	);

	// Reconcile external (CLI) mutations: when the query refetches a new state
	// object, diff it into the live store.
	useEffect(() => {
		if (!data || !handleRef.current) return;
		if (data === hydratedFrom.current) return;
		hydratedFrom.current = data;
		handleRef.current.reconcile(data);
	}, [data]);

	useEffect(() => {
		return () => {
			handleRef.current?.dispose();
			handleRef.current = null;
		};
	}, []);

	// Live-apply appearance: tldraw color scheme + grid mode follow the view
	// store; translucency rides a CSS var consumed by every DOM panel.
	const translucency = useCanvasViewStore((s) => s.translucency);
	const backgroundTheme = useCanvasViewStore((s) => s.backgroundTheme);
	const backgroundPattern = useCanvasViewStore((s) => s.backgroundPattern);
	const snapToGrid = useCanvasViewStore((s) => s.snapToGrid);

	useEffect(() => {
		if (!editor) return;
		editor.user.updateUserPreferences({ colorScheme: backgroundTheme });
	}, [editor, backgroundTheme]);

	useEffect(() => {
		if (!editor) return;
		// Grid mode drives both the custom grid display and tldraw's snapping.
		editor.updateInstanceState({
			isGridMode: snapToGrid || backgroundPattern !== "blank",
		});
	}, [editor, snapToGrid, backgroundPattern]);

	if (isLoading || !data) {
		return (
			<div className="flex size-full items-center justify-center bg-app-base text-app-muted-foreground text-sm">
				Loading canvas…
			</div>
		);
	}

	return (
		<CanvasWorkspaceProvider value={workspaceInfo}>
			<div
				className="relative size-full overflow-hidden bg-app-base"
				style={
					{ "--canvas-panel-opacity": translucency } as React.CSSProperties
				}
			>
				<Tldraw
					hideUi
					shapeUtils={SHAPE_UTILS}
					components={COMPONENTS}
					onMount={handleMount}
					// Ephemeral store — Helmor owns persistence via attachCanvasSync.
				/>
				<CanvasWorkspaceControls
					workspaceId={workspaceId}
					onSelectWorkspace={onSelectWorkspace}
				/>
				{editor ? (
					<>
						<CanvasManageRail editor={editor} />
						<CanvasSelectionToolbar editor={editor} />
						<CanvasZoomCluster editor={editor} />
					</>
				) : null}
				<CanvasCreateToolbar editor={editor} workspaceId={workspaceId} />
			</div>
		</CanvasWorkspaceProvider>
	);
}
