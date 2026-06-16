import { describe, expect, it } from "vitest";
import { cssSelectorFor, resolveSelector } from "./selector";

describe("cssSelectorFor", () => {
	it("returns id selector when element has a unique id", () => {
		document.body.innerHTML = '<div id="hero"><span></span></div>';
		const el = document.getElementById("hero")!;
		expect(cssSelectorFor(el)).toBe("#hero");
	});

	it("round-trips back to the same element via resolveSelector", () => {
		document.body.innerHTML = "<ul><li></li><li class='x'></li><li></li></ul>";
		const el = document.querySelectorAll("li")[1]!;
		const sel = cssSelectorFor(el);
		expect(resolveSelector(document, sel)).toBe(el);
	});

	it("produces unique selectors for sibling elements", () => {
		document.body.innerHTML = "<div><p></p><p></p><p></p></div>";
		const ps = Array.from(document.querySelectorAll("p"));
		const selectors = ps.map((p) => cssSelectorFor(p));
		// All distinct
		expect(new Set(selectors).size).toBe(ps.length);
		// Each resolves back to its own element
		ps.forEach((p, i) => {
			expect(resolveSelector(document, selectors[i]!)).toBe(p);
		});
	});

	it("prefers a stable data attribute over a positional path", () => {
		document.body.innerHTML =
			'<div><button data-testid="submit-btn"></button></div>';
		const el = document.querySelector("button")!;
		expect(cssSelectorFor(el)).toBe('[data-testid="submit-btn"]');
	});

	it("anchors a positional path on a unique ancestor id", () => {
		document.body.innerHTML =
			'<section id="root"><div><span></span></div></section>';
		const el = document.querySelector("span")!;
		const sel = cssSelectorFor(el);
		expect(sel.startsWith("#root")).toBe(true);
		expect(resolveSelector(document, sel)).toBe(el);
	});
});

describe("resolveSelector", () => {
	it("finds an element by a stored selector", () => {
		document.body.innerHTML = '<section id="hero"></section>';
		const el = resolveSelector(document, "#hero");
		expect(el).not.toBeNull();
		expect(el!.tagName).toBe("SECTION");
	});

	it("returns null for a stale selector", () => {
		document.body.innerHTML = "<main></main>";
		expect(resolveSelector(document, "#vanished")).toBeNull();
	});

	it("returns null for an invalid selector instead of throwing", () => {
		document.body.innerHTML = "<main></main>";
		expect(resolveSelector(document, ">>>bad")).toBeNull();
	});
});
