import { describe, expect, it } from "vitest";
import { agentControlReducer, emptyAgentControl } from "./use-agent-control";

describe("agentControlReducer", () => {
	it("marks a workspace controlled on start and clears on end", () => {
		let s = emptyAgentControl();
		s = agentControlReducer(s, { type: "start", workspaceId: "ws1" });
		expect(s.controlled.has("ws1")).toBe(true);
		s = agentControlReducer(s, { type: "end", workspaceId: "ws1" });
		expect(s.controlled.has("ws1")).toBe(false);
	});
});
