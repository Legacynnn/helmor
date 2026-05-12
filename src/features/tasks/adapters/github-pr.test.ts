import { describe, expect, it } from "vitest";
import type { GhPr } from "@/lib/api";
import { ghPrToItem } from "./github-pr";

const samplePr: GhPr = {
	number: 42,
	title: "Add feature",
	url: "https://github.com/x/r/pull/42",
	state: "OPEN",
	isDraft: false,
	updatedAt: "2026-03-23T10:00:00Z",
	author: { login: "dan" },
	assignees: [{ login: "dan" }],
	labels: [{ name: "feat", color: "0e8a16" }],
};

describe("ghPrToItem", () => {
	it("maps an open PR", () => {
		const item = ghPrToItem(samplePr);
		expect(item.key).toBe("pr:42");
		expect(item.displayId).toBe("#42");
		expect(item.source).toBe("github-pr");
		expect(item.status.key).toBe("open");
		expect(item.status.label).toBe("Open");
		expect(item.labels).toEqual([{ name: "feat", color: "#0e8a16" }]);
		expect(item.assignee?.login).toBe("dan");
	});

	it("classifies drafts separately", () => {
		expect(ghPrToItem({ ...samplePr, isDraft: true }).status.key).toBe("draft");
	});

	it("falls back to author when no assignees", () => {
		const item = ghPrToItem({ ...samplePr, assignees: [] });
		expect(item.assignee?.login).toBe("dan");
	});

	it("handles no author and no assignees", () => {
		const item = ghPrToItem({ ...samplePr, assignees: [], author: null });
		expect(item.assignee).toBeUndefined();
	});
});
