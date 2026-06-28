/** A 2D point in flow coordinates. */
export type Vec = { x: number; y: number };

/** Axis-aligned collider rectangle in flow coordinates. */
export type Rect = { x: number; y: number; w: number; h: number };

/** A Verlet point: current position + previous position (encodes velocity). */
export type Point = { x: number; y: number; px: number; py: number };

export type Rope = {
	points: Point[];
	/** Rest length between neighbouring points. */
	segmentLength: number;
};

export type StepOptions = {
	/** Downward acceleration added each tick (flow px / tick²). */
	gravity?: number;
	/** Velocity retention each tick (0..1). */
	damping?: number;
	/** Constraint relaxation passes per step. */
	iterations?: number;
	/** Collider rectangles the rope drapes over. */
	colliders?: Rect[];
	/** Pin position for the first point (the source anchor). */
	anchor: Vec;
	/** Pin position for the last point (the held plug). Omit/null = free end. */
	plug?: Vec | null;
	/** Push-out offset applied when resolving a collision. */
	skin?: number;
};

/** Build a rope by evenly distributing `segments + 1` points from start to end. */
export function createRope(start: Vec, end: Vec, segments: number): Rope {
	const points: Point[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		points.push({ x, y, px: x, py: y });
	}
	const segmentLength = Math.hypot(end.x - start.x, end.y - start.y) / segments;
	return { points, segmentLength };
}

/** Advance the rope one tick: integrate, then relax constraints + collisions. */
export function step(rope: Rope, opts: StepOptions): void {
	const gravity = opts.gravity ?? 0.6;
	const damping = opts.damping ?? 0.98;
	const iterations = opts.iterations ?? 16;
	const skin = opts.skin ?? 0.5;
	const pts = rope.points;
	const hasPlug = opts.plug != null;

	// Verlet integration.
	for (const p of pts) {
		const vx = (p.x - p.px) * damping;
		const vy = (p.y - p.py) * damping;
		p.px = p.x;
		p.py = p.y;
		p.x += vx;
		p.y += vy + gravity;
	}

	// Relax: pin endpoints, satisfy distance constraints, resolve collisions.
	for (let k = 0; k < iterations; k++) {
		pin(pts[0], opts.anchor);
		if (hasPlug && opts.plug) pin(pts[pts.length - 1], opts.plug);
		for (let i = 0; i < pts.length - 1; i++) {
			satisfy(pts[i], pts[i + 1], rope.segmentLength);
		}
		if (opts.colliders && opts.colliders.length > 0) {
			const last = pts.length - (hasPlug ? 1 : 0);
			for (let i = 1; i < last; i++) collide(pts[i], opts.colliders, skin);
		}
	}

	// Guarantee endpoints land exactly on their pins after the final relax pass.
	pin(pts[0], opts.anchor);
	if (hasPlug && opts.plug) pin(pts[pts.length - 1], opts.plug);
}

/** Hard-pin a point (also zeroes its velocity). */
function pin(p: Point, t: Vec): void {
	p.x = t.x;
	p.y = t.y;
	p.px = t.x;
	p.py = t.y;
}

/** Move two points so their distance returns toward `len`. */
function satisfy(a: Point, b: Point, len: number): void {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const d = Math.hypot(dx, dy) || 0.0001;
	const diff = ((d - len) / d) * 0.5;
	const ox = dx * diff;
	const oy = dy * diff;
	a.x += ox;
	a.y += oy;
	b.x -= ox;
	b.y -= oy;
}

/** If a point is inside any rect, push it to that rect's nearest edge. */
function collide(p: Point, rects: Rect[], skin: number): void {
	for (const r of rects) {
		const inside = p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
		if (!inside) continue;
		const left = p.x - r.x;
		const right = r.x + r.w - p.x;
		const top = p.y - r.y;
		const bottom = r.y + r.h - p.y;
		const min = Math.min(left, right, top, bottom);
		if (min === left) p.x = r.x - skin;
		else if (min === right) p.x = r.x + r.w + skin;
		else if (min === top) p.y = r.y - skin;
		else p.y = r.y + r.h + skin;
	}
}
