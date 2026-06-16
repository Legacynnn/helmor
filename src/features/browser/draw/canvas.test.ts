import { describe, expect, it } from "vitest";
import {
	applyPointerDown,
	applyPointerMove,
	applyPointerUp,
	clearAll,
	initialCanvasState,
	setColor,
	setTool,
	undoLast,
} from "./canvas";

const pt = (x: number, y: number) => ({ x, y });

describe("canvas state machine", () => {
	it("freehand: pointer down starts an in-progress shape", () => {
		const s0 = initialCanvasState("freehand");
		const s1 = applyPointerDown(s0, pt(10, 20));
		expect(s1.inProgress).not.toBeNull();
		expect(s1.inProgress?.kind).toBe("freehand");
	});

	it("freehand: pointer move extends the path", () => {
		const s0 = initialCanvasState("freehand");
		const s1 = applyPointerDown(s0, pt(0, 0));
		const s2 = applyPointerMove(s1, pt(5, 5));
		const s3 = applyPointerMove(s2, pt(10, 10));
		expect(
			s3.inProgress?.kind === "freehand" && s3.inProgress.points,
		).toHaveLength(3);
	});

	it("freehand: pointer up commits to shapes", () => {
		let s = initialCanvasState("freehand");
		s = applyPointerDown(s, pt(0, 0));
		s = applyPointerMove(s, pt(10, 0));
		s = applyPointerUp(s, pt(20, 0));
		expect(s.shapes).toHaveLength(1);
		expect(s.inProgress).toBeNull();
	});

	it("box: pointer up commits a box shape", () => {
		let s = initialCanvasState("box");
		s = applyPointerDown(s, pt(10, 10));
		s = applyPointerUp(s, pt(50, 50));
		expect(s.shapes[0]?.kind).toBe("box");
	});

	it("redact: pointer up commits a redact shape with normalised-ready rect", () => {
		let s = initialCanvasState("redact");
		s = applyPointerDown(s, pt(10, 10));
		s = applyPointerUp(s, pt(50, 60));
		const shape = s.shapes[0];
		expect(shape?.kind).toBe("redact");
		expect(shape?.kind === "redact" && shape.rect).toEqual({
			x: 10,
			y: 10,
			w: 40,
			h: 50,
		});
	});

	it("undoLast removes the last committed shape", () => {
		let s = initialCanvasState("freehand");
		s = applyPointerDown(s, pt(0, 0));
		s = applyPointerUp(s, pt(10, 0));
		expect(s.shapes).toHaveLength(1);
		s = undoLast(s);
		expect(s.shapes).toHaveLength(0);
	});

	it("clearAll resets shapes and inProgress", () => {
		let s = initialCanvasState("box");
		s = applyPointerDown(s, pt(0, 0));
		s = applyPointerUp(s, pt(20, 20));
		s = clearAll(s);
		expect(s.shapes).toHaveLength(0);
		expect(s.inProgress).toBeNull();
	});

	it("arrow: pointer up commits an arrow shape", () => {
		let s = initialCanvasState("arrow");
		s = applyPointerDown(s, pt(0, 0));
		s = applyPointerUp(s, pt(30, 30));
		expect(s.shapes[0]?.kind).toBe("arrow");
	});

	it("setTool switches the active tool and clears in-progress", () => {
		let s = initialCanvasState("freehand");
		s = applyPointerDown(s, pt(0, 0));
		s = setTool(s, "box");
		expect(s.activeTool).toBe("box");
		expect(s.inProgress).toBeNull();
	});

	it("setColor updates the color used for new shapes", () => {
		let s = setColor(initialCanvasState("box"), "#00ff00");
		s = applyPointerDown(s, pt(0, 0));
		s = applyPointerUp(s, pt(10, 10));
		expect(s.shapes[0]?.kind === "box" && s.shapes[0].color).toBe("#00ff00");
	});

	it("applyPointerMove is a no-op when nothing is in progress", () => {
		const s = initialCanvasState("box");
		expect(applyPointerMove(s, pt(5, 5))).toBe(s);
	});
});
