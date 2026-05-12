import { describe, expect, it } from "vitest";
import type { LinearIssue } from "@/lib/api";
import { linearIssueToItem } from "./linear";

const sample: LinearIssue = {
	id: "i1",
	identifier: "SUPER-187",
	title: "Fix something",
	url: "https://linear.app/x/issue/SUPER-187",
	priority: 1,
	updatedAt: "2026-03-23T10:00:00Z",
	state: {
		id: "s1",
		name: "In Progress",
		type: "started",
		color: "#5e6ad2",
	},
	assignee: {
		id: "u1",
		name: "Dan",
		avatarUrl: "https://example.com/dan.png",
	},
	labels: { nodes: [{ id: "l1", name: "bug", color: "#eb5757" }] },
};

describe("linearIssueToItem", () => {
	it("maps a fully populated Linear issue", () => {
		const item = linearIssueToItem(sample);
		expect(item.key).toBe("i1");
		expect(item.displayId).toBe("SUPER-187");
		expect(item.source).toBe("linear");
		expect(item.title).toBe("Fix something");
		expect(item.status.key).toBe("started");
		expect(item.status.label).toBe("In Progress");
		expect(item.priority).toBe("urgent");
		expect(item.labels).toEqual([{ name: "bug", color: "#eb5757" }]);
		expect(item.assignee?.login).toBe("Dan");
		expect(item.url).toBe(sample.url);
	});

	it("handles null assignee, empty labels, and zero priority", () => {
		const item = linearIssueToItem({
			...sample,
			assignee: null,
			labels: { nodes: [] },
			priority: 0,
		});
		expect(item.assignee).toBeUndefined();
		expect(item.labels).toEqual([]);
		expect(item.priority).toBe("none");
	});
});
