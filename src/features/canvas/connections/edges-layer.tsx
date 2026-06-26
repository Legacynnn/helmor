import type { TLShapeId } from "tldraw";
import { useEditor, useValue } from "tldraw";
import { connectionMeta, useConnectionsStore } from "./connections-store";

type EdgeGeom = {
	id: string;
	primary: boolean;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

/** Compute the point on rect `a`'s border facing rect `b`'s center, so edges
 * meet panel borders instead of overlapping their bodies. */
function borderPoint(
	a: { x: number; y: number; w: number; h: number },
	target: { cx: number; cy: number },
) {
	const cx = a.x + a.w / 2;
	const cy = a.y + a.h / 2;
	const dx = target.cx - cx;
	const dy = target.cy - cy;
	if (dx === 0 && dy === 0) return { x: cx, y: cy };
	const halfW = a.w / 2;
	const halfH = a.h / 2;
	const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
	return { x: cx + dx * scale, y: cy + dy * scale };
}

/** SVG layer drawing connection edges between panels. Rendered in tldraw's
 * page-space `OnTheCanvas` slot so edges pan/zoom with the surface and sit
 * behind the panels. Geometry is recomputed reactively as panels move. */
export function CanvasEdgesLayer() {
	const editor = useEditor();
	const connections = useConnectionsStore((s) => s.connections);

	const edges = useValue<EdgeGeom[]>("canvas-edges", () => {
		const out: EdgeGeom[] = [];
		for (const conn of connections) {
			const from = editor.getShapePageBounds(conn.fromPanelId as TLShapeId);
			const to = editor.getShapePageBounds(conn.toPanelId as TLShapeId);
			if (!from || !to) continue;
			const fromRect = { x: from.x, y: from.y, w: from.w, h: from.h };
			const toRect = { x: to.x, y: to.y, w: to.w, h: to.h };
			const p1 = borderPoint(fromRect, {
				cx: toRect.x + toRect.w / 2,
				cy: toRect.y + toRect.h / 2,
			});
			const p2 = borderPoint(toRect, {
				cx: fromRect.x + fromRect.w / 2,
				cy: fromRect.y + fromRect.h / 2,
			});
			out.push({
				id: conn.id,
				primary: connectionMeta(conn).primary === true,
				x1: p1.x,
				y1: p1.y,
				x2: p2.x,
				y2: p2.y,
			});
		}
		return out;
	}, [connections, editor]);

	if (edges.length === 0) return null;

	return (
		<svg
			aria-hidden
			style={{
				position: "absolute",
				inset: 0,
				width: 1,
				height: 1,
				overflow: "visible",
				pointerEvents: "none",
			}}
		>
			<defs>
				<marker
					id="canvas-edge-arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-3, #888)" />
				</marker>
			</defs>
			{edges.map((e) => (
				<line
					key={e.id}
					x1={e.x1}
					y1={e.y1}
					x2={e.x2}
					y2={e.y2}
					stroke={
						e.primary
							? "var(--color-selected, #3b82f6)"
							: "var(--color-text-3, #888)"
					}
					strokeWidth={e.primary ? 2.5 : 1.75}
					strokeDasharray={e.primary ? undefined : "6 4"}
					markerEnd="url(#canvas-edge-arrow)"
				/>
			))}
		</svg>
	);
}
