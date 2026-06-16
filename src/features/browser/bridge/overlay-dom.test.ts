import { afterEach, describe, expect, it } from "vitest";
import { createHoverOverlay } from "./overlay-dom";

afterEach(() => {
	for (const node of document.documentElement.querySelectorAll(
		"[data-helmor-overlay]",
	)) {
		node.remove();
	}
	document.body.innerHTML = "";
});

describe("createHoverOverlay", () => {
	it("appends an outline and a label node to the document element", () => {
		const overlay = createHoverOverlay(document);
		expect(overlay.outline.getAttribute("data-helmor-overlay")).toBe("outline");
		expect(overlay.label.getAttribute("data-helmor-overlay")).toBe("label");
		expect(overlay.outline.isConnected).toBe(true);
		expect(overlay.label.isConnected).toBe(true);
		overlay.destroy();
	});

	it("is hidden until show() is called", () => {
		const overlay = createHoverOverlay(document);
		expect(overlay.outline.style.display).toBe("none");
		expect(overlay.label.style.display).toBe("none");
		overlay.destroy();
	});

	it("positions the outline over the target element rect and writes the dimension label", () => {
		document.body.innerHTML = '<div id="t"></div>';
		const el = document.getElementById("t")!;
		// jsdom returns a zero rect by default; stub a concrete one.
		el.getBoundingClientRect = () =>
			({
				x: 10,
				y: 20,
				width: 120,
				height: 48,
				top: 20,
				left: 10,
				right: 130,
				bottom: 68,
				toJSON: () => ({}),
			}) as DOMRect;

		const overlay = createHoverOverlay(document);
		overlay.show(el);

		expect(overlay.outline.style.display).toBe("block");
		expect(overlay.outline.style.left).toBe("10px");
		expect(overlay.outline.style.top).toBe("20px");
		expect(overlay.outline.style.width).toBe("120px");
		expect(overlay.outline.style.height).toBe("48px");
		expect(overlay.label.textContent).toBe("120 × 48");
		overlay.destroy();
	});

	it("hide() collapses both nodes without removing them", () => {
		document.body.innerHTML = '<div id="t"></div>';
		const overlay = createHoverOverlay(document);
		overlay.show(document.getElementById("t")!);
		overlay.hide();
		expect(overlay.outline.style.display).toBe("none");
		expect(overlay.label.style.display).toBe("none");
		expect(overlay.outline.isConnected).toBe(true);
		overlay.destroy();
	});

	it("destroy() removes both nodes from the DOM", () => {
		const overlay = createHoverOverlay(document);
		overlay.destroy();
		expect(overlay.outline.isConnected).toBe(false);
		expect(overlay.label.isConnected).toBe(false);
	});
});
