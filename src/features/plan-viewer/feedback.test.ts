import { describe, expect, it } from "vitest";
import { type BlockComment, buildFeedbackPrompt } from "./feedback";

describe("buildFeedbackPrompt", () => {
	it("references the plan file path", () => {
		const prompt = buildFeedbackPrompt("my-feature", []);
		expect(prompt).toContain(".helmor/plans/my-feature.mdx");
	});

	it("instructs targeted edits with approved components", () => {
		const prompt = buildFeedbackPrompt("my-feature", []);
		expect(prompt.toLowerCase()).toContain("targeted");
		expect(prompt.toLowerCase()).toContain("approved mdx");
	});

	it("includes each block name and comment text", () => {
		const comments: BlockComment[] = [
			{ blockId: "b0", blockName: "Goal", comment: "Tighten the scope." },
			{
				blockId: "b3",
				blockName: "Steps",
				comment: "Split step 2 into two tasks.",
			},
		];
		const prompt = buildFeedbackPrompt("plan-x", comments);
		expect(prompt).toContain(".helmor/plans/plan-x.mdx");
		expect(prompt).toContain("Goal");
		expect(prompt).toContain("Tighten the scope.");
		expect(prompt).toContain("Steps");
		expect(prompt).toContain("Split step 2 into two tasks.");
		expect(prompt).toContain("- [block b0 · Goal] Tighten the scope.");
		expect(prompt).toContain(
			"- [block b3 · Steps] Split step 2 into two tasks.",
		);
	});

	it("ignores blank comments", () => {
		const comments: BlockComment[] = [
			{ blockId: "b0", blockName: "Goal", comment: "   " },
			{ blockId: "b1", blockName: "Risks", comment: "Real comment." },
		];
		const prompt = buildFeedbackPrompt("plan-x", comments);
		expect(prompt).not.toContain("b0");
		expect(prompt).toContain("- [block b1 · Risks] Real comment.");
	});

	it("falls back to a general instruction when all comments are empty", () => {
		const comments: BlockComment[] = [
			{ blockId: "b0", blockName: "Goal", comment: "" },
		];
		const prompt = buildFeedbackPrompt("plan-x", comments);
		expect(prompt).toContain(".helmor/plans/plan-x.mdx");
		expect(prompt.toLowerCase()).toContain("revise the plan");
		expect(prompt).not.toContain("- [block");
	});
});
