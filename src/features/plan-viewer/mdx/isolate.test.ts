import { describe, expect, it } from "vitest";
import {
	isolateMalformedComponents,
	MALFORMED_SENTINEL,
	scanTopLevelComponents,
} from "./isolate";

describe("scanTopLevelComponents", () => {
	it("locates block and self-closing top-level components", () => {
		const body = [
			"## Heading",
			"",
			"<Steps>",
			"1. One",
			"</Steps>",
			"",
			'<AnnotatedCode code="x" />',
		].join("\n");
		const spans = scanTopLevelComponents(body);
		expect(spans.map((s) => s.tag)).toEqual(["Steps", "AnnotatedCode"]);
		// The self-closing span covers exactly its single line.
		const ac = spans[1];
		expect(body.slice(ac.start, ac.end)).toBe('<AnnotatedCode code="x" />');
	});

	it("ignores indented (nested) tags and unclosed blocks", () => {
		const body = [
			"<MultiPrototype>",
			"  <Variant>",
			"  body",
			"</MultiPrototype>",
		].join("\n");
		const spans = scanTopLevelComponents(body);
		// Only the column-0 MultiPrototype is top-level; the indented Variant is not.
		expect(spans.map((s) => s.tag)).toEqual(["MultiPrototype"]);
	});
});

describe("isolateMalformedComponents", () => {
	it("replaces only the spans that fail to parse", () => {
		const body = ["<Good />", "<Bad />", "<AlsoGood />"].join("\n");
		const out = isolateMalformedComponents(body, (s) => !s.includes("Bad"));
		expect(out).not.toBeNull();
		expect(out).toContain("<Good />");
		expect(out).toContain("<AlsoGood />");
		expect(out).toContain(`<${MALFORMED_SENTINEL} name="Bad" />`);
		expect(out).not.toContain("<Bad />");
	});

	it("returns null when every component parses (nothing to isolate)", () => {
		const body = ["<Good />", "<AlsoGood />"].join("\n");
		expect(isolateMalformedComponents(body, () => true)).toBeNull();
	});
});
