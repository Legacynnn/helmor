import { useQuery } from "@tanstack/react-query";
import { PanelsTopLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import {
	canvasStateQueryOptions,
	workspaceDetailQueryOptions,
} from "@/lib/query-client";
import { CanvasCreateToolbar } from "./canvas-create-toolbar";
import {
	type CanvasWorkspaceInfo,
	CanvasWorkspaceProvider,
} from "./canvas-workspace-context";
import { PanelShapeUtil } from "./shapes/panel-shape";
import { useCanvasModeStore } from "./use-canvas-mode";
import { attachCanvasSync } from "./use-canvas-sync";

const SHAPE_UTILS = [PanelShapeUtil];

/** Full-bleed Infinite Canvas surface for one workspace (epic #61, Phase 1).
 *
 * Replaces the 3-column chrome when canvas mode is active. Loads the persisted
 * canvas once, mounts a tldraw editor, and bridges it to the persistence layer
 * via {@link attachCanvasSync}. Keyed by workspace id upstream so switching
 * workspaces remounts a fresh editor. */
export function CanvasSurface({ workspaceId }: { workspaceId: string }) {
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
	const disposeRef = useRef<(() => void) | null>(null);
	// Snapshot the loaded state into a ref so onMount reads the latest without
	// re-running on every render.
	const stateRef = useRef(data);
	stateRef.current = data;

	const handleMount = useCallback(
		(mounted: Editor) => {
			setEditor(mounted);
			const initial = stateRef.current;
			if (initial) {
				disposeRef.current = attachCanvasSync(mounted, workspaceId, initial);
			}
		},
		[workspaceId],
	);

	useEffect(() => {
		return () => {
			disposeRef.current?.();
			disposeRef.current = null;
		};
	}, []);

	if (isLoading || !data) {
		return (
			<div className="flex size-full items-center justify-center bg-app-base text-app-muted-foreground text-sm">
				Loading canvas…
			</div>
		);
	}

	return (
		<CanvasWorkspaceProvider value={workspaceInfo}>
			<div className="relative size-full overflow-hidden bg-app-base">
				<Tldraw
					hideUi
					shapeUtils={SHAPE_UTILS}
					onMount={handleMount}
					// Ephemeral store — Helmor owns persistence via attachCanvasSync.
				/>
				{/* Top-left workspace chrome (seed of the Phase 5 control region). */}
				<div className="pointer-events-auto absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-app-border bg-app-base/90 p-1 shadow-lg backdrop-blur">
					<button
						type="button"
						className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-app-muted"
						onClick={() =>
							useCanvasModeStore.getState().setMode(workspaceId, false)
						}
						title="Exit canvas mode"
					>
						<PanelsTopLeft className="size-3.5 opacity-70" />
						<span>Exit canvas</span>
					</button>
				</div>
				<CanvasCreateToolbar editor={editor} workspaceId={workspaceId} />
			</div>
		</CanvasWorkspaceProvider>
	);
}
