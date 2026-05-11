import { describe, expect, it } from "vitest";
import type { GhIssue } from "@/lib/api";
import { ghIssueToItem } from "./github-issue";

const sampleIssue: GhIssue = {
	number: 7,
	title: "Bug",
	url: "https://github.com/x/r/issues/7",
	state: "OPEN",
	updatedAt: "2026-03-23T10:00:00Z",
	author: { login: "dan" },
	assignees: [],
	labels: [{ name: "bug", color: "d73a4a" }],
};

describe("ghIssueToItem", () => {
	it("maps an open issue", () => {
		const item = ghIssueToItem(sampleIssue);
		expect(item.key).toBe("issue:7");
		expect(item.displayId).toBe("#7");
		expect(item.source).toBe("github-issue");
		expect(item.status.key).toBe("open");
		expect(item.labels).toEqual([{ name: "bug", color: "#d73a4a" }]);
	});

	it("classifies closed issues", () => {
		const item = ghIssueToItem({ ...sampleIssue, state: "CLOSED" });
		expect(item.status.key).toBe("closed");
	});
});
