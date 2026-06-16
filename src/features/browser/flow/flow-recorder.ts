/**
 * Pure flow-recording reducer + repro-step serialization.
 *
 * Records clicks/inputs/navigation reported by the bridge `flow-event` message
 * into an ordered `FlowStep[]`, then serializes them into numbered repro steps
 * attachable to the composer. No DOM, no I/O — unit-tested DOM-free.
 */
import type { BridgeToHostMessage } from "../bridge/channel";

export type FlowStep = {
	eventType: "click" | "input" | "change" | "navigate";
	/** Selector for element events; the path/url for navigate events. */
	selector: string;
	/** Typed text for input/change events; undefined otherwise. */
	value: string | undefined;
};

type FlowEventMessage = Extract<BridgeToHostMessage, { kind: "flow-event" }>;

/** Build a `FlowStep` from a bridge `flow-event` message. */
export function flowStepFromEvent(message: FlowEventMessage): FlowStep {
	return {
		eventType: message.eventType,
		selector: message.target.selector,
		value: message.data,
	};
}

/** Append a step, returning a NEW list (input never mutated). */
export function appendFlowStep(steps: FlowStep[], step: FlowStep): FlowStep[] {
	return [...steps, step];
}

function renderStep(step: FlowStep): string {
	switch (step.eventType) {
		case "click":
			return `Click \`${step.selector}\``;
		case "input":
		case "change":
			return `Type "${step.value ?? ""}" into \`${step.selector}\``;
		case "navigate":
			return `Navigate to \`${step.selector}\``;
	}
}

/** Render an ordered numbered repro-step block for the composer. */
export function serializeFlowSteps(steps: FlowStep[]): string {
	if (steps.length === 0) return "Repro steps: (none recorded)";
	const lines = steps.map((s, i) => `${i + 1}. ${renderStep(s)}`);
	return ["Repro steps:", ...lines].join("\n");
}
