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

const SEGMENTS = 24;
// Grayish cable palette. The cable reads as a neutral wire; the only accent is
// a subtle brighten when it's hovering a valid drop target.
const CABLE_COLOR = "#9ca3af"; // gray-400
const CABLE_HOVER_COLOR = "#e5e7eb"; // gray-200
const PLUG_FILL = "#9ca3af";
const PLUG_HOVER_FILL = "#e5e7eb";

/** Renders the active connect cable as a physics rope over the canvas. Clicking
 * Connect spawns it in "following" mode: the plug tracks the cursor (no need to
 * grab the small head) until the user clicks a pane to plug in, or cancels with
 * Escape / the Connect toggle. The cable attaches to whichever edge of each pane
 * (top/right/bottom/left) faces the other end.
 *
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

	// While following the cursor, drive the plug from window-level pointer events
	// (so the user doesn't have to grab the small plug head). A click over a pane
	// plugs in; Escape cancels. Clicking empty space keeps following.
	useEffect(() => {
		if (!hasActive) return;

		const onMove = (e: PointerEvent) => {
			const store = useCableStore.getState();
			const a = store.active;
			if (!a?.dragging) return;
			const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
			store.updatePlug(flow, paneAt(rf, flow, a.sourcePaneId));
		};

		const onDown = (e: PointerEvent) => {
			const store = useCableStore.getState();
			const a = store.active;
			if (!a?.dragging) return;
			const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
			const target = paneAt(rf, flow, a.sourcePaneId);
			if (!target) return; // clicked empty space — keep following
			const node = rf.getNode(target);
			if (!node) return;
			// Snap to the target edge facing the source pane.
			const src = rf.getNode(a.sourcePaneId);
			const from = src ? rectCenter(rectOf(src)) : flow;
			store.plugInto(target, nearestEdgeMidpoint(rectOf(node), from));
			e.preventDefault();
			e.stopPropagation();
		};

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") useCableStore.getState().cancel();
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerdown", onDown, true);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerdown", onDown, true);
			window.removeEventListener("keydown", onKey);
		};
	}, [hasActive, rf]);

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

			const src = nodes.find((n) => n.id === active.sourcePaneId);
			const tgt = active.pluggedTargetId
				? nodes.find((n) => n.id === active.pluggedTargetId)
				: undefined;

			// Where the plug is pinned this frame (null = free/dangling):
			//  - plugged: recompute from the target pane's facing edge every frame,
			//    so the wire follows the target when it's dragged around;
			//  - following: the live cursor position;
			//  - otherwise: unpinned.
			let plug: Vec | null;
			if (active.pluggedTargetId) {
				const srcCenter = src ? rectCenter(rectOf(src)) : active.anchor;
				plug = tgt ? nearestEdgeMidpoint(rectOf(tgt), srcCenter) : active.plug;
			} else if (active.dragging) {
				plug = active.plug;
			} else {
				plug = null;
			}

			// Source anchor attaches to whichever source edge faces the plug — so
			// moving the source pane also moves its end of the wire.
			const plugPoint = plug ?? rope.points[rope.points.length - 1];
			const anchor: Vec = src
				? nearestEdgeMidpoint(rectOf(src), plugPoint)
				: active.anchor;

			// Colliders: every pane except the cable's own endpoint panes (source
			// and the plugged target), so the rope doesn't fight what it's tied to.
			const colliders: Rect[] = nodes
				.filter(
					(n) =>
						n.id !== active.sourcePaneId && n.id !== active.pluggedTargetId,
				)
				.map(rectOf);

			step(rope, { anchor, plug, colliders, gravity: 0.6 });

			// Project flow → screen and draw.
			const toScreen = (p: { x: number; y: number }) => ({
				x: p.x * vp.zoom + vp.x,
				y: p.y * vp.zoom + vp.y,
			});
			const pts = rope.points.map(toScreen);
			const hovering = active.hoveredTargetId !== null;
			const following = active.dragging && active.pluggedTargetId === null;

			if (pathRef.current) {
				const path = pathRef.current;
				path.setAttribute("d", smoothPath(pts));
				path.setAttribute("stroke", hovering ? CABLE_HOVER_COLOR : CABLE_COLOR);
				// Armed/following cable is dashed + lighter to read as "in progress";
				// a plugged or settled cable is solid.
				path.setAttribute("stroke-dasharray", following ? "2 9" : "0");
				path.setAttribute("opacity", following ? "0.8" : "0.95");
			}
			if (plugRef.current) {
				const tip = pts[pts.length - 1];
				plugRef.current.setAttribute(
					"transform",
					`translate(${tip.x}, ${tip.y})`,
				);
				plugRef.current.style.fill =
					hovering || active.pluggedTargetId !== null
						? PLUG_HOVER_FILL
						: PLUG_FILL;
			}
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [hasActive, rf]);

	if (!hasActive) return null;

	// Re-grab a settled/plugged cable to move its plug again (re-enters follow).
	const onPlugPointerDown = (e: React.PointerEvent) => {
		e.stopPropagation();
		e.preventDefault();
		useCableStore.getState().setDragging(true);
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
				stroke={CABLE_COLOR}
				strokeWidth={4}
				strokeLinecap="round"
				opacity={0.9}
			/>
			<g
				ref={plugRef}
				className="pointer-events-auto cursor-grab"
				onPointerDown={onPlugPointerDown}
			>
				{/* Larger invisible hit area for easy grabbing. */}
				<circle r={16} fill="transparent" />
				<circle
					r={7}
					fill={PLUG_FILL}
					stroke="rgba(0,0,0,0.45)"
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

/** Flow-coordinate rectangle for a React Flow node. */
function rectOf(n: {
	position: { x: number; y: number };
	measured?: { width?: number; height?: number };
	width?: number;
	height?: number;
}): Rect {
	return {
		x: n.position.x,
		y: n.position.y,
		w: nodeWidth(n),
		h: nodeHeight(n),
	};
}

function rectCenter(r: Rect): Vec {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Midpoint of the rectangle edge (top/right/bottom/left) that faces `toward`.
 * Compares the direction from the rect center against its half-extents so the
 * choice respects the pane's aspect ratio. */
function nearestEdgeMidpoint(r: Rect, toward: Vec): Vec {
	const cx = r.x + r.w / 2;
	const cy = r.y + r.h / 2;
	const dx = toward.x - cx;
	const dy = toward.y - cy;
	const ax = Math.abs(dx) / (r.w / 2 || 1);
	const ay = Math.abs(dy) / (r.h / 2 || 1);
	if (ax >= ay) {
		return dx >= 0 ? { x: r.x + r.w, y: cy } : { x: r.x, y: cy };
	}
	return dy >= 0 ? { x: cx, y: r.y + r.h } : { x: cx, y: r.y };
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
		const r = rectOf(n);
		if (
			flow.x >= r.x &&
			flow.x <= r.x + r.w &&
			flow.y >= r.y &&
			flow.y <= r.y + r.h
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
