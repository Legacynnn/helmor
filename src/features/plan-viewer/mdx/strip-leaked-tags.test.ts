import { describe, expect, it } from "vitest";
import { stripLeakedToolTags } from "./strip-leaked-tags";

// Build wrapper tags from parts so this source file never contains a literal
// leaked tool-call block itself.
const open = (name: string, attrs = "") => `<${name}${attrs}>`;
const close = (name: string) => `</${name}>`;

describe("stripLeakedToolTags", () => {
	it("removes trailing leaked Write-call wrapper tags", () => {
		const body = [
			"## Verification",
			"",
			"- Do the thing.",
			close("content"),
			close("invoke"),
		].join("\n");
		expect(stripLeakedToolTags(body)).toBe(
			["## Verification", "", "- Do the thing."].join("\n"),
		);
	});

	it("removes opening wrapper tags with attributes and namespaced variants", () => {
		const body = [
			open("function_calls"),
			open("invoke", ' name="Write"'),
			open("parameter", ' name="content"'),
			"# Plan",
			close("parameter"),
			close("invoke"),
			close("function_calls"),
		].join("\n");
		expect(stripLeakedToolTags(body)).toBe("# Plan");
	});

	it("strips namespaced (antml:) wrapper tags", () => {
		const body = [
			open("antml:invoke", ' name="x"'),
			"body",
			close("antml:invoke"),
		].join("\n");
		expect(stripLeakedToolTags(body)).toBe("body");
	});

	it("returns null for a clean plan (no allocation, byte-identical body kept)", () => {
		const body = ["# Title", "", "<PlanCanvas>", "</PlanCanvas>"].join("\n");
		expect(stripLeakedToolTags(body)).toBeNull();
	});

	it("never touches wrapper markup shown inside a fenced code block", () => {
		const body = [
			"Example of a tool call:",
			"```xml",
			open("invoke", ' name="Write"'),
			close("invoke"),
			"```",
			"Done.",
		].join("\n");
		expect(stripLeakedToolTags(body)).toBeNull();
	});

	it("leaves inline mentions in prose alone (whole-line only)", () => {
		const body = `A leaked ${close("invoke")} tag mid-sentence stays.`;
		expect(stripLeakedToolTags(body)).toBeNull();
	});

	it("does not match similarly-prefixed tags (word boundary)", () => {
		const body = [open("contention"), open("parameters"), "x"].join("\n");
		expect(stripLeakedToolTags(body)).toBeNull();
	});
});
