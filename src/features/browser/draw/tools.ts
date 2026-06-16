/**
 * Pure drawing data model for the browser surface annotation layer.
 *
 * `DrawTool` enumerates the active tool; `DrawShape` is the immutable,
 * serialisable discriminated union persisted in the canvas state. Every helper
 * here is DOM-free so it unit-tests under jsdom and bundles cleanly into the
 * injected IIFE.
 */
export type DrawTool = "freehand" | "arrow" | "box" | "text" | "redact";

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

type BaseShape = { id: string; color: string; lineWidth: number };

export type FreehandShape = BaseShape & { kind: "freehand"; points: Point[] };
export type ArrowShape = BaseShape & { kind: "arrow"; from: Point; to: Point };
export type BoxShape = BaseShape & { kind: "box"; from: Point; to: Point };
export type TextShape = BaseShape & {
	kind: "text";
	origin: Point;
	text: string;
	fontSize: number;
};
export type RedactShape = { kind: "redact"; id: string; rect: Rect };

export type DrawShape =
	| FreehandShape
	| ArrowShape
	| BoxShape
	| TextShape
	| RedactShape;

// ── Geometry helpers ──────────────────────────────────────────────────────

/** Build an axis-aligned rect from two corner points (normalises deltas). */
export function boxFromPoints(from: Point, to: Point): Rect {
	return {
		x: Math.min(from.x, to.x),
		y: Math.min(from.y, to.y),
		w: Math.abs(to.x - from.x),
		h: Math.abs(to.y - from.y),
	};
}

/** The arrow head sits at the `to` point. */
export function arrowEndpoint(_from: Point, to: Point): Point {
	return to;
}

/** Bounding box of a shape (used for hit-testing and capture clipping). */
export function shapeBounds(shape: DrawShape): Rect {
	switch (shape.kind) {
		case "freehand": {
			if (shape.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
			let minX = Number.POSITIVE_INFINITY;
			let minY = Number.POSITIVE_INFINITY;
			let maxX = Number.NEGATIVE_INFINITY;
			let maxY = Number.NEGATIVE_INFINITY;
			for (const p of shape.points) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
		}
		case "arrow":
		case "box":
			return boxFromPoints(shape.from, shape.to);
		case "text":
			return {
				x: shape.origin.x,
				y: shape.origin.y - shape.fontSize,
				w: 80,
				h: shape.fontSize + 4,
			};
		case "redact":
			return shape.rect;
	}
}

function distPointToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.max(
		0,
		Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
	);
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitTestRect(rect: Rect, p: Point, pad: number): boolean {
	return (
		p.x >= rect.x - pad &&
		p.x <= rect.x + rect.w + pad &&
		p.y >= rect.y - pad &&
		p.y <= rect.y + rect.h + pad
	);
}

/** Whether point `p` is within `pad` px of the shape's drawn geometry. */
export function hitTestShape(shape: DrawShape, p: Point, pad: number): boolean {
	switch (shape.kind) {
		case "freehand": {
			for (let i = 1; i < shape.points.length; i++) {
				if (distPointToSegment(p, shape.points[i - 1], shape.points[i]) <= pad)
					return true;
			}
			return false;
		}
		case "arrow":
			return distPointToSegment(p, shape.from, shape.to) <= pad;
		case "box":
			return hitTestRect(boxFromPoints(shape.from, shape.to), p, pad);
		case "text":
			return hitTestRect(shapeBounds(shape), p, pad);
		case "redact":
			return hitTestRect(shape.rect, p, pad);
	}
}

/** Translate every point in a shape by `(dx, dy)`. Returns a new shape. */
export function translateShape(
	shape: DrawShape,
	dx: number,
	dy: number,
): DrawShape {
	const mv = (pt: Point): Point => ({ x: pt.x + dx, y: pt.y + dy });
	switch (shape.kind) {
		case "freehand":
			return { ...shape, points: shape.points.map(mv) };
		case "arrow":
			return { ...shape, from: mv(shape.from), to: mv(shape.to) };
		case "box":
			return { ...shape, from: mv(shape.from), to: mv(shape.to) };
		case "text":
			return { ...shape, origin: mv(shape.origin) };
		case "redact":
			return {
				...shape,
				rect: { ...shape.rect, x: shape.rect.x + dx, y: shape.rect.y + dy },
			};
	}
}
