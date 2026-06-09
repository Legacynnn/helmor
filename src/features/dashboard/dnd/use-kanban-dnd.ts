import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	DRAG_MOVE_ACTIVATE_PX,
	useDndActiveOverlay,
} from "@/features/navigation/dnd/shared";
import type { DashboardColumnId } from "../hooks/use-dashboard-board";
import { type KanbanDropTarget, resolveKanbanDropTarget } from "./resolve-drop";

/** Live state of an in-flight kanban card drag. Carries the geometry the
 *  floating ghost needs (`left`/`top`/`width`) plus the currently resolved
 *  drop target so the board can render the landing indicator. */
export type KanbanDragState = {
	workspaceId: string;
	title: string;
	sourceColumnId: DashboardColumnId;
	target: KanbanDropTarget;
	/** Top-left of the floating ghost, in viewport coordinates. */
	left: number;
	top: number;
	width: number;
};

type PendingStart = {
	workspaceId: string;
	title: string;
	sourceColumnId: DashboardColumnId;
	pointerId: number;
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	width: number;
};

type PointerSample = {
	clientX: number;
	clientY: number;
	pointerId: number;
};

export type MoveWorkspaceArgs = {
	workspaceId: string;
	targetColumnId: DashboardColumnId;
	beforeWorkspaceId: string | null;
};

/**
 * Pointer-event drag-and-drop for the dashboard kanban.
 *
 * The native HTML5 drag API (`draggable`/`onDrop`) is unreliable inside Tauri's
 * macOS WKWebView — `dragstart`/`drop` frequently never fire — so the board
 * drives drags off raw pointer events instead, mirroring the sidebar's
 * `useWorkspaceDnd`. A short activation threshold distinguishes a click (open
 * the workspace) from a drag (move it), and `requestAnimationFrame` throttles
 * the hit-testing so the ghost tracks the pointer at 60fps.
 */
export function useKanbanDnd({
	onMoveWorkspace,
}: {
	onMoveWorkspace: (args: MoveWorkspaceArgs) => void;
}) {
	const [dragState, setDragState] = useState<KanbanDragState | null>(null);
	const dragStateRef = useRef<KanbanDragState | null>(null);
	dragStateRef.current = dragState;

	const pendingRef = useRef<PendingStart | null>(null);
	const latestPointerRef = useRef<PointerSample | null>(null);
	const frameRef = useRef<number | null>(null);
	// Set the instant a drag ends so the synthetic `click` that follows
	// pointerup doesn't also open the workspace.
	const suppressClickRef = useRef(false);

	useDndActiveOverlay(dragState !== null);

	const clearPending = useCallback(() => {
		pendingRef.current = null;
		latestPointerRef.current = null;
		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
	}, []);

	const buildDragState = useCallback(
		(pending: PendingStart, sample: PointerSample): KanbanDragState => {
			const resolved = resolveKanbanDropTarget(
				sample.clientX,
				sample.clientY,
				pending.workspaceId,
			);
			return {
				workspaceId: pending.workspaceId,
				title: pending.title,
				sourceColumnId: pending.sourceColumnId,
				target: resolved ?? {
					columnId: pending.sourceColumnId,
					beforeId: null,
				},
				left: sample.clientX - pending.offsetX,
				top: sample.clientY - pending.offsetY,
				width: pending.width,
			};
		},
		[],
	);

	const flushFrame = useCallback(() => {
		frameRef.current = null;
		const pending = pendingRef.current;
		const sample = latestPointerRef.current;
		if (!pending || !sample) return;
		if (sample.pointerId !== pending.pointerId) return;
		const next = buildDragState(pending, sample);
		dragStateRef.current = next;
		setDragState(next);
	}, [buildDragState]);

	const scheduleFrame = useCallback(
		(sample: PointerSample) => {
			latestPointerRef.current = sample;
			if (frameRef.current !== null) return;
			frameRef.current = window.requestAnimationFrame(flushFrame);
		},
		[flushFrame],
	);

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			const pending = pendingRef.current;
			if (!pending || event.pointerId !== pending.pointerId) return;

			const sample: PointerSample = {
				clientX: event.clientX,
				clientY: event.clientY,
				pointerId: event.pointerId,
			};

			if (dragStateRef.current) {
				event.preventDefault();
				scheduleFrame(sample);
				return;
			}

			// Not yet a drag — promote once the pointer travels past the
			// activation threshold in any direction.
			const dx = event.clientX - pending.startX;
			const dy = event.clientY - pending.startY;
			if (Math.hypot(dx, dy) < DRAG_MOVE_ACTIVATE_PX) return;
			event.preventDefault();
			const next = buildDragState(pending, sample);
			dragStateRef.current = next;
			setDragState(next);
		};

		const onPointerUp = (event: PointerEvent) => {
			const pending = pendingRef.current;
			if (!pending || event.pointerId !== pending.pointerId) {
				clearPending();
				return;
			}

			if (frameRef.current !== null) {
				window.cancelAnimationFrame(frameRef.current);
				flushFrame();
			}

			const active = dragStateRef.current;
			if (active) {
				event.preventDefault();
				suppressClickRef.current = true;
				const movedColumn = active.target.columnId !== active.sourceColumnId;
				const movedRow = active.target.beforeId !== active.workspaceId;
				if (movedColumn || movedRow) {
					onMoveWorkspace({
						workspaceId: active.workspaceId,
						targetColumnId: active.target.columnId,
						beforeWorkspaceId: active.target.beforeId,
					});
				}
				dragStateRef.current = null;
				setDragState(null);
			}
			clearPending();
		};

		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp, { passive: false });
		window.addEventListener("pointercancel", onPointerUp, { passive: false });
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		};
	}, [
		buildDragState,
		clearPending,
		flushFrame,
		onMoveWorkspace,
		scheduleFrame,
	]);

	const startDragGesture = useCallback(
		({
			event,
			workspaceId,
			columnId,
			title,
		}: {
			event: ReactPointerEvent<HTMLElement>;
			workspaceId: string;
			columnId: DashboardColumnId;
			title: string;
		}) => {
			// Left button only; ignore modifier-clicks so cmd/shift selection and
			// context menus pass through untouched.
			if (
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}
			const rect = event.currentTarget.getBoundingClientRect();
			clearPending();
			pendingRef.current = {
				workspaceId,
				title,
				sourceColumnId: columnId,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				offsetX: event.clientX - rect.left,
				offsetY: event.clientY - rect.top,
				width: rect.width,
			};
		},
		[clearPending],
	);

	/** True exactly once after a drag, so the card's onClick can bail out of
	 *  opening the workspace. Self-resets on read. */
	const shouldSuppressClick = useCallback(() => {
		if (!suppressClickRef.current) return false;
		suppressClickRef.current = false;
		return true;
	}, []);

	return {
		dragState,
		dropTarget: dragState?.target ?? null,
		draggingWorkspaceId: dragState?.workspaceId ?? null,
		startDragGesture,
		shouldSuppressClick,
	};
}
