// Pure geometry for drag-to-create panel placement. Kept framework-free so the
// math is unit-testable without React Flow / DOM.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Axis-aligned rectangle spanning two points, regardless of drag direction
 * (the user may drag up-left as readily as down-right). The create overlay then
 * rejects rects below the panel minimum, so the panel is exactly this box. */
export function normalizeRect(a: Point, b: Point): Rect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(a.x - b.x),
		height: Math.abs(a.y - b.y),
	};
}
