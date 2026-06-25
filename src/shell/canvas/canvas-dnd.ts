// Pointer-based drag-to-split for the split-canvas. Mirrors the workspace
// sidebar DnD pattern (`features/navigation/dnd`): no HTML5 `draggable`, no new
// library — a global capture pointer-down detects a gesture starting on any
// element tagged `data-canvas-drag-session`, an activation threshold separates
// a click (select the tab) from a drag, and `elementsFromPoint` hit-tests the
// pane the pointer is over. Dropping splits/moves toward the nearest edge.
//
// The drag SOURCE needs only a `data-canvas-drag-session` (and optional
// `data-canvas-drag-pane`) attribute on the tab element — zero React callback
// threading through the header. All logic lives here in the canvas module.

import {
	createElement,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { DropEdge } from "./tree-model";

/** Pointer travel (px) before a press becomes a drag rather than a click. */
const ACTIVATE_PX = 4;

type Rect = { left: number; top: number; width: number; height: number };

/** Nearest edge of `rect` to the point — the side the dropped pane snaps to. */
export function resolveDropEdge(rect: Rect, x: number, y: number): DropEdge {
	const distances: Array<[DropEdge, number]> = [
		["left", x - rect.left],
		["right", rect.left + rect.width - x],
		["top", y - rect.top],
		["bottom", rect.top + rect.height - y],
	];
	let best: DropEdge = "left";
	let bestDist = Number.POSITIVE_INFINITY;
	for (const [edge, dist] of distances) {
		if (dist < bestDist) {
			bestDist = dist;
			best = edge;
		}
	}
	return best;
}

type DropTarget = { paneId: string; edge: DropEdge; rect: Rect };

type DragState = {
	sessionId: string;
	sourcePaneId: string | null;
	pointerX: number;
	pointerY: number;
	target: DropTarget | null;
};

type PendingStart = {
	sessionId: string;
	sourcePaneId: string | null;
	sourceEl: HTMLElement;
	startX: number;
	startY: number;
	pointerId: number;
};

type UseCanvasTabDndArgs = {
	enabled: boolean;
	onDrop: (
		sessionId: string,
		sourcePaneId: string | null,
		targetPaneId: string,
		edge: DropEdge,
	) => void;
	/** Called for a genuine CLICK on a drag-source tab (press + release with no
	 *  drag). We suppress the tab's native mousedown selection so a drag never
	 *  activates the tab, then replay the selection here on a real click. */
	onActivateSession?: (sessionId: string) => void;
};

/** True for the tab's inner action controls (rename / close) — these keep
 *  their native behaviour and never start a drag or a deferred selection. */
function isTabActionControl(target: EventTarget | null): boolean {
	return Boolean((target as HTMLElement | null)?.closest?.('[role="button"]'));
}

/** The drag-source tab element under `target`, if any. */
function findDragSource(target: EventTarget | null): HTMLElement | null {
	const el = (target as HTMLElement | null)?.closest?.(
		"[data-canvas-drag-session]",
	);
	return el instanceof HTMLElement ? el : null;
}

export function useCanvasTabDnd({
	enabled,
	onDrop,
	onActivateSession,
}: UseCanvasTabDndArgs): {
	overlay: ReactNode;
} {
	const [drag, setDrag] = useState<DragState | null>(null);
	const pendingRef = useRef<PendingStart | null>(null);
	const dragRef = useRef<DragState | null>(null);
	const onDropRef = useRef(onDrop);
	onDropRef.current = onDrop;
	const onActivateRef = useRef(onActivateSession);
	onActivateRef.current = onActivateSession;
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	useEffect(() => {
		function commit(next: DragState | null) {
			dragRef.current = next;
			setDrag(next);
		}

		function resolveTarget(x: number, y: number): DropTarget | null {
			if (typeof document.elementsFromPoint !== "function") {
				return null;
			}
			const stack = document.elementsFromPoint(x, y);
			for (const el of stack) {
				const zone = (el as HTMLElement).closest?.("[data-canvas-dropzone]");
				if (zone instanceof HTMLElement) {
					const paneId = zone.getAttribute("data-canvas-dropzone");
					if (!paneId) continue;
					const r = zone.getBoundingClientRect();
					const rect = {
						left: r.left,
						top: r.top,
						width: r.width,
						height: r.height,
					};
					return { paneId, edge: resolveDropEdge(rect, x, y), rect };
				}
			}
			return null;
		}

		// Block the tab's native mousedown/focus selection for drag-source tabs
		// so pressing-to-drag never activates the tab. Radix's Tabs.Trigger
		// selects directly in `onMouseDown` (and via focus); `preventDefault`
		// here (capture phase, before React's handler) makes its
		// `composeEventHandlers` skip the activation AND stops the button from
		// focusing. Selection is replayed on a real click in `onPointerUp`.
		function onMouseDownCapture(event: MouseEvent) {
			if (!enabledRef.current || event.button !== 0) return;
			if (isTabActionControl(event.target)) return;
			if (findDragSource(event.target)) {
				event.preventDefault();
			}
		}

		function onPointerDown(event: PointerEvent) {
			if (!enabledRef.current) return;
			if (isTabActionControl(event.target)) return;
			const source = findDragSource(event.target);
			if (!source) return;
			const sessionId = source.getAttribute("data-canvas-drag-session");
			if (!sessionId) return;
			pendingRef.current = {
				sessionId,
				sourcePaneId: source.getAttribute("data-canvas-drag-pane"),
				sourceEl: source,
				startX: event.clientX,
				startY: event.clientY,
				pointerId: event.pointerId,
			};
		}

		function onPointerMove(event: PointerEvent) {
			const active = dragRef.current;
			if (active) {
				event.preventDefault();
				commit({
					...active,
					pointerX: event.clientX,
					pointerY: event.clientY,
					target: resolveTarget(event.clientX, event.clientY),
				});
				return;
			}
			const pending = pendingRef.current;
			if (!pending || event.pointerId !== pending.pointerId) return;
			const moved = Math.hypot(
				event.clientX - pending.startX,
				event.clientY - pending.startY,
			);
			if (moved < ACTIVATE_PX) return;
			document.documentElement.style.cursor = "grabbing";
			commit({
				sessionId: pending.sessionId,
				sourcePaneId: pending.sourcePaneId,
				pointerX: event.clientX,
				pointerY: event.clientY,
				target: resolveTarget(event.clientX, event.clientY),
			});
		}

		function endDrag() {
			document.documentElement.style.removeProperty("cursor");
			pendingRef.current = null;
			commit(null);
		}

		function onPointerUp(event: PointerEvent) {
			const active = dragRef.current;
			if (!active) {
				// No drag activated → a genuine click on the tab. Replay the
				// selection we suppressed at mousedown, and restore keyboard
				// focus (already-selected ⇒ no double activation from onFocus).
				const pending = pendingRef.current;
				pendingRef.current = null;
				if (pending && pending.pointerId === event.pointerId) {
					onActivateRef.current?.(pending.sessionId);
					pending.sourceEl.focus?.();
				}
				return;
			}
			const target = resolveTarget(event.clientX, event.clientY);
			if (target) {
				onDropRef.current(
					active.sessionId,
					active.sourcePaneId,
					target.paneId,
					target.edge,
				);
				// Swallow the click that would otherwise re-select the tab.
				const swallow = (click: MouseEvent) => {
					click.stopPropagation();
					click.preventDefault();
				};
				window.addEventListener("click", swallow, {
					capture: true,
					once: true,
				});
			}
			endDrag();
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && dragRef.current) {
				endDrag();
			}
		}

		window.addEventListener("mousedown", onMouseDownCapture, { capture: true });
		window.addEventListener("pointerdown", onPointerDown, { capture: true });
		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", endDrag);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("mousedown", onMouseDownCapture, {
				capture: true,
			});
			window.removeEventListener("pointerdown", onPointerDown, {
				capture: true,
			});
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", endDrag);
			window.removeEventListener("keydown", onKeyDown);
			document.documentElement.style.removeProperty("cursor");
		};
	}, []);

	const overlay =
		drag && typeof document !== "undefined"
			? createPortal(renderOverlay(drag), document.body)
			: null;

	return { overlay };
}

