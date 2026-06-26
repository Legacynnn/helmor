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

export type CanvasSyncHandle = {
	dispose: () => void;
	/** Apply fresh persisted state into the live store (e.g. after a CLI
	 * mutation) without echoing back to the DB. Diff-based + idempotent, so
	 * the app's own just-persisted edits reconcile to no-ops. */
	reconcile: (state: CanvasState) => void;
};

/** Bridges a tldraw editor to the canvas persistence layer for one workspace:
 *  - hydrates panels + camera from the loaded snapshot (no echo to the DB),
 *  - debounce-persists user edits (create / move / resize / restyle / delete),
 *  - routes camera pan/zoom into the shared view store,
 *  - reconciles external (CLI) mutations into the live store.
 *
 * Mounted from the `<Tldraw onMount>` callback. */
export function attachCanvasSync(
	editor: Editor,
	workspaceId: string,
	initial: CanvasState,
): CanvasSyncHandle {
	// Guards store-listener echo during programmatic hydration / reconcile.
	let suppressing = true;
	const panelTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const applyPanel = (panel: CanvasState["panels"][number]) => {
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
	};

	// ── Hydration ────────────────────────────────────────────────────────────
	// Create persisted panels as shapes (ignore history so they aren't undoable
	// and don't echo back to the DB), then restore the camera.
	editor.run(
		() => {
			for (const panel of initial.panels) applyPanel(panel);
		},
		{ history: "ignore" },
	);
	editor.setCamera({
		x: initial.viewState.panX,
		y: initial.viewState.panY,
		z: initial.viewState.zoom || 1,
	});
	// Release the suppress guard after the current task so the create/camera
	// store events above are fully drained before we start persisting.
	const releaseTimer = setTimeout(() => {
		suppressing = false;
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
			if (suppressing) return;
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

	const reconcile = (state: CanvasState) => {
		// Don't fight an in-flight interaction; the next event (or a remount)
		// reconciles once the user lets go.
		if (editor.inputs.isPointing) return;
		suppressing = true;
		editor.run(
			() => {
				const dbById = new Map(state.panels.map((p) => [p.id, p]));
				const live = editor
					.getCurrentPageShapes()
					.filter((s): s is PanelShape => s.type === "panel");
				const liveById = new Map(live.map((s) => [s.id, s]));

				for (const shape of live) {
					if (!dbById.has(shape.id)) editor.deleteShape(shape.id);
				}
				for (const panel of state.panels) {
					const shape = liveById.get(panel.id as TLShapeId);
					if (!shape) {
						applyPanel(panel);
						continue;
					}
					const changed =
						shape.x !== panel.x ||
						shape.y !== panel.y ||
						shape.props.w !== panel.width ||
						shape.props.h !== panel.height ||
						shape.props.title !== (panel.title ?? "") ||
						shape.props.config !== (panel.config ?? "{}") ||
						shape.isLocked !== panel.locked;
					if (changed) {
						editor.updateShape<PanelShape>({
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
				}
			},
			{ history: "ignore" },
		);
		useConnectionsStore.getState().hydrate(workspaceId, state.connections);
		// Drain the reconcile's own store events before re-enabling persistence.
		setTimeout(() => {
			suppressing = false;
		}, 0);
	};

	return {
		dispose: () => {
			clearTimeout(releaseTimer);
			for (const timer of panelTimers.values()) clearTimeout(timer);
			panelTimers.clear();
			unlisten();
		},
		reconcile,
	};
}
