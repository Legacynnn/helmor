import {
	cleanup,
	createEvent,
	fireEvent,
	renderHook,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDropEdge, useCanvasTabDnd } from "./canvas-dnd";

const rect = { left: 0, top: 0, width: 100, height: 100 };

describe("resolveDropEdge", () => {
	it("picks the nearest edge to the pointer", () => {
		expect(resolveDropEdge(rect, 5, 50)).toBe("left");
		expect(resolveDropEdge(rect, 95, 50)).toBe("right");
		expect(resolveDropEdge(rect, 50, 5)).toBe("top");
		expect(resolveDropEdge(rect, 50, 95)).toBe("bottom");
	});

	it("resolves corners by the closest side", () => {
		// top-left corner, marginally closer to the top edge
		expect(resolveDropEdge({ ...rect }, 10, 8)).toBe("top");
		// near the left edge but vertically centred
		expect(resolveDropEdge({ ...rect }, 8, 40)).toBe("left");
	});

	it("accounts for the rect offset", () => {
		const offset = { left: 200, top: 100, width: 100, height: 100 };
		expect(resolveDropEdge(offset, 205, 150)).toBe("left");
		expect(resolveDropEdge(offset, 295, 150)).toBe("right");
		expect(resolveDropEdge(offset, 250, 105)).toBe("top");
	});
});

describe("useCanvasTabDnd — click vs drag", () => {
	afterEach(() => {
		cleanup();
		document.body.innerHTML = "";
	});

	function mountTab() {
		const tab = document.createElement("button");
		tab.setAttribute("data-canvas-drag-session", "s1");
		document.body.appendChild(tab);
		return tab;
	}

	it("suppresses the native mousedown selection on a drag-source tab", () => {
		const tab = mountTab();
		renderHook(() => useCanvasTabDnd({ enabled: true, onDrop: vi.fn() }));
		const mousedown = createEvent.mouseDown(tab, { button: 0 });
		fireEvent(tab, mousedown);
		expect(mousedown.defaultPrevented).toBe(true);
	});

	it("does NOT suppress mousedown on an inner action control (close/rename)", () => {
		const tab = mountTab();
		const action = document.createElement("span");
		action.setAttribute("role", "button");
		tab.appendChild(action);
		renderHook(() => useCanvasTabDnd({ enabled: true, onDrop: vi.fn() }));
		const mousedown = createEvent.mouseDown(action, { button: 0 });
		fireEvent(action, mousedown);
		expect(mousedown.defaultPrevented).toBe(false);
	});

	// jsdom's PointerEvent drops clientX/clientY; dispatch coordinate-bearing
	// MouseEvents typed as pointer events so the threshold math is exercised.
	function pointer(type: string, x: number, y: number): MouseEvent {
		return new MouseEvent(type, {
			clientX: x,
			clientY: y,
			button: 0,
			bubbles: true,
			cancelable: true,
		});
	}

	it("activates the session on a click (press + release, no movement)", () => {
		const tab = mountTab();
		const onActivateSession = vi.fn();
		renderHook(() =>
			useCanvasTabDnd({ enabled: true, onDrop: vi.fn(), onActivateSession }),
		);
		tab.dispatchEvent(pointer("pointerdown", 10, 10));
		tab.dispatchEvent(pointer("pointerup", 10, 10));
		expect(onActivateSession).toHaveBeenCalledWith("s1");
	});

	it("does NOT activate the session when the press becomes a drag", () => {
		const tab = mountTab();
		const onActivateSession = vi.fn();
		renderHook(() =>
			useCanvasTabDnd({ enabled: true, onDrop: vi.fn(), onActivateSession }),
		);
		tab.dispatchEvent(pointer("pointerdown", 10, 10));
		// Move well past the activation threshold → becomes a drag.
		document.body.dispatchEvent(pointer("pointermove", 60, 60));
		document.body.dispatchEvent(pointer("pointerup", 60, 60));
		expect(onActivateSession).not.toHaveBeenCalled();
	});

	it("ignores tabs entirely when disabled", () => {
		const tab = mountTab();
		const onActivateSession = vi.fn();
		renderHook(() =>
			useCanvasTabDnd({ enabled: false, onDrop: vi.fn(), onActivateSession }),
		);
		const mousedown = createEvent.mouseDown(tab, { button: 0 });
		fireEvent(tab, mousedown);
		expect(mousedown.defaultPrevented).toBe(false);
		tab.dispatchEvent(pointer("pointerdown", 10, 10));
		tab.dispatchEvent(pointer("pointerup", 10, 10));
		expect(onActivateSession).not.toHaveBeenCalled();
	});
});
