import { describe, expect, it } from "vitest";
import { facetsForProvider } from "./facets";

describe("facetsForProvider", () => {
	it("linear exposes project, assignee, priority, tags", () => {
		const ids = facetsForProvider("linear").map((f) => f.id);
		expect(ids).toEqual(["project", "assignee", "priority", "label"]);
	});

	it("github drops project and priority", () => {
		const ids = facetsForProvider("github").map((f) => f.id);
		expect(ids).toEqual(["assignee", "label"]);
	});
});
