import { describe, expect, it } from "vitest";
import { extractLocalhostPorts, isDevServerUrl } from "./detect-ports";

describe("extractLocalhostPorts", () => {
	it("pulls explicit localhost / 127.0.0.1 ports", () => {
		expect(
			extractLocalhostPorts(
				"vite --host localhost:5173 & serve 127.0.0.1:8080",
			),
		).toEqual([5173, 8080]);
	});

	it("pulls bare common dev ports", () => {
		expect(extractLocalhostPorts("next dev -p 3000")).toEqual([3000]);
	});

	it("dedupes and ignores non-dev numbers", () => {
		expect(extractLocalhostPorts("PORT=5173 vite localhost:5173")).toEqual([
			5173,
		]);
	});

	it("returns empty for commands without ports", () => {
		expect(extractLocalhostPorts("bun run build")).toEqual([]);
	});
});

describe("isDevServerUrl", () => {
	it("matches a url whose port is a known dev port", () => {
		expect(isDevServerUrl("http://localhost:5173/path", [5173])).toBe(true);
		expect(isDevServerUrl("http://localhost:9999/", [5173])).toBe(false);
		expect(isDevServerUrl("https://example.com", [5173])).toBe(false);
	});
});
