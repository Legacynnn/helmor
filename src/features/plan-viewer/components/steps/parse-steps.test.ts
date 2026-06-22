import { describe, expect, it } from "vitest";
import { parseSteps } from "./parse-steps";

describe("parseSteps", () => {
	it("strips ordered and unordered list markers", () => {
		const steps = parseSteps("1. First\n2) Second\n- Third\n* Fourth\n+ Fifth");
		expect(steps.map((s) => s.text)).toEqual([
			"First",
			"Second",
			"Third",
			"Fourth",
			"Fifth",
		]);
		expect(steps.every((s) => s.status === "todo")).toBe(true);
	});

	it("reads done/active/todo status prefixes case-insensitively", () => {
		const steps = parseSteps("done: Built\nactive: Building\nTODO: Backlog");
		expect(steps).toEqual([
			{ status: "done", text: "Built" },
			{ status: "active", text: "Building" },
			{ status: "todo", text: "Backlog" },
		]);
	});

	it("supports a status prefix after a list marker", () => {
		const steps = parseSteps("1. done: Ship it");
		expect(steps).toEqual([{ status: "done", text: "Ship it" }]);
	});

	it("ignores blank lines and marker-only lines", () => {
		expect(parseSteps("\n  \n1.\n- A\n")).toEqual([
			{ status: "todo", text: "A" },
		]);
	});

	it("preserves inline markdown in the text", () => {
		const steps = parseSteps("1. Use **bold** and `code`");
		expect(steps[0].text).toBe("Use **bold** and `code`");
	});
});
