import { describe, expect, it } from "vitest";
import {
	buildPanelRows,
	customBindingConflicts,
	formatBinding,
	resolvePanelBindings,
} from "./panel-bindings";

const p = (id: string, binding?: number) => ({ id, binding });

describe("resolvePanelBindings", () => {
	it("auto-assigns 1..9 in order; 10th gets nothing", () => {
		const panels = Array.from({ length: 10 }, (_, i) => p(`n${i}`));
		const map = resolvePanelBindings(panels);
		for (let i = 0; i < 9; i++) expect(map.get(`n${i}`)).toBe(i + 1);
		expect(map.has("n9")).toBe(false);
	});

	it("lets a custom binding claim its digit; autos flex around it", () => {
		const map = resolvePanelBindings([p("n0", 3), p("n1"), p("n2"), p("n3")]);
		expect(map.get("n0")).toBe(3);
		expect(map.get("n1")).toBe(1);
		expect(map.get("n2")).toBe(2);
		expect(map.get("n3")).toBe(4);
	});

	it("compacts autos when a middle panel is removed", () => {
		const before = resolvePanelBindings([p("a"), p("b"), p("c")]);
		expect([before.get("a"), before.get("b"), before.get("c")]).toEqual([
			1, 2, 3,
		]);
		const after = resolvePanelBindings([p("a"), p("c")]);
		expect([after.get("a"), after.get("c")]).toEqual([1, 2]);
	});

	it("first panel wins a duplicate custom; the later duplicate falls to auto", () => {
		const map = resolvePanelBindings([p("a", 2), p("b", 2), p("c")]);
		expect(map.get("a")).toBe(2);
		expect(map.get("b")).toBe(1);
		expect(map.get("c")).toBe(3);
	});

	it("ignores out-of-range custom digits", () => {
		const map = resolvePanelBindings([p("a", 0), p("b", 42)]);
		expect(map.get("a")).toBe(1);
		expect(map.get("b")).toBe(2);
	});
});

describe("customBindingConflicts", () => {
	it("is true only against another panel's custom binding", () => {
		const panels = [p("a", 2), p("b")];
		expect(customBindingConflicts(panels, "b", 2)).toBe(true);
		expect(customBindingConflicts(panels, "b", 5)).toBe(false);
		expect(customBindingConflicts(panels, "a", 2)).toBe(false);
	});
});

describe("formatBinding", () => {
	it("formats a digit", () => {
		expect(formatBinding(1)).toBe("⌘1");
		expect(formatBinding(9)).toBe("⌘9");
	});
});

describe("buildPanelRows", () => {
	it("labels untitled panels '<Type> #n' and surfaces digits", () => {
		const rows = buildPanelRows([
			{ id: "a", title: "  ", typeLabel: "Terminal", binding: undefined },
			{ id: "b", title: "Notes A", typeLabel: "Notes", binding: 5 },
		]);
		expect(rows[0]).toMatchObject({
			label: "Terminal #1",
			effective: 1,
			custom: null,
		});
		expect(rows[1]).toMatchObject({
			label: "Notes A",
			effective: 5,
			custom: 5,
		});
	});
});
