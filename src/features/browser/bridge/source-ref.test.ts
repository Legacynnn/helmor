import { describe, expect, it } from "vitest";
import { parseSourceRef, readSourceRef } from "./source-ref";

describe("parseSourceRef", () => {
	it("parses file:line:col", () => {
		expect(parseSourceRef("src/App.tsx:12:4")).toEqual({
			path: "src/App.tsx",
			line: 12,
			column: 4,
		});
	});

	it("parses file:line without column", () => {
		expect(parseSourceRef("src/App.tsx:12")).toEqual({
			path: "src/App.tsx",
			line: 12,
			column: undefined,
		});
	});

	it("returns null for a bare path", () => {
		expect(parseSourceRef("src/App.tsx")).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(parseSourceRef("")).toBeNull();
	});
});

describe("readSourceRef", () => {
	const elWith = (attrs: Record<string, string>): Element =>
		({ getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Element;

	it("reads data-source", () => {
		expect(readSourceRef(elWith({ "data-source": "src/A.tsx:3:1" }))).toEqual({
			path: "src/A.tsx",
			line: 3,
			column: 1,
		});
	});

	it("falls back across attributes in priority order", () => {
		expect(readSourceRef(elWith({ "data-source-loc": "src/B.tsx:9" }))).toEqual(
			{ path: "src/B.tsx", line: 9, column: undefined },
		);
	});

	it("returns null when no source attribute resolves", () => {
		expect(readSourceRef(elWith({ class: "x" }))).toBeNull();
	});
});
