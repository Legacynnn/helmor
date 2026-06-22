import { describe, expect, it } from "vitest";
import { NODE_SIZE, normalizeKind } from "./node-kinds";

describe("normalizeKind", () => {
	it("passes through a known kind", () => {
		expect(normalizeKind("resume")).toBe("resume");
	});

	it("defaults unknown or undefined to note", () => {
		expect(normalizeKind("bogus")).toBe("note");
		expect(normalizeKind(undefined)).toBe("note");
	});
});

describe("NODE_SIZE", () => {
	it("sizes every kind, with resume wider than note", () => {
		expect(NODE_SIZE.note.width).toBeGreaterThan(0);
		expect(NODE_SIZE.resume.width).toBeGreaterThan(NODE_SIZE.note.width);
	});
});
