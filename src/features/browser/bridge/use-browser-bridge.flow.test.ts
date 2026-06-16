import { describe, expect, it } from "vitest";
import { emptyBridgeState, ingestMessage } from "./use-browser-bridge";

describe("ingestMessage — flow + reload", () => {
	it("appends a flow-event into flowSteps", () => {
		const next = ingestMessage(emptyBridgeState(), {
			kind: "flow-event",
			eventType: "click",
			target: {
				selector: "#go",
				outerHTML: "<x/>",
				rect: { x: 0, y: 0, width: 1, height: 1 },
			},
		});
		expect(next.flowSteps).toEqual([
			{ eventType: "click", selector: "#go", value: undefined },
		]);
	});

	it("bumps reloadNonce on reload-detected", () => {
		const a = emptyBridgeState();
		const b = ingestMessage(a, { kind: "reload-detected" });
		expect(b.reloadNonce).toBe(a.reloadNonce + 1);
	});

	it("does not mutate the input state", () => {
		const a = emptyBridgeState();
		ingestMessage(a, { kind: "reload-detected" });
		expect(a.reloadNonce).toBe(0);
	});
});
