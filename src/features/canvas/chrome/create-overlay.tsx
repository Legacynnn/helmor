import { useReactFlow } from "@xyflow/react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useCanvasActions } from "../canvas-actions-context";
import { useCanvasCreateStore } from "../canvas-create-store";
import { normalizeRect, type Point } from "../create-geometry";
import { PANEL_MIN_HEIGHT, PANEL_MIN_WIDTH } from "../types";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";

type DragState = { start: Point; current: Point };

/** Full-bleed overlay shown only while the Create rail has a panel type armed.
 * It captures the drag (so it draws a placement rectangle instead of panning),
 * previews the rectangle in the selection style, and on release creates a panel
 * of that type at exactly that flow-space position + size. A click (or a box
 * below the drag threshold) creates nothing and stays armed; Esc cancels. */
export function CanvasCreateOverlay() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const clear = useCanvasCreateStore((s) => s.clear);
	const { addPanel } = useCanvasActions();
	const rf = useReactFlow();
	const overlayRef = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<DragState | null>(null);

	// Esc cancels arming (and any in-flight drag).
	useEffect(() => {
		if (!pendingType) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setDrag(null);
				clear();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [pendingType, clear]);

	if (!pendingType) return null;

	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		const p = { x: e.clientX, y: e.clientY };
		setDrag({ start: p, current: p });
	};

	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		setDrag((d) => (d ? { ...d, current: { x: e.clientX, y: e.clientY } } : d));
	};

	const onPointerUp = () => {
		const d = drag;
		setDrag(null);
		if (!d) return;
		// Convert both corners to flow space so the panel lands exactly where the
		// box was drawn, at the right zoom.
		const a = rf.screenToFlowPosition(d.start);
		const b = rf.screenToFlowPosition(d.current);
		const rect = normalizeRect(a, b);
		// A click or a box smaller than a panel's minimum size creates nothing and
		// stays armed — so the panel is always EXACTLY the square the user drew
		// (never silently grown to a minimum that shifts its bounds).
		if (rect.width < PANEL_MIN_WIDTH || rect.height < PANEL_MIN_HEIGHT) return;
		void addPanel(pendingType, {
			position: { x: rect.x, y: rect.y },
			size: { width: rect.width, height: rect.height },
		});
		clear();
	};

	// Preview rectangle, positioned in overlay-local coordinates.
	let preview: React.ReactNode = null;
	if (drag && overlayRef.current) {
		const r = overlayRef.current.getBoundingClientRect();
		const left = Math.min(drag.start.x, drag.current.x) - r.left;
		const top = Math.min(drag.start.y, drag.current.y) - r.top;
		const width = Math.abs(drag.current.x - drag.start.x);
		const height = Math.abs(drag.current.y - drag.start.y);
		preview = (
			<div
				className="pointer-events-none absolute rounded-md border-2 border-dashed"
				style={{
					left,
					top,
					width,
					height,
					borderColor: SELECTED_COLOR,
					backgroundColor: `color-mix(in oklab, ${SELECTED_COLOR} 12%, transparent)`,
				}}
			/>
		);
	}

	return (
		// z-5: above the React Flow pane (capture the drag) but below the chrome
		// rails (z-10) so the user can still click a rail button / see the armed
		// highlight while placing.
		<div
			ref={overlayRef}
			className="absolute inset-0 z-[5] cursor-crosshair"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			{preview}
		</div>
	);
}
