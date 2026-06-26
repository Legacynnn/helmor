import { describe, expect, it } from "vitest";
import { parsePlanMdx } from "./parse";

describe("parsePlanMdx", () => {
	it("does not throw on an unparseable MDX expression and still renders content", () => {
		// A stray `{` that isn't valid JS makes remark-mdx/acorn throw
		// ("Could not parse expression with acorn"). The parser must degrade to
		// plain Markdown instead of crashing the plan surface.
		const src = [
			"---",
			'title: "Broken"',
			"status: draft",
			"---",
			"",
			"# Heading",
			"",
			"Some prose with an invalid {1 2 3} expression.",
		].join("\n");

		expect(() => parsePlanMdx(src)).not.toThrow();
		const { frontmatter, blocks } = parsePlanMdx(src);
		expect(frontmatter.title).toBe("Broken");
		// The body content survived (rendered as prose blocks). The stray brace
		// is escaped to an entity in the source but the surrounding text is intact.
		const text = blocks
			.map((b) => (b.kind === "prose" ? b.markdown : ""))
			.join("\n");
		expect(text).toContain("Heading");
		expect(text).toContain("1 2 3");
	});

	it("still recognises components when prose has an unparseable brace", () => {
		// The stray `{` would crash strict MDX; the brace-escape retry must keep
		// the RiskCard component intact (not degrade the whole doc to plain text).
		const src = [
			"---",
			'title: "Recovered"',
			"status: draft",
			"---",
			"",
			"Intro with a stray { brace.",
			"",
			'<RiskCard severity="high">',
			"A real risk.",
			"</RiskCard>",
		].join("\n");

		const { blocks } = parsePlanMdx(src);
		const risk = blocks.find(
			(b) => b.kind === "component" && b.name === "RiskCard",
		);
		expect(risk).toBeDefined();
	});

	it("isolates a single malformed component instead of blanking the plan", () => {
		// The AnnotatedCode attribute uses invalid `\"` escapes (JSX has no
		// backslash escaping), which makes strict MDX throw for the whole doc.
		// The parser must isolate ONLY that block and keep the others rendering.
		const src = [
			"---",
			'title: "Iso"',
			"status: draft",
			"---",
			"",
			"## Section",
			"",
			"<Steps>",
			"1. First",
			"2. Second",
			"</Steps>",
			"",
			'<AnnotatedCode code="<Foo bar=\\"x\\">" lang="mdx" note="n" />',
			"",
			'<RiskCard severity="low">',
			"Watch out.",
			"</RiskCard>",
		].join("\n");

		expect(() => parsePlanMdx(src)).not.toThrow();
		const { blocks } = parsePlanMdx(src);
		const names = blocks
			.filter((b) => b.kind === "component")
			.map((b) => (b.kind === "component" ? b.name : ""));
		// Good components on BOTH sides of the malformed one still render…
		expect(names).toContain("Steps");
		expect(names).toContain("RiskCard");
		// …and the broken one is contained as the sentinel error block.
		expect(names).toContain("HelmorMalformedBlock");
	});

	it("parses frontmatter title and status", () => {
		const src = `---
title: My Plan
status: "draft"
summary: A short summary
---

Body text.`;
		const parsed = parsePlanMdx(src);
		expect(parsed.frontmatter.title).toBe("My Plan");
		expect(parsed.frontmatter.status).toBe("draft");
		expect(parsed.frontmatter.summary).toBe("A short summary");
	});

	it("captures a prose block", () => {
		const parsed = parsePlanMdx("Hello **world**.");
		const prose = parsed.blocks.find((b) => b.kind === "prose");
		expect(prose).toBeDefined();
		expect(prose?.kind === "prose" && prose.markdown).toContain(
			"Hello **world**.",
		);
		expect(parsed.blocks[0]?.id).toBe("b0");
	});

	it("parses a known component block with props and raw text", () => {
		const src = `<RiskCard severity="high">
This is **risky** stuff.
</RiskCard>`;
		const parsed = parsePlanMdx(src);
		const comp = parsed.blocks.find((b) => b.kind === "component");
		expect(comp).toBeDefined();
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("RiskCard");
		expect(comp.props.severity).toBe("high");
		expect(comp.rawText).toContain("This is **risky** stuff.");
	});

	it("recursively parses children of a blocks-mode component", () => {
		const src = `<RiskCard severity="high">
Some **prose** inside.

<RiskCard severity="low">Nested note.</RiskCard>
</RiskCard>`;
		const parsed = parsePlanMdx(src);
		const comp = parsed.blocks[0];
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("RiskCard");
		// Inner prose + nested RiskCard captured as recursively-parsed blocks.
		expect(comp.childBlocks.length).toBe(2);
		expect(comp.childBlocks[0]?.kind).toBe("prose");
		const nested = comp.childBlocks[1];
		if (nested?.kind !== "component")
			throw new Error("expected nested component");
		expect(nested.name).toBe("RiskCard");
		expect(nested.props.severity).toBe("low");
		expect(nested.rawText).toContain("Nested note.");
	});

	it("does not recurse into a raw-mode component (Diagram keeps mermaid as rawText)", () => {
		const src = `<Diagram>
graph TD; A-->B;
</Diagram>`;
		const parsed = parsePlanMdx(src);
		const comp = parsed.blocks[0];
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("Diagram");
		expect(comp.rawText).toContain("graph TD; A-->B;");
		expect(comp.childBlocks).toEqual([]);
	});

	it("parses an unknown component as a component block (no recursion)", () => {
		const parsed = parsePlanMdx('<Unknowny foo="bar" />');
		const comp = parsed.blocks.find((b) => b.kind === "component");
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("Unknowny");
		expect(comp.props.foo).toBe("bar");
		expect(comp.rawText).toBe("");
		expect(comp.childBlocks).toEqual([]);
	});

	it("keeps ids unique and stable across nesting", () => {
		const src = `Intro.

<RiskCard severity="high">
Inner prose.

<RiskCard severity="low">Deep.</RiskCard>
</RiskCard>

Outro.`;
		const parsed = parsePlanMdx(src);
		const ids: string[] = [];
		const collect = (blocks: typeof parsed.blocks) => {
			for (const b of blocks) {
				ids.push(b.id);
				if (b.kind === "component") collect(b.childBlocks);
			}
		};
		collect(parsed.blocks);
		expect(new Set(ids).size).toBe(ids.length);
		// Outer RiskCard gets its id before its children (document order).
		expect(parsed.blocks.map((b) => b.id)).toEqual(["b0", "b1", "b5"]);
	});

	it("treats a boolean/valueless attribute as the string 'true'", () => {
		const parsed = parsePlanMdx("<FileMap compact />");
		const comp = parsed.blocks.find((b) => b.kind === "component");
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("FileMap");
		expect(comp.props.compact).toBe("true");
	});

	it("drops expression-valued attributes (no JS evaluation)", () => {
		const parsed = parsePlanMdx("<RiskCard severity={x} />");
		const comp = parsed.blocks.find((b) => b.kind === "component");
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("RiskCard");
		expect(comp.props.severity).toBeUndefined();
	});

	it("does not let a body horizontal rule break frontmatter", () => {
		const src = `---
title: Has Rule
---

Intro paragraph.

---

After the rule.`;
		const parsed = parsePlanMdx(src);
		expect(parsed.frontmatter.title).toBe("Has Rule");
		const proseTexts = parsed.blocks
			.filter((b) => b.kind === "prose")
			.map((b) => (b.kind === "prose" ? b.markdown : ""));
		expect(proseTexts.join("\n")).toContain("Intro paragraph.");
		expect(proseTexts.join("\n")).toContain("After the rule.");
	});

	it("assigns stable sequential ids in document order", () => {
		const src = `First.

<RiskCard severity="low">note</RiskCard>

Second.`;
		const parsed = parsePlanMdx(src);
		// b0 = First, b1 = RiskCard, b2 = RiskCard's child prose ("note"),
		// b3 = Second — the counter is shared across recursion.
		expect(parsed.blocks.map((b) => b.id)).toEqual(["b0", "b1", "b3"]);
	});

	it("still parses components when an agent leaks tool-call wrapper tags", () => {
		// A `Write` call whose closing tags leaked into the saved plan body. The
		// stray `</content></invoke>` make remark-mdx throw on a closing tag with
		// no opener; without scrubbing them the WHOLE plan falls back to plain
		// Markdown and the canvas never renders.
		const src = [
			"---",
			'title: "Leaked"',
			"status: draft",
			"---",
			"",
			"Intro.",
			"",
			'<PlanCanvas theme="repo">',
			'<CanvasNode id="a" title="A">body</CanvasNode>',
			"</PlanCanvas>",
			"",
			"## Verification",
			"- Confirm it works.",
			"</content>",
			"</invoke>",
		].join("\n");

		const parsed = parsePlanMdx(src);
		const canvas = parsed.blocks.find(
			(b) => b.kind === "component" && b.name === "PlanCanvas",
		);
		expect(canvas?.kind).toBe("component");
		// The stray wrapper tags are gone, not rendered as prose.
		const prose = parsed.blocks
			.filter((b) => b.kind === "prose")
			.map((b) => (b.kind === "prose" ? b.markdown : ""))
			.join("\n");
		expect(prose).not.toContain("</invoke>");
		expect(prose).not.toContain("</content>");
	});
});

