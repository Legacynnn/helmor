import { describe, expect, it } from "vitest";
import {
	isBridgeToHostMessage,
	isHostToBridgeMessage,
	parseHostToBridgeMessage,
} from "./channel";

describe("flow + reload bridge variants", () => {
	it("accepts a reload-detected page→host message", () => {
		expect(isBridgeToHostMessage({ kind: "reload-detected" })).toBe(true);
	});

	it("accepts a flow-event page→host message", () => {
		expect(
			isBridgeToHostMessage({
				kind: "flow-event",
				eventType: "click",
				target: {
					selector: "#go",
					outerHTML: "<button id=go>Go</button>",
					rect: { x: 0, y: 0, width: 10, height: 10 },
				},
			}),
		).toBe(true);
	});

	it("accepts a set-flow-recording host→page message", () => {
		expect(
			isHostToBridgeMessage({ kind: "set-flow-recording", enabled: true }),
		).toBe(true);
		expect(
			parseHostToBridgeMessage('{"kind":"set-flow-recording","enabled":false}'),
		).toEqual({ kind: "set-flow-recording", enabled: false });
	});
});