function renderOverlay(drag: DragState): ReactNode {
	const children: ReactNode[] = [
		// Ghost following the pointer.
		createElement(
			"div",
			{
				key: "ghost",
				style: {
					position: "fixed",
					left: drag.pointerX + 12,
					top: drag.pointerY + 12,
					zIndex: 9999,
					pointerEvents: "none",
				},
				className:
					"rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
			},
			"Drop on a pane edge to split",
		),
	];
	if (drag.target) {
		const { rect, edge } = drag.target;
		const half = edgeHighlightRect(rect, edge);
		children.push(
			createElement("div", {
				key: "edge",
				style: {
					position: "fixed",
					left: half.left,
					top: half.top,
					width: half.width,
					height: half.height,
					zIndex: 9998,
					pointerEvents: "none",
				},
				className:
					"rounded-sm bg-ring/25 ring-2 ring-inset ring-ring transition-all",
			}),
		);
	}
	return createElement("div", { "aria-hidden": "true" }, ...children);
}

/** The half-pane band the dropped session would occupy, for the highlight. */
function edgeHighlightRect(rect: Rect, edge: DropEdge): Rect {
	switch (edge) {
		case "left":
			return { ...rect, width: rect.width / 2 };
		case "right":
			return {
				...rect,
				left: rect.left + rect.width / 2,
				width: rect.width / 2,
			};
		case "top":
			return { ...rect, height: rect.height / 2 };
		case "bottom":
			return {
				...rect,
				top: rect.top + rect.height / 2,
				height: rect.height / 2,
			};
	}
}
