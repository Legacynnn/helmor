import { describe, expect, it } from "vitest";
import {
	appendFlowStep,
	type FlowStep,
	flowStepFromEvent,
	serializeFlowSteps,
} from "./flow-recorder";

const sel = (selector: string) => ({
	selector,
	outerHTML: "<x/>",
	rect: { x: 0, y: 0, width: 1, height: 1 },
});

describe("flowStepFromEvent", () => {
	it("builds a click step from a flow-event", () => {
		expect(
			flowStepFromEvent({
				kind: "flow-event",
				eventType: "click",
				target: sel("#submit"),
			}),
		).toEqual({ eventType: "click", selector: "#submit", value: undefined });
	});

	it("carries input value", () => {
		expect(
			flowStepFromEvent({
				kind: "flow-event",
				eventType: "input",
				target: sel("#email"),
				data: "a@b.com",
			}),
		).toEqual({ eventType: "input", selector: "#email", value: "a@b.com" });
	});
});

describe("appendFlowStep", () => {
	it("appends without mutating the input list", () => {
		const a: FlowStep[] = [];
		const b = appendFlowStep(a, {
			eventType: "click",
			selector: "#a",
			value: undefined,
		});
		expect(b).toHaveLength(1);
		expect(a).toHaveLength(0);
	});
});

describe("serializeFlowSteps", () => {
	it("renders numbered repro steps", () => {
		const steps: FlowStep[] = [
			{ eventType: "click", selector: "#login", value: undefined },
			{ eventType: "input", selector: "#email", value: "a@b.com" },
			{ eventType: "navigate", selector: "/dashboard", value: undefined },
		];
		expect(serializeFlowSteps(steps)).toBe(
			[
				"Repro steps:",
				"1. Click `#login`",
				'2. Type "a@b.com" into `#email`',
				"3. Navigate to `/dashboard`",
			].join("\n"),
		);
	});

	it("returns an empty marker for no steps", () => {
		expect(serializeFlowSteps([])).toBe("Repro steps: (none recorded)");
	});
});
