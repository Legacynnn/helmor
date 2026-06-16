/**
 * Canvas overlay state machine + DOM lifecycle for the annotation layer.
 *
 * The state transitions (`applyPointerDown/Move/Up`, `undoLast`, `clearAll`) are
 * PURE and jsdom-testable. The DOM helpers (`inject*`, `remove*`, `renderShapes`,
 * `drawShape`) touch a real `<canvas>` and run only inside the content webview.
 *
 * TWO-CANVAS CONTRACT (see plan Risk #1):
 *   - `#__helmor_draw_redact__` — destructive PIXEL layer. `redactRegionOnCanvas`
 *     writes blurred pixels here; it is NEVER `clearRect`-ed, so the blur cannot
 *     be undone (redact is irreversible in the overlay).
 *   - `#__helmor_draw_vector__` — VECTOR layer (freehand/arrow/box/text), cleared
 *     and fully re-rendered every frame from `state.shapes`.
 * `undoLast` only drops a shape record (destroyed redact pixels remain blurred).
 * `clearAll` resets the state; the bridge removes + re-injects BOTH canvases so
 * the destructive redact layer is wiped too.
 */
import {
	boxFromPoints,
	type DrawShape,
	type DrawTool,
	type FreehandShape,
	type Point,
} from "./tools";

export type CanvasState = {
	activeTool: DrawTool;
	shapes: DrawShape[];
	inProgress: DrawShape | null;
	color: string;
	lineWidth: number;
	nextId: number;
};

export function initialCanvasState(tool: DrawTool): CanvasState {
	return {
		activeTool: tool,
		shapes: [],
		inProgress: null,
		color: "#e53e3e",
		lineWidth: 3,
		nextId: 1,
	};
}

function mkId(s: CanvasState): string {
	return `draw-${s.nextId}`;
}

export function setTool(s: CanvasState, tool: DrawTool): CanvasState {
	return { ...s, activeTool: tool, inProgress: null };
}

export function setColor(s: CanvasState, color: string): CanvasState {
	return { ...s, color };
}

export function setLineWidth(s: CanvasState, lineWidth: number): CanvasState {
	return { ...s, lineWidth };
}

export function applyPointerDown(s: CanvasState, p: Point): CanvasState {
	const id = mkId(s);
	const base = { id, color: s.color, lineWidth: s.lineWidth };
	let inProgress: DrawShape;
	switch (s.activeTool) {
		case "freehand":
			inProgress = {
				kind: "freehand",
				...base,
				points: [p],
			} satisfies FreehandShape;
			break;
		case "arrow":
			inProgress = { kind: "arrow", ...base, from: p, to: p };
			break;
		case "box":
			inProgress = { kind: "box", ...base, from: p, to: p };
			break;
		case "text":
			inProgress = { kind: "text", ...base, origin: p, text: "", fontSize: 14 };
			break;
		case "redact":
			inProgress = { kind: "redact", id, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
			break;
	}
	return { ...s, inProgress, nextId: s.nextId + 1 };
}

export function applyPointerMove(s: CanvasState, p: Point): CanvasState {
	if (!s.inProgress) return s;
	const ip = s.inProgress;
	let updated: DrawShape;
	switch (ip.kind) {
		case "freehand":
			updated = { ...ip, points: [...ip.points, p] };
			break;
		case "arrow":
			updated = { ...ip, to: p };
			break;
		case "box":
			updated = { ...ip, to: p };
			break;
		case "redact": {
			const { x, y } = ip.rect;
			updated = { ...ip, rect: { x, y, w: p.x - x, h: p.y - y } };
			break;
		}
		default:
			return s;
	}
	return { ...s, inProgress: updated };
}

export function applyPointerUp(s: CanvasState, p: Point): CanvasState {
	const withMove = applyPointerMove(s, p);
	if (!withMove.inProgress) return withMove;
	return {
		...withMove,
		shapes: [...withMove.shapes, withMove.inProgress],
		inProgress: null,
	};
}

export function undoLast(s: CanvasState): CanvasState {
	return { ...s, shapes: s.shapes.slice(0, -1) };
}

export function clearAll(s: CanvasState): CanvasState {
	return { ...s, shapes: [], inProgress: null };
}

// ── Canvas DOM helpers (not testable in jsdom — call from bridge only) ────

export const REDACT_CANVAS_ID = "__helmor_draw_redact__";
export const VECTOR_CANVAS_ID = "__helmor_draw_vector__";

function injectLayer(
	target: Document,
	id: string,
	zIndex: number,
	pointerEvents: "auto" | "none",
): HTMLCanvasElement {
	const canvas = target.createElement("canvas");
	canvas.id = id;
	canvas.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:${pointerEvents};z-index:${zIndex};`;
	canvas.width = target.documentElement.clientWidth;
	canvas.height = target.documentElement.clientHeight;
	target.body.appendChild(canvas);
	return canvas;
}

/** Inject both overlay layers. Returns `{ redact, vector }` handles. */
export function injectCanvasOverlay(target: Document): {
	redact: HTMLCanvasElement;
	vector: HTMLCanvasElement;
} {
	removeCanvasOverlay(target);
	// Redact pixel layer sits below the vector layer; the vector layer captures
	// pointer events so drawing reaches the state machine.
	const redact = injectLayer(target, REDACT_CANVAS_ID, 2147483645, "none");
	const vector = injectLayer(target, VECTOR_CANVAS_ID, 2147483646, "auto");
	return { redact, vector };
}

export function removeCanvasOverlay(target: Document): void {
	target.getElementById(REDACT_CANVAS_ID)?.remove();
	target.getElementById(VECTOR_CANVAS_ID)?.remove();
}

/** Draw a single vector shape (redact shapes are skipped — pixel layer owns them). */
export function drawShape(
	ctx: CanvasRenderingContext2D,
	shape: DrawShape,
): void {
	if (shape.kind === "redact") return;
	ctx.strokeStyle = shape.color;
	ctx.fillStyle = shape.color;
	ctx.lineWidth = shape.lineWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	switch (shape.kind) {
		case "freehand": {
			ctx.beginPath();
			shape.points.forEach((p, i) => {
				if (i === 0) ctx.moveTo(p.x, p.y);
				else ctx.lineTo(p.x, p.y);
			});
			ctx.stroke();
			break;
		}
		case "box": {
			const r = boxFromPoints(shape.from, shape.to);
			ctx.strokeRect(r.x, r.y, r.w, r.h);
			break;
		}
		case "arrow": {
			const { from, to } = shape;
			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
			ctx.stroke();
			const angle = Math.atan2(to.y - from.y, to.x - from.x);
			const head = 10 + shape.lineWidth * 2;
			ctx.beginPath();
			ctx.moveTo(to.x, to.y);
			ctx.lineTo(
				to.x - head * Math.cos(angle - Math.PI / 6),
				to.y - head * Math.sin(angle - Math.PI / 6),
			);
			ctx.lineTo(
				to.x - head * Math.cos(angle + Math.PI / 6),
				to.y - head * Math.sin(angle + Math.PI / 6),
			);
			ctx.closePath();
			ctx.fill();
			break;
		}
		case "text": {
			ctx.font = `${shape.fontSize}px sans-serif`;
			ctx.fillText(shape.text, shape.origin.x, shape.origin.y);
			break;
		}
	}
}

/** Clear + fully re-render the vector layer from current state. */
export function renderShapes(
	canvas: HTMLCanvasElement,
	state: CanvasState,
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const all = state.inProgress
		? [...state.shapes, state.inProgress]
		: state.shapes;
	for (const shape of all) drawShape(ctx, shape);
}
