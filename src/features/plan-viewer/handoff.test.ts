import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_PREFILLED_SESSION_EVENT } from "@/lib/session-events";
import {
	buildHandoffPrompt,
	buildImplementPrompt,
	dispatchHandoffSession,
	HANDOFF_INTRO,
} from "./handoff";

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

describe("buildImplementPrompt", () => {
	it("references the MDX plan file path", () => {
		const prompt = buildImplementPrompt("my-feature");
		expect(prompt).toContain(".helmor/plans/my-feature.mdx");
	});

	it("instructs the agent to implement the plan", () => {
		const prompt = buildImplementPrompt("my-feature").toLowerCase();
		expect(prompt).toContain("implement");
	});

	it("instructs the agent to keep the plan file updated", () => {
		const prompt = buildImplementPrompt("my-feature").toLowerCase();
		expect(prompt).toContain("keep the plan file updated");
	});
});

describe("dispatchHandoffSession", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fires the create-prefilled-session event with the handoff payload", () => {
		const spy = vi.spyOn(window, "dispatchEvent");

		dispatchHandoffSession("ws1", "demo");

		expect(spy).toHaveBeenCalledTimes(1);
		const event = spy.mock.calls[0][0] as CustomEvent;
		expect(event.type).toBe(CREATE_PREFILLED_SESSION_EVENT);
		expect(event.detail.workspaceId).toBe("ws1");
		expect(event.detail.intro).toBe(HANDOFF_INTRO);
		expect(event.detail.body).toBe(buildHandoffPrompt("demo"));
	});
});
