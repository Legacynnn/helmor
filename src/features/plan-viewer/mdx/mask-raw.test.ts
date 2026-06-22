import { describe, expect, it } from "vitest";
import { maskRawComponentBodies } from "./mask-raw";

describe("maskRawComponentBodies", () => {
	it("lifts a raw component body into the stash and self-closes the tag", () => {
		const body = [
			"<Preview>",
			"function App() {",
			"  return <button onClick={() => {}}>hi</button>",
			"}",
			"</Preview>",
		].join("\n");
		const { body: masked, stash } = maskRawComponentBodies(body);
		// The element is now self-closing with a rawid, so MDX never sees the JS.
		expect(masked).toMatch(/^<Preview __rawid="r0" \/>$/);
		const stashed = stash.get("r0");
		expect(stashed).toContain("function App()");
		expect(stashed).toContain("onClick={() => {}}");
	});

	it("preserves the open tag's attributes when masking", () => {
		const { body: masked } = maskRawComponentBodies(
			['<Wireframe label="X" surface="app">', "row", "</Wireframe>"].join("\n"),
		);
		expect(masked).toBe('<Wireframe label="X" surface="app" __rawid="r0" />');
	});

	it("leaves self-closing raw components untouched", () => {
		const body = '<AnnotatedCode code="x" lang="ts" />';
		expect(maskRawComponentBodies(body).body).toBe(body);
	});

	it("does not mask component markup shown inside a fenced code block", () => {
		const body = [
			"```mdx",
			"<Preview>",
			"function App() {}",
			"</Preview>",
			"```",
		].join("\n");
		const { body: masked, stash } = maskRawComponentBodies(body);
		expect(masked).toBe(body);
		expect(stash.size).toBe(0);
	});

	it("leaves non-raw components (blocks/structured) alone", () => {
		const body = ["<Decision>", "<Option>x</Option>", "</Decision>"].join("\n");
		expect(maskRawComponentBodies(body).body).toBe(body);
	});
});
