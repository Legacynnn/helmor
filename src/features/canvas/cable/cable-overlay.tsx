import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH } from "../types";
import { useCableStore } from "./cable-store";
import {
	createRope,
	type Rect,
	type Rope,
	step,
	type Vec,
} from "./verlet-rope";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";
const SEGMENTS = 24;

/** Renders the active connect cable as a draggable physics rope over the canvas.
 * Simulates in flow coordinates and projects to screen via the live viewport so
 * the cable pans/zooms with the panes. Drawing is imperative (no per-frame React
 * re-render); only mount/unmount is driven by store state.
 *
 * IMPORTANT: mount this as a direct child of the same element the React Flow
 * pane fills (the canvas `wrapperRef` div), so the SVG's `inset-0` origin
 * coincides with the pane origin. The draw path projects flow→screen relative
 * to the pane, while pointer input uses `screenToFlowPosition` (client-rect
 * relative); the two are exact inverses only when the SVG overlays the pane
 * with zero offset. */
export function CableOverlay() {
	const rf = useReactFlow();
	const hasActive = useCableStore((s) => s.active !== null);
	const sourceId = useCableStore((s) => s.active?.sourcePaneId ?? null);

	const svgRef = useRef<SVGSVGElement>(null);
	const pathRef = useRef<SVGPathElement>(null);
	const plugRef = useRef<SVGGElement>(null);
	const ropeRef = useRef<Rope | null>(null);

	// (Re)build the rope whenever a new cable is spawned for a different source.
	useEffect(() => {
		if (!hasActive) {
			ropeRef.current = null;
			return;
		}
		const active = useCableStore.getState().active;
		if (!active) return;
		ropeRef.current = createRope(active.anchor, active.plug, SEGMENTS);
	}, [hasActive, sourceId]);

	// rAF simulation + draw loop, alive only while a cable is active.
	useEffect(() => {
		if (!hasActive) return;
		let raf = 0;

		const tick = () => {
			raf = requestAnimationFrame(tick);
			const active = useCableStore.getState().active;
			const rope = ropeRef.current;
			if (!active || !rope) return;

			const nodes = rf.getNodes();
			const vp = rf.getViewport();

			// Source anchor follows the source pane's right-edge midpoint.
			const src = nodes.find((n) => n.id === active.sourcePaneId);
			const anchor: Vec = src
				? {
						x: src.position.x + nodeWidth(src),
						y: src.position.y + nodeHeight(src) / 2,
					}
				: active.anchor;

			// Colliders: every pane rectangle except the source.
			const colliders: Rect[] = nodes
				.filter((n) => n.id !== active.sourcePaneId)
				.map((n) => ({
					x: n.position.x,
					y: n.position.y,
					w: nodeWidth(n),
					h: nodeHeight(n),
				}));

			// Pin the plug only while dragging or plugged; otherwise it dangles.
			const pinned = active.dragging || active.pluggedTargetId !== null;
			step(rope, {
				anchor,
				plug: pinned ? active.plug : null,
				colliders,
				gravity: 0.6,
			});

			// Project flow → screen and draw.
			const toScreen = (p: { x: number; y: number }) => ({
				x: p.x * vp.zoom + vp.x,
				y: p.y * vp.zoom + vp.y,
			});
			const pts = rope.points.map(toScreen);
			if (pathRef.current) {
				pathRef.current.setAttribute("d", smoothPath(pts));
			}
			if (plugRef.current) {
				const tip = pts[pts.length - 1];
				plugRef.current.setAttribute(
					"transform",
					`translate(${tip.x}, ${tip.y})`,
				);
				plugRef.current.style.fill =
					active.hoveredTargetId !== null || active.pluggedTargetId !== null
						? SELECTED_COLOR
						: "#cbd5e1";
			}
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [hasActive, rf]);

	if (!hasActive) return null;

	const onPlugPointerDown = (e: React.PointerEvent) => {
		e.stopPropagation();
		e.preventDefault();
		(e.target as Element).setPointerCapture?.(e.pointerId);
		useCableStore.getState().setDragging(true);
	};

	const onPlugPointerMove = (e: React.PointerEvent) => {
		const store = useCableStore.getState();
		if (!store.active?.dragging) return;
		const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
		const target = paneAt(rf, flow, store.active.sourcePaneId);
		store.updatePlug(flow, target);
	};

	const onPlugPointerUp = (e: React.PointerEvent) => {
		(e.target as Element).releasePointerCapture?.(e.pointerId);
		const store = useCableStore.getState();
		if (!store.active) return;
		const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
		const target = paneAt(rf, flow, store.active.sourcePaneId);
		if (target) {
			// Snap to the target pane's left-edge midpoint (decorative plug-in).
			const node = rf.getNode(target);
			if (node) {
				store.plugInto(target, {
					x: node.position.x,
					y: node.position.y + nodeHeight(node) / 2,
				});
				return;
			}
		}
		// Released over empty space: let the plug fall and dangle.
		store.setDragging(false);
	};

	return (
		<svg
			ref={svgRef}
			className="pointer-events-none absolute inset-0 z-10 size-full"
			aria-hidden
		>
			<path
				ref={pathRef}
				fill="none"
				stroke={SELECTED_COLOR}
				strokeWidth={4}
				strokeLinecap="round"
				opacity={0.9}
			/>
			<g
				ref={plugRef}
				className="pointer-events-auto cursor-grab"
				onPointerDown={onPlugPointerDown}
				onPointerMove={onPlugPointerMove}
				onPointerUp={onPlugPointerUp}
			>
				{/* Larger invisible hit area for easy grabbing. */}
				<circle r={16} fill="transparent" />
				<circle
					r={7}
					fill="#cbd5e1"
					stroke="rgba(0,0,0,0.4)"
					strokeWidth={1.5}
				/>
			</g>
		</svg>
	);
}

function nodeWidth(n: {
	measured?: { width?: number };
	width?: number;
}): number {
	return n.measured?.width ?? n.width ?? PANEL_DEFAULT_WIDTH;
}

function nodeHeight(n: {
	measured?: { height?: number };
	height?: number;
}): number {
	return n.measured?.height ?? n.height ?? PANEL_DEFAULT_HEIGHT;
}

/** Topmost pane containing `flow`, excluding the source pane. */
function paneAt(
	rf: ReturnType<typeof useReactFlow>,
	flow: { x: number; y: number },
	sourceId: string,
): string | null {
	const nodes = rf.getNodes();
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i];
		if (n.id === sourceId) continue;
		const w = nodeWidth(n);
		const h = nodeHeight(n);
		if (
			flow.x >= n.position.x &&
			flow.x <= n.position.x + w &&
			flow.y >= n.position.y &&
			flow.y <= n.position.y + h
		) {
			return n.id;
		}
	}
	return null;
}

/** Catmull-Rom-ish smooth path through the projected points. */
function smoothPath(pts: { x: number; y: number }[]): string {
	if (pts.length === 0) return "";
	if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
	let d = `M ${pts[0].x} ${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		d += ` Q ${a.x} ${a.y} ${mx} ${my}`;
	}
	const last = pts[pts.length - 1];
	d += ` L ${last.x} ${last.y}`;
	return d;
}
