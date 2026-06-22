import { describe, expect, it } from "vitest";
import { parseWireframe } from "./parse-wireframe";

describe("parseWireframe", () => {
	it("nests children by indentation", () => {
		const src = [
			"col",
			"  text Welcome",
			"  input Email",
			"  button Sign in",
		].join("\n");
		const roots = parseWireframe(src);
		expect(roots).toHaveLength(1);
		expect(roots[0].type).toBe("col");
		expect(roots[0].children.map((c) => c.type)).toEqual([
			"text",
			"input",
			"button",
		]);
		expect(roots[0].children[0].label).toBe("Welcome");
	});

	it("parses a type with no label", () => {
		const roots = parseWireframe("divider");
		expect(roots[0]).toMatchObject({ type: "divider", label: "" });
	});

	it("skips blank lines and unknown element types", () => {
		const src = ["box Header", "", "frobnicate nope", "  text Inside"].join(
			"\n",
		);
		const roots = parseWireframe(src);
		expect(roots).toHaveLength(1);
		expect(roots[0].type).toBe("box");
		expect(roots[0].children.map((c) => c.type)).toEqual(["text"]);
	});

	it("returns an empty array for empty input", () => {
		expect(parseWireframe("   \n  ")).toEqual([]);
	});

	it("recognizes heading, field, and pill element types", () => {
		const roots = parseWireframe(
			["heading Title", "field Name", "pill Tag"].join("\n"),
		);
		expect(roots.map((r) => r.type)).toEqual(["heading", "field", "pill"]);
	});

	it("treats a leading tab as the same depth as a two-space indent", () => {
		const src = ["col", "\ttext Tabbed", "  input Spaced"].join("\n");
		const roots = parseWireframe(src);
		expect(roots).toHaveLength(1);
		expect(roots[0].children.map((c) => c.type)).toEqual(["text", "input"]);
	});

	it("promotes orphaned children of a top-level unknown line to roots", () => {
		const src = ["frobnicate nope", "  text Inside"].join("\n");
		const roots = parseWireframe(src);
		expect(roots.map((r) => r.type)).toEqual(["text"]);
	});
});
