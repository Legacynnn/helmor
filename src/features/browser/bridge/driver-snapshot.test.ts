import { describe, expect, it } from "vitest";
import { buildInteractiveElements } from "./driver-snapshot";

describe("buildInteractiveElements", () => {
	it("collects role + accessible name + selector for buttons and links", () => {
		document.body.innerHTML = `
      <button data-testid="save">Save</button>
      <a href="/x" aria-label="Open X">link</a>`;
		const els = buildInteractiveElements(document);
		expect(els).toEqual([
			{ role: "button", name: "Save", selector: '[data-testid="save"]' },
			{ role: "link", name: "Open X", selector: 'a[href="/x"]' },
		]);
	});
});
