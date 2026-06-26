import type { Editor, TLShapeId } from "tldraw";
import { closeTerminal } from "@/features/terminal/terminal-session-store";
import {
	type CanvasPanel,
	type CanvasPanelType,
	type CanvasState,
	deleteCanvasPanel,
	saveCanvasPanel,
} from "@/lib/api";
import { useCanvasViewStore } from "./canvas-view-store";
import { useConnectionsStore } from "./connections/connections-store";
import { parsePanelConfig } from "./panel-config";
import type { PanelShape } from "./shapes/panel-shape";

const PANEL_SAVE_DEBOUNCE_MS = 350;

/** Map a live tldraw panel shape to its persisted row. The shape id IS the
 * DB id, so identity round-trips. Lock state uses tldraw's native `isLocked`
 * (mirrored into the `locked` column). */
function shapeToPanel(shape: PanelShape, workspaceId: string): CanvasPanel {
	return {
		id: shape.id,
		workspaceId,
		panelType: shape.props.panelType,
		x: shape.x,
		y: shape.y,
		width: shape.props.w,
		height: shape.props.h,
		z: 0,
		locked: shape.isLocked,
		title: shape.props.title,
		config: shape.props.config,
		createdAt: "",
		updatedAt: "",
	};
}

/** Bridges a tldraw editor to the canvas persistence layer for one workspace:
 *  - hydrates panels + camera from the loaded snapshot (no echo to the DB),
 *  - debounce-persists user edits (create / move / resize / restyle / delete),
 *  - debounce-persists camera pan/zoom into `canvas_view_state`.
 *
 * Returns a disposer that flushes nothing but tears down listeners + timers.
 * Mounted from the `<Tldraw onMount>` callback. */
export function attachCanvasSync(
	editor: Editor,
	workspaceId: string,
	initial: CanvasState,
): () => void {
	let hydrating = true;
	const panelTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// ── Hydration ────────────────────────────────────────────────────────────
	// Create persisted panels as shapes (ignore history so they aren't undoable
	// and don't echo back to the DB), then restore the camera.
	editor.run(
		() => {
			for (const panel of initial.panels) {
				editor.createShape<PanelShape>({
					id: panel.id as TLShapeId,
					type: "panel",
					x: panel.x,
					y: panel.y,
					isLocked: panel.locked,
					props: {
						w: panel.width,
						h: panel.height,
						panelType: panel.panelType as CanvasPanelType,
						title: panel.title ?? "",
						config: panel.config ?? "{}",
						locked: panel.locked,
					},
				});
			}
		},
		{ history: "ignore" },
	);
	editor.setCamera({
		x: initial.viewState.panX,
		y: initial.viewState.panY,
		z: initial.viewState.zoom || 1,
	});
	// Release the hydration guard after the current task so the create/camera
	// store events above are fully drained before we start persisting.
	const releaseTimer = setTimeout(() => {
		hydrating = false;
	}, 0);

	// ── Persistence helpers ───────────────────────────────────────────────────
	const queuePanelSave = (shape: PanelShape) => {
		const existing = panelTimers.get(shape.id);
		if (existing) clearTimeout(existing);
		panelTimers.set(
			shape.id,
			setTimeout(() => {
				panelTimers.delete(shape.id);
				void saveCanvasPanel(shapeToPanel(shape, workspaceId)).catch(() => {});
			}, PANEL_SAVE_DEBOUNCE_MS),
		);
	};

	const queuePanelDelete = (id: string) => {
		const existing = panelTimers.get(id);
		if (existing) clearTimeout(existing);
		panelTimers.delete(id);
		void deleteCanvasPanel(workspaceId, id).catch(() => {});
	};

	// Camera changes route through the shared view store (which owns the
	// debounced persist together with the appearance fields).
	const queueViewSave = () => {
		const cam = editor.getCamera();
		useCanvasViewStore.getState().setCamera(cam.x, cam.y, cam.z);
	};

	// ── Change listener ───────────────────────────────────────────────────────
	const unlisten = editor.store.listen(
		(history) => {
			if (hydrating) return;
			const { added, updated, removed } = history.changes;

			for (const record of Object.values(added)) {
				if (record.typeName === "shape" && record.type === "panel") {
					queuePanelSave(record as PanelShape);
				}
			}
			for (const [, next] of Object.values(updated)) {
				if (next.typeName === "shape" && next.type === "panel") {
					queuePanelSave(next as PanelShape);
				} else if (next.typeName === "camera") {
					queueViewSave();
				}
			}
			for (const record of Object.values(removed)) {
				if (record.typeName === "shape" && record.type === "panel") {
					// Tear down a terminal panel's PTY on real deletion (NOT on a
					// canvas-mode-toggle unmount — that path keeps the shape, so the
					// store buffer survives). Deleting a conversation panel leaves its
					// session + history intact (non-destructive).
					const panel = record as PanelShape;
					if (panel.props.panelType === "terminal") {
						const { instanceId } = parsePanelConfig(panel.props.config);
						if (instanceId) closeTerminal(instanceId);
					}
					// Backend delete_panel cascades edges server-side; drop them from
					// local state too so the edges layer updates immediately.
					useConnectionsStore.getState().pruneForPanel(record.id);
					queuePanelDelete(record.id);
				}
			}
		},
		{ source: "user", scope: "all" },
	);

	return () => {
		clearTimeout(releaseTimer);
		for (const timer of panelTimers.values()) clearTimeout(timer);
		panelTimers.clear();
		unlisten();
	};
}
