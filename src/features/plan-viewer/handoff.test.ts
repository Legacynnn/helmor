import { describe, expect, it } from "vitest";
import { buildHandoffPrompt } from "./handoff";

describe("buildHandoffPrompt", () => {
	it("references the plan file path", () => {
		const prompt = buildHandoffPrompt("my-feature");
		expect(prompt).toContain(".helmor/plans/my-feature.mdx");
	});

	it("tells the agent to read the plan first", () => {
		const prompt = buildHandoffPrompt("my-feature").toLowerCase();
		expect(prompt).toContain("read");
	});

	it("instructs the agent to implement the plan", () => {
		const prompt = buildHandoffPrompt("my-feature").toLowerCase();
		expect(prompt).toContain("implement");
	});

	it("instructs the agent to keep the plan file updated", () => {
		const prompt = buildHandoffPrompt("my-feature").toLowerCase();
		expect(prompt).toContain("keep");
		expect(prompt).toContain("updated");
	});
});
