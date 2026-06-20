import { describe, expect, it } from "vitest";
import { parsePlanMdx } from "./parse";

describe("parsePlanMdx", () => {
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

	it("parses a known component block with props and children text", () => {
		const src = `<RiskCard severity="high">
This is **risky** stuff.
</RiskCard>`;
		const parsed = parsePlanMdx(src);
		const comp = parsed.blocks.find((b) => b.kind === "component");
		expect(comp).toBeDefined();
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("RiskCard");
		expect(comp.props.severity).toBe("high");
		expect(comp.children).toContain("This is **risky** stuff.");
	});

	it("parses an unknown component as a component block", () => {
		const parsed = parsePlanMdx('<Unknowny foo="bar" />');
		const comp = parsed.blocks.find((b) => b.kind === "component");
		if (comp?.kind !== "component") throw new Error("expected component");
		expect(comp.name).toBe("Unknowny");
		expect(comp.props.foo).toBe("bar");
		expect(comp.children).toBe("");
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
		expect(parsed.blocks.map((b) => b.id)).toEqual(["b0", "b1", "b2"]);
	});
});