describe("PlanCanvas structured parsing", () => {
	it("recurses into PlanCanvas/CanvasNode children", () => {
		const src = [
			"---",
			'title: "T"',
			"status: draft",
			'summary: "S"',
			"---",
			"",
			'<PlanCanvas direction="TB">',
			'<CanvasNode id="a" title="A" connects="b">',
			"Body of A",
			"</CanvasNode>",
			'<CanvasNode id="b" title="B" />',
			"</PlanCanvas>",
			"",
		].join("\n");

		const { blocks } = parsePlanMdx(src);
		const canvas = blocks.find(
			(b) => b.kind === "component" && b.name === "PlanCanvas",
		);
		expect(canvas).toBeDefined();
		if (canvas?.kind !== "component") throw new Error("expected component");
		const nodes = canvas.childBlocks.filter(
			(b) => b.kind === "component" && b.name === "CanvasNode",
		);
		expect(nodes).toHaveLength(2);
		const first = nodes[0];
		if (first.kind !== "component") throw new Error("expected component");
		expect(first.props.id).toBe("a");
		expect(first.props.connects).toBe("b");
		expect(first.childBlocks.some((c) => c.kind === "prose")).toBe(true);
	});

	it("masks and reattaches a Preview/Wireframe nested inside a CanvasNode", () => {
		const src = [
			"---",
			'title: "T"',
			"status: draft",
			'summary: "S"',
			"---",
			"",
			'<PlanCanvas theme="wireframe">',
			'<CanvasNode id="login" title="Sign in" x="40" y="80">',
			"<Wireframe>",
			"section",
			"  field Email",
			"  button Continue",
			"</Wireframe>",
			"</CanvasNode>",
			'<CanvasNode id="home" title="Home" x="460" y="80">',
			"<Preview>",
			"function App() {",
			"  return <div onClick={() => {}}>hi</div>",
			"}",
			"</Preview>",
			"</CanvasNode>",
			"</PlanCanvas>",
			"",
		].join("\n");

		const { blocks } = parsePlanMdx(src);
		const canvas = blocks.find(
			(b) => b.kind === "component" && b.name === "PlanCanvas",
		);
		if (canvas?.kind !== "component") throw new Error("expected component");
		const nodes = canvas.childBlocks.filter(
			(b) => b.kind === "component" && b.name === "CanvasNode",
		);
		expect(nodes).toHaveLength(2);

		const login = nodes[0];
		if (login.kind !== "component") throw new Error("expected component");
		const wireframe = login.childBlocks.find(
			(c) => c.kind === "component" && c.name === "Wireframe",
		);
		if (wireframe?.kind !== "component") throw new Error("expected wireframe");
		// The raw masker lifted the body verbatim despite the nesting depth.
		expect(wireframe.rawText).toContain("field Email");
		expect(wireframe.rawText).toContain("button Continue");

		const home = nodes[1];
		if (home.kind !== "component") throw new Error("expected component");
		const preview = home.childBlocks.find(
			(c) => c.kind === "component" && c.name === "Preview",
		);
		if (preview?.kind !== "component") throw new Error("expected preview");
		// The JS body (which would crash acorn) survived masking intact.
		expect(preview.rawText).toContain("function App()");
		expect(preview.rawText).toContain("onClick={() => {}}");
	});

	it("parses self-closing CanvasFlow and CanvasGroup with their props", () => {
		const src = [
			"---",
			'title: "T"',
			"status: draft",
			'summary: "S"',
			"---",
			"",
			'<PlanCanvas theme="wireframe">',
			'<CanvasGroup id="auth" title="Onboarding" contains="login,home" />',
			'<CanvasNode id="login" title="Sign in" x="40" y="80" />',
			'<CanvasNode id="home" title="Home" x="460" y="80" />',
			'<CanvasFlow from="login" to="home" label="Submit" kind="primary" />',
			"</PlanCanvas>",
			"",
		].join("\n");

		const { blocks } = parsePlanMdx(src);
		const canvas = blocks.find(
			(b) => b.kind === "component" && b.name === "PlanCanvas",
		);
		if (canvas?.kind !== "component") throw new Error("expected component");
		const flow = canvas.childBlocks.find(
			(b) => b.kind === "component" && b.name === "CanvasFlow",
		);
		if (flow?.kind !== "component") throw new Error("expected flow");
		expect(flow.props).toMatchObject({
			from: "login",
			to: "home",
			label: "Submit",
			kind: "primary",
		});
		const group = canvas.childBlocks.find(
			(b) => b.kind === "component" && b.name === "CanvasGroup",
		);
		if (group?.kind !== "component") throw new Error("expected group");
		expect(group.props.contains).toBe("login,home");
	});
});
