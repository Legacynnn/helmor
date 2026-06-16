import { describe, expect, it } from "vitest";
import { canFallbackToHttp, httpFallbackUrl } from "./https-fallback";

describe("canFallbackToHttp", () => {
	it("allows fallback for an auto-upgraded https URL", () => {
		expect(canFallbackToHttp("https://example.com", true)).toBe(true);
	});

	it("never falls back when the user typed https explicitly", () => {
		expect(canFallbackToHttp("https://example.com", false)).toBe(false);
	});

	it("never falls back for non-https URLs", () => {
		expect(canFallbackToHttp("http://example.com", true)).toBe(false);
		expect(canFallbackToHttp("about:blank", true)).toBe(false);
	});
});

describe("httpFallbackUrl", () => {
	it("downgrades an auto-upgraded https URL to http, preserving host+path", () => {
		expect(httpFallbackUrl("https://example.com:8080/a?q=1", true)).toBe(
			"http://example.com:8080/a?q=1",
		);
	});

	it("returns null for an explicit https URL", () => {
		expect(httpFallbackUrl("https://example.com", false)).toBeNull();
	});

	it("returns null for a non-https URL", () => {
		expect(httpFallbackUrl("http://example.com", true)).toBeNull();
	});
});
